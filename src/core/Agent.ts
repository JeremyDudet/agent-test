// src/agent.ts
import { StateGraph, Annotation } from "@langchain/langgraph";
import { OpenAI } from "openai";
import { ActionProposalAgent } from "../agents/ActionProposalAgent";
import { UnderstandingAgent } from "../agents/UnderstandingAgent";
import { ExpenseTools } from "../services/expense/ExpenseService";
import { format, parseISO, subDays, subMonths } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { StateManager } from "./StateManager";
import type {
  AgentState,
  Message,
  ExpenseContext,
  UnderstandingContext,
  ActionContext,
  ActionProposal,
  AgentStep,
  ToolCall,
  ToolCallStatus,
  AddExpenseParams,
  GetInsightsParams,
  GetSimilarExpensesParams,
  CategorizeExpenseParams,
  ToolParameters,
} from "../types";
import { AgentError, ErrorCodes } from "../utils/error";
import { config } from "../config";
import { GraphStateManager } from "../utils/graphUtils";
import { handleExpenseProposal } from "../index";

// Define state annotation
const StateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (x, y) => x.concat(y),
  }),
  context: Annotation<ExpenseContext>({
    reducer: (_, y) => y,
  }),
  currentStep: Annotation<string>({
    reducer: (_, y) => y,
  }),
  toolCalls: Annotation<any[]>({
    reducer: (_, y) => y,
  }),
  actionContext: Annotation<ActionContext>({
    reducer: (_, y) => y,
  }),
});

export class ExpenseAgent {
  private graph: ReturnType<typeof StateGraph.prototype.compile>;
  private openai: OpenAI;
  private actionProposalAgent: ActionProposalAgent;
  private stateManager: StateManager;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.actionProposalAgent = new ActionProposalAgent();
    this.stateManager = StateManager.getInstance();

