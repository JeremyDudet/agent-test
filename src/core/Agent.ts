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
  private stateManager: StateManager;
  private actionProposalAgent: ActionProposalAgent;
  private understandingAgent: UnderstandingAgent;

  constructor() {
    this.stateManager = StateManager.getInstance();
    this.actionProposalAgent = new ActionProposalAgent();
    this.understandingAgent = new UnderstandingAgent();
  }

  async processMessage(message: string): Promise<ActionProposal[]> {
    try {
      console.log("Starting message processing...");

      // Get instances of state managers
      const graphState = GraphStateManager.getInstance();
      let state = this.stateManager.getState();

      // Reset state machine if we're in complete state
      // This ensures we start fresh for each new message
      if (state.currentStep === "complete") {
        await graphState.transition("complete", "initial", {});
      }

      // Add the new user message to conversation history
      // This maintains the full context of the conversation
      this.stateManager.updateState({
        messages: [...state.messages, { role: "user", content: message }],
      });

      // Get fresh state after message update
      console.log("Processing through state machine...");
      state = this.stateManager.getState();

      // Phase 1: Understanding
      // Extract intent and key information from the message
      console.log("Running understanding agent...");
      state = await this.understand(state);
      console.log("Understanding complete:", state.context.understanding);

      // Phase 2: Thinking
      // Generate action proposals based on understanding
      console.log("Moving to thinking state...");
      await graphState.transition("understanding", "thinking", {});
      state = await this.think(state);

      // Phase 3: Acting
      // Prepare actions for execution
      console.log("Moving to acting state...");
      await graphState.transition("thinking", "acting", {});
      state = await this.act(state);

      // Complete the state machine cycle
      console.log("Moving to complete state...");
      await graphState.transition("acting", "complete", {});

      // Return the generated proposals for possible execution
      return state.actionContext.proposals;
    } catch (error) {
      // Log and wrap any errors that occur during processing
      console.error("Error details:", error);

      // Throw enhanced error with current state for debugging
      throw new AgentError(
        "Failed to process message",
        ErrorCodes.MESSAGE_PROCESSING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
          state: this.stateManager.getState(),
        }
      );
    }
  }

  async processAcceptedActions(proposals: ActionProposal[]): Promise<void> {
    try {
      // Filter out any proposals that weren't explicitly accepted by the user
      const acceptedProposals = proposals.filter(
        (p) => p.status === "accepted"
      );

      // Early return if no proposals were accepted
      if (acceptedProposals.length === 0) return;

      // Process each accepted proposal sequentially
      for (const proposal of acceptedProposals) {
        try {
          // Route to different handlers based on action type
          switch (proposal.action) {
            case "add_expense":
              // Execute the expense addition through ExpenseTools
              await ExpenseTools.addExpense(proposal.parameters);
              break;
            // Add other action types here as needed
            // e.g., case "update_expense": ...
            default:
              // Log warning for unknown action types
              console.warn(`Unknown action type: ${proposal.action}`);
          }
        } catch (actionError) {
          // Log specific error for the failed action
          console.error(
            `Failed to process action ${proposal.action}:`,
            actionError
          );

          // Wrap and rethrow with additional context about the specific action
          throw new AgentError(
            `Failed to process action ${proposal.action}`,
            ErrorCodes.ACTION_PROCESSING_FAILED,
            {
              proposalId: proposal.id,
              action: proposal.action,
              originalError:
                actionError instanceof Error
                  ? actionError.message
                  : String(actionError),
            }
          );
        }
      }
    } catch (error) {
      // Log the overall processing error
      console.error("Failed to process accepted actions:", error);

      // Wrap and rethrow with general action processing error
      throw new AgentError(
        "Failed to process accepted actions",
        ErrorCodes.ACTION_PROCESSING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async understand(state: AgentState): Promise<AgentState> {
    try {
      // Get the most recent message from the conversation history
      const lastMessage = state.messages[state.messages.length - 1];

      // Validate that we have a message to process
      if (!lastMessage) {
        throw new Error("No message found to understand");
      }

      // Pass the message to the UnderstandingAgent for natural language processing
      // This extracts key information like intent, amounts, dates, etc.
      // The full message history is passed to maintain conversation context
      const understanding = await this.understandingAgent.understand(
        lastMessage.content,
        state.messages
      );

      // Update the state with the new understanding
      // We preserve existing context and merge in the new understanding
      this.stateManager.updateState({
        context: {
          ...state.context,
          understanding,
        },
      });

      // Return the updated state for the next phase
      return this.stateManager.getState();
    } catch (error) {
      // Log any errors that occur during understanding
      console.error("Understanding error:", error);

      // Wrap and rethrow the error with additional context
      // This helps with debugging and error handling in higher levels
      throw new AgentError(
        "Failed to process understanding phase",
        ErrorCodes.UNDERSTANDING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
          message: state.messages[state.messages.length - 1]?.content,
        }
      );
    }
  }

  private async think(state: AgentState): Promise<AgentState> {
    try {
      console.log("Generating expense proposals...");
      const lastMessage = state.messages[state.messages.length - 1];

      // Validate required context exists
      if (!lastMessage || !state.context.understanding) {
        throw new Error("Missing required context for thinking phase");
      }

      // Initialize empty proposals array - will be populated based on intent
      let proposals: ActionProposal[] = [];

      // Route to different handlers based on intent from understanding phase
      if (state.context.understanding.intent === "add_expense") {
        // For expense-related intents, generate action proposals
        proposals = await this.actionProposalAgent.proposeActions(
          lastMessage.content,
          state.context.understanding
        );
      } else if (state.context.understanding.intent === "need_clarification") {
        // For unclear inputs, log the reason why clarification is needed
        // This could be extended to generate clarifying questions
        console.log(
          "Clarification needed:",
          state.context.understanding.clarificationReason
        );
      } else {
        // Log other intents (get_insights, search, question) for future handling
        // This could be extended to handle different types of queries
        console.log(
          "Non-expense intent detected:",
          state.context.understanding.intent
        );
      }

      // Update the state with the results of the thinking phase
      // Even if no proposals were generated, we still update the state
      // to maintain the conversation context
      this.stateManager.updateState({
        actionContext: {
          ...state.actionContext,
          proposals,
          currentInput: lastMessage.content,
        },
      });

      // Return the updated state for the next phase
      return this.stateManager.getState();
    } catch (error) {
      // Log and wrap any errors that occur during the thinking phase
      console.error("Thinking error:", error);
      throw new AgentError(
        "Failed to process thinking phase",
        ErrorCodes.THINKING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
          understanding: state.context.understanding,
        }
      );
    }
  }

  private async act(state: AgentState): Promise<AgentState> {
    try {
      // Just pass through the state for now
      return state;
    } catch (error) {
      console.error("Acting error:", error);
      throw new AgentError(
        "Failed to process acting phase",
        ErrorCodes.ACTING_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
          proposals: state.actionContext.proposals,
        }
      );
    }
  }
}