    // Initialize graph
    this.graph = this.initializeGraph();
    this.setupEventListeners();
  }

  private initializeGraph(): ReturnType<typeof StateGraph.prototype.compile> {
    try {
      const baseGraph = new StateGraph(StateAnnotation)
        .addNode("proposeActions", this.proposeActions.bind(this))
        .addNode("understand", this.understand.bind(this))
        .addNode("setTimeContext", this.setTimeContext.bind(this))
        .addNode("think", this.think.bind(this))
        .addNode("act", this.act.bind(this))
        .addNode("respond", this.respond.bind(this));

      // Add edges
      baseGraph
        .addEdge("__start__", "proposeActions")
        .addEdge("proposeActions", "understand")
        .addEdge("understand", "setTimeContext")
        .addEdge("setTimeContext", "think")
        .addEdge("think", "act")
        .addEdge("act", "respond")
        .addEdge("respond", "__end__");

      return baseGraph.compile();
    } catch (error) {
      throw new AgentError(
        "Failed to initialize graph",
        ErrorCodes.GRAPH_INITIALIZATION_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private setupEventListeners(): void {
    try {
      // Listen for state changes
      this.stateManager.on("stateChanged", this.handleStateChange.bind(this));

      // Listen for errors
      process.on("uncaughtException", this.handleUncaughtError.bind(this));
      process.on(
        "unhandledRejection",
        this.handleUnhandledRejection.bind(this)
      );
    } catch (error) {
      throw new AgentError(
        "Failed to setup event listeners",
        ErrorCodes.EVENT_SETUP_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async handleStateChange(newState: AgentState): Promise<void> {
    try {
      await this.validateState(newState);

      // Log state transitions for debugging
      if (process.env.DEBUG) {
        console.debug(`State transition: ${newState.currentStep}`);
        console.debug("Context:", newState.context);
      }
    } catch (error) {
      throw new AgentError(
        "State change handler failed",
        ErrorCodes.STATE_CHANGE_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private handleUncaughtError(error: Error): void {
    console.error("Uncaught error:", error);
    this.cleanup();
  }

  private handleUnhandledRejection(reason: any): void {
    console.error("Unhandled rejection:", reason);
    this.cleanup();
  }

  private cleanup(): void {
    try {
      // Remove event listeners
      this.stateManager.removeAllListeners();
      process.removeAllListeners("uncaughtException");
      process.removeAllListeners("unhandledRejection");

      // Reset state
      this.resetState();
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }

  async processMessage(message: string): Promise<ActionProposal[]> {
    try {
      console.log("Starting message processing...");
      const graphState = GraphStateManager.getInstance();
      const currentState = this.stateManager.getState();

      // Initialize with a system message if messages array is empty
      if (currentState.messages.length === 0) {
        console.log("Initializing system message...");
        await graphState.transition("initial", "understanding", {
          messages: [
            {
              role: "system",
              content: "I am an AI assistant helping you track expenses.",
            },
          ],
        });

        // Add the user message to the initialized state
        this.stateManager.updateState({
          messages: [
            ...this.stateManager.getState().messages,
            { role: "user", content: message },
          ],
        });
      } else {
        // For subsequent messages, first transition to understanding directly
        // Get the current step and transition to understanding
        const currentStep = this.stateManager.getState()
          .currentStep as AgentStep;

        // If we're not already in understanding, transition to it
        if (currentStep !== "understanding") {
          await graphState.transition(currentStep, "understanding", {
            messages: [
              ...this.stateManager.getState().messages,
              { role: "user", content: message },
            ],
          });
        } else {
          // If we're already in understanding, just update the messages
          this.stateManager.updateState({
            messages: [
              ...this.stateManager.getState().messages,
              { role: "user", content: message },
            ],
          });
        }
      }

      console.log("Processing through state machine...");
      // Process understanding
      let state = await this.understand(this.stateManager.getState());

      // Check if we need to handle non-expense messages
      if (!state.context.understanding?.intent?.includes("expense")) {
        await graphState.transition("understanding", "initial", {});
        return [];
      }

      // Move to thinking state
      console.log("Moving to thinking state...");
      await graphState.transition("understanding", "thinking", {});
      state = await this.think(this.stateManager.getState());

      // Move to acting state
      console.log("Moving to acting state...");
      await graphState.transition("thinking", "acting", {});
      state = await this.proposeActions(state);

      // Move to complete state
      console.log("Moving to complete state...");
      await graphState.transition("acting", "complete", {});

      return state.actionContext.proposals;
    } catch (error) {
      console.error("Error details:", error);
      throw new AgentError(
        "Failed to process message",
        ErrorCodes.MESSAGE_PROCESSING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  getCurrentState(): AgentState {
    return this.stateManager.getState();
  }

  async processAcceptedActions(proposals: ActionProposal[]) {
    try {
      const graphState = GraphStateManager.getInstance();
      const currentState = this.stateManager.getState();
      const acceptedProposals = proposals.filter(
        (p) => p.status === "accepted" || p.status === "pending"
      );

      // First transition back to initial state
      await graphState.transition(
        currentState.currentStep as AgentStep,
        "initial",
        {}
      );

      for (const proposal of acceptedProposals) {
        if (proposal.action === "add_expense") {
          // Use handleExpenseProposal for expense-related actions
          await handleExpenseProposal(proposal);
        } else {
          // Use the existing proposal lifecycle handler for other actions
          await this.handleProposalLifecycle(proposal);
        }

        // Log success after lifecycle completion
        console.log(`✓ Action completed: ${proposal.parameters.description}`);
      }

      return this.stateManager.getState();
    } catch (error) {
      console.error("Error processing accepted actions:", error);
      throw new AgentError(
        "Failed to process accepted actions",
        ErrorCodes.TOOL_EXECUTION_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async prepareToolCalls(
    proposal: ActionProposal
  ): Promise<ToolCall[]> {
    try {
      const toolCalls: ToolCall[] = [];
      const formattedDate = await this.formatProposalDate(proposal);

      switch (proposal.action) {
        case "add_expense":
          toolCalls.push({
            name: "addExpense",
            arguments: {
              ...proposal.parameters,
              date: formattedDate,
            },
          });
          break;

        case "get_insights":
          toolCalls.push({
            name: "getSpendingInsights",
            arguments: {
              ...proposal.parameters,
              timeframe: proposal.parameters.timeframe || "1month",
            },
          });
          break;

        case "search_similar":
          toolCalls.push({
            name: "getSimilarExpenses",
            arguments: {
              description: proposal.parameters.description,
              limit: proposal.parameters.limit || 5,
            },
          });
          break;

        case "categorize":
          toolCalls.push({
            name: "categorizeExpense",
            arguments: {
              description: proposal.parameters.description,
              amount: proposal.parameters.amount,
            },
          });
          break;

        default:
          throw new Error(`Unknown action type: ${proposal.action}`);
      }

      return toolCalls;
    } catch (error) {
      throw new AgentError(
        "Failed to prepare tool calls",
        ErrorCodes.TOOL_PREPARATION_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async handleToolError(
    error: Error,
    proposal: ActionProposal
  ): Promise<void> {
    const graphState = GraphStateManager.getInstance();
    const currentState = this.stateManager.getState();

    // Add error message to state
    await graphState.transition(
      currentState.currentStep as AgentStep,
      currentState.currentStep as AgentStep,
      {
        messages: [
          ...currentState.messages,
          {
            role: "assistant",
            content: `Failed to process action: ${error.message}`,
          },
        ],
        actionContext: {
          ...currentState.actionContext,
          isProcessing: false,
        },
      }
    );

    // Log error for debugging
    console.error("Tool execution error:", {
      proposal,
      error: error.message,
      stack: error.stack,
    });
  }

  private async validateToolCall(call: ToolCall): Promise<boolean> {
    // Validate tool call structure
    if (!call.name || typeof call.name !== "string") {
      throw new Error("Invalid tool name");
    }

    if (!call.arguments || typeof call.arguments !== "object") {
      throw new Error("Invalid tool arguments");
    }

    // Validate specific tool requirements
    switch (call.name) {
      case "addExpense":
        if (!call.arguments.amount || !call.arguments.description) {
          throw new Error("Missing required fields for addExpense");
        }
        break;

      case "getSpendingInsights":
        if (!call.arguments.timeframe) {
          throw new Error("Missing timeframe for insights");
        }
        break;

      case "getSimilarExpenses":
        if (!call.arguments.description) {
          throw new Error("Missing description for similar expenses");
        }
        break;

      case "categorizeExpense":
        if (!call.arguments.description) {
          throw new Error("Missing description for categorization");
        }
        break;

      default:
        throw new Error(`Unknown tool: ${call.name}`);
    }

    return true;
  }

  private async think(state: AgentState): Promise<AgentState> {
    try {
      const graphState = GraphStateManager.getInstance();
      const currentState = this.stateManager.getState();

      // Only proceed if we have an understanding context
      if (!currentState.context.understanding) {
        throw new Error("No understanding context available");
      }

      // If the intent is add_expense, generate proposals
      if (currentState.context.understanding.intent === "add_expense") {
        console.log("Generating expense proposals...");
        const proposals = await this.actionProposalAgent.proposeActions(
          currentState.messages[currentState.messages.length - 1].content,
          currentState.messages,
          currentState.context.understanding.timeContext
        );

        // Update state with proposals
        this.stateManager.updateState({
          actionContext: {
            ...currentState.actionContext,
            proposals,
            currentInput:
              currentState.messages[currentState.messages.length - 1].content,
          },
        });

        console.log("Generated proposals:", proposals);
      }

      return this.stateManager.getState();
    } catch (error) {
      console.error("Thinking error:", error);
      throw new AgentError(
        "Failed to process thinking phase",
        ErrorCodes.THINKING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async proposeActions(state: AgentState): Promise<AgentState> {
    try {
      const currentState = this.stateManager.getState();
      const lastMessage =
        currentState.messages[currentState.messages.length - 1];

      if (!lastMessage || !currentState.context.understanding) {
        return currentState;
      }

      console.log("Generating expense proposals...");
      const actionProposalAgent = new ActionProposalAgent();
      const proposals = await actionProposalAgent.proposeActions(
        lastMessage.content,
        currentState.messages,
        currentState.context.understanding.timeContext
      );

      console.log("Generated proposals:", proposals);

      // Update state with proposals
      this.stateManager.updateState({
        actionContext: {
          ...currentState.actionContext,
          proposals,
          currentInput: lastMessage.content,
        },
      });

      return this.stateManager.getState();
    } catch (error) {
      console.error("Proposal generation error:", error);
      throw new AgentError(
        "Failed to propose actions",
        ErrorCodes.PROPOSAL_GENERATION_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async setTimeContext(state: typeof StateAnnotation.State) {
    try {
      const graphState = GraphStateManager.getInstance();
      const currentState = this.stateManager.getState();

      // Get user's timezone or fallback to config
      const timeZone =
        currentState.context.timeContext?.timeZone || config.timezone;
      const now = new Date();

      const timeContext = {
        now,
        formattedNow: formatInTimeZone(
          now,
          timeZone,
          "yyyy-MM-dd'T'HH:mm:ssXXX"
        ),
        timeZone,
      };

      // Transition state with new time context
      return graphState.transition(
        currentState.currentStep as AgentStep,
        currentState.currentStep as AgentStep, // Maintain current step
        {
          context: {
            ...currentState.context,
            timeContext,
          },
        }
      );
    } catch (error) {
      throw new AgentError(
        "Failed to set time context",
        ErrorCodes.TIME_CONTEXT_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async understand(state: typeof StateAnnotation.State) {
    try {
      const currentState = this.stateManager.getState();
      const lastMessage =
        currentState.messages[currentState.messages.length - 1];

      if (!lastMessage || lastMessage.role !== "user") {
        return currentState;
      }

      console.log("Running understanding agent...");
      const understandingAgent = new UnderstandingAgent();
      const understanding = await understandingAgent.understand(
        lastMessage.content,
        currentState.messages.slice(0, -1),
        currentState.context as UnderstandingContext
      );

      // Update state with understanding context
      this.stateManager.updateState({
        context: {
          ...currentState.context,
          understanding,
        },
      });

      console.log("Understanding complete:", understanding);
      return this.stateManager.getState();
    } catch (error) {
      console.error("Understanding error:", error);
      if (error instanceof AgentError) throw error;
      throw new AgentError(
        "Failed to understand message",
        ErrorCodes.UNDERSTANDING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async act(state: typeof StateAnnotation.State) {
    try {
      const graphState = GraphStateManager.getInstance();
      const currentState = this.stateManager.getState();
      const toolCalls = currentState.toolCalls;
      const results: ToolCall[] = [];

      for (const call of toolCalls) {
        try {
          const toolName = call.name as keyof typeof ExpenseTools;
          const result = await (ExpenseTools[toolName] as Function)(
            call.arguments
          );
          results.push({
            ...call,
            result,
            status: "success" as ToolCallStatus,
          });
        } catch (error) {
          results.push({
            ...call,
            error: error instanceof Error ? error.message : String(error),
            status: "failed" as ToolCallStatus,
          });
        }
      }

      // For vacuous statements or when no tool calls are needed
      if (results.length === 0) {
        return graphState.transition(
          currentState.currentStep as AgentStep,
          "complete",
          {
            toolCalls: [],
            actionContext: {
              ...currentState.actionContext,
              proposals: [],
            },
          }
        );
      }

      // For actual tool calls
      return graphState.transition(
        currentState.currentStep as AgentStep,
        "complete",
        {
          toolCalls: results,
        }
      );
    } catch (error) {
      throw new AgentError(
        "Failed to execute actions",
        ErrorCodes.TOOL_EXECUTION_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async respond(state: typeof StateAnnotation.State) {
    try {
      const graphState = GraphStateManager.getInstance();
      const currentState = this.stateManager.getState();
      const toolResults = currentState.toolCalls.map((call) => ({
        action: call.name,
        result: call.result || call.error,
        status: call.status,
        parameters: call.arguments,
      }));

      // Generate response based on current state and tool results
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant helping with expense tracking.
                             Summarize the actions taken and their results in a clear, concise way.
                             If there were any errors, explain them in user-friendly terms.
                             Focus on the most important information first.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              context: currentState.context,
              results: toolResults,
              originalMessage: currentState.actionContext.currentInput,
            }),
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const response =
        completion.choices[0].message?.content ||
        "I'm sorry, I couldn't process that properly.";

      // Transition to complete state with new message and clear context
      return graphState.transition(
        currentState.currentStep as AgentStep,
        "complete",
        {
          messages: [
            ...currentState.messages,
            { role: "assistant", content: response },
          ],
          actionContext: {
            proposals: [],
            currentInput: "",
            isProcessing: false,
          },
          toolCalls: [], // Clear tool calls after processing
        }
      );
    } catch (error) {
      throw new AgentError(
        "Failed to generate response",
        ErrorCodes.RESPONSE_GENERATION_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async formatProposalDate(proposal: ActionProposal): Promise<string> {
    try {
      const timeContext =
        this.stateManager.getState().context.understanding?.timeContext;
      if (!timeContext) {
        throw new Error("No time context available");
      }

      // If date is "today", use the current date from timeContext
      if (proposal.parameters.date === "today") {
        const date = new Date(timeContext.now);
        return date.toISOString().split("T")[0]; // Returns YYYY-MM-DD format
      }

      // If a specific date is provided, use that
      if (proposal.parameters.date) {
        return proposal.parameters.date;
      }

      // Default to current date if no date is specified
      const date = new Date(timeContext.now);
      return date.toISOString().split("T")[0];
    } catch (error) {
      throw new AgentError(
        "Failed to format proposal date",
        ErrorCodes.DATE_FORMATTING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async validateState(state: AgentState): Promise<boolean> {
    try {
      // Validate basic state structure
      if (!state.messages || !Array.isArray(state.messages)) {
        throw new Error("Invalid messages array");
      }

      if (!state.context || typeof state.context !== "object") {
        throw new Error("Invalid context object");
      }

      // Validate current step
      const validSteps: AgentStep[] = [
        "initial",
        "understanding",
        "thinking",
        "acting",
        "complete",
      ];
      if (!validSteps.includes(state.currentStep as AgentStep)) {
        throw new Error(`Invalid step: ${state.currentStep}`);
      }

      // Validate action context
      if (!state.actionContext || typeof state.actionContext !== "object") {
        throw new Error("Invalid action context");
      }

      if (!Array.isArray(state.actionContext.proposals)) {
        throw new Error("Invalid proposals array");
      }

      return true;
    } catch (error) {
      throw new AgentError(
        "State validation failed",
        ErrorCodes.INVALID_STATE,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async resetState(): Promise<void> {
    const graphState = GraphStateManager.getInstance();
    await graphState.transition(
      this.stateManager.getState().currentStep as AgentStep,
      "initial",
      {
        messages: [],
        context: {},
        toolCalls: [],
        actionContext: {
          proposals: [],
          currentInput: "",
          isProcessing: false,
        },
      }
    );
  }

  private async handleProposalLifecycle(
    proposal: ActionProposal
  ): Promise<void> {
    try {
      const graphState = GraphStateManager.getInstance();
      const currentState = this.stateManager.getState();

      // First transition to understanding
      await graphState.transition("initial", "understanding", {});

      // Then to thinking
      await graphState.transition("understanding", "thinking", {});

      // Then to acting with the tool calls
      const toolCalls = await this.prepareToolCalls(proposal);
      await graphState.transition("thinking", "acting", {
        toolCalls,
        actionContext: {
          ...currentState.actionContext,
          proposals: [proposal],
          currentInput: proposal.originalText,
          isProcessing: true,
        },
      });

      const results: ToolCall[] = [];

      for (const call of toolCalls) {
        try {
          await this.validateToolCall(call);
          const toolFunction =
            ExpenseTools[call.name as keyof typeof ExpenseTools];
          if (typeof toolFunction !== "function") {
            throw new Error(`Tool ${call.name} is not a function`);
          }

          // Type guard to ensure correct parameters for each tool
          let typedArguments: any;
          switch (call.name) {
            case "addExpense":
              typedArguments = call.arguments as AddExpenseParams;
              break;
            case "getSpendingInsights":
              typedArguments = {
                timeframe: call.arguments.timeframe || "1month",
              };
              break;
            case "getSimilarExpenses":
              typedArguments = {
                description: call.arguments.description,
                limit: call.arguments.limit || 5,
              };
              break;
            case "categorizeExpense":
              typedArguments = {
                description: call.arguments.description,
                amount: call.arguments.amount,
              };
              break;
            default:
              throw new Error(`Unknown tool: ${call.name}`);
          }

          const result = await toolFunction(typedArguments);
          results.push({
            ...call,
            result,
            status: "success" as const,
            executedAt: new Date().toISOString(),
          });
        } catch (error) {
          results.push({
            ...call,
            error: error instanceof Error ? error.message : String(error),
            status: "failed" as const,
          });
          await this.handleToolError(error as Error, proposal);
          throw error;
        }
      }

      // Finally transition to complete with results
      await graphState.transition("acting", "complete", {
        toolCalls: results,
        actionContext: {
          ...currentState.actionContext,
          isProcessing: false,
          currentProposal: null,
          proposalHistory: [
            ...(currentState.actionContext.proposalHistory || []),
            {
              originalState: proposal.status,
              currentState: "complete",
              transitions: results.map((r) => `${r.name}:${r.status}`),
            },
          ],
        },
      });
    } catch (error) {
      throw new AgentError(
        "Failed to handle proposal lifecycle",
        ErrorCodes.PROPOSAL_LIFECYCLE_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
}
