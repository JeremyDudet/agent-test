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
import { config } from "../config";
import { GraphStateManager } from "../utils/graphUtils";
import { handleExpenseProposal } from "../index";
import { LoggingService, LogLevel } from "../services/logging/LoggingService";
import { ExpenseTrackerError, ErrorSeverity, ErrorCodes } from "../utils/error";

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
  private understandingAgent: UnderstandingAgent;
  private actionProposalAgent: ActionProposalAgent;
  private logger: LoggingService;

  constructor() {
    this.stateManager = StateManager.getInstance();
    this.understandingAgent = new UnderstandingAgent();
    this.actionProposalAgent = new ActionProposalAgent();
    this.logger = LoggingService.getInstance();
  }

  private async handlePhaseError(
    phase: string,
    error: unknown,
    context: Record<string, any>
  ): Promise<never> {
    let expenseError: ExpenseTrackerError;

    if (error instanceof ExpenseTrackerError) {
      expenseError = error;
    } else {
      const errorCode =
        phase === "understanding"
          ? ErrorCodes.UNDERSTANDING_FAILED
          : phase === "thinking"
          ? ErrorCodes.THINKING_FAILED
          : phase === "acting"
          ? ErrorCodes.ACTING_FAILED
          : ErrorCodes.MESSAGE_PROCESSING_FAILED;

      expenseError = new ExpenseTrackerError(
        `Failed to process ${phase} phase`,
        errorCode,
        ErrorSeverity.HIGH,
        {
          component: `ExpenseAgent.${phase}`,
          originalError: error instanceof Error ? error.message : String(error),
          ...context,
        }
      );
    }

    this.logger.error(expenseError, "ExpenseAgent");
    throw expenseError;
  }

  async processMessage(message: string): Promise<ActionProposal[]> {
    try {
      this.logger.log(
        LogLevel.INFO,
        "Starting message processing...",
        "ExpenseAgent"
      );

      const graphState = GraphStateManager.getInstance();
      let state = this.stateManager.getState();

      if (state.currentStep === "complete") {
        await graphState.transition("complete", "initial", {});
      }

      // Initialize time context
      const now = new Date();
      const timeContext = {
        now,
        formattedNow: now.toISOString().split("T")[0],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      // Update state with new message
      this.stateManager.updateState({
        messages: [...state.messages, { role: "user", content: message }],
      });

      state = this.stateManager.getState();

      // Process through understanding phase
      const understanding = await this.understandingAgent.understand(
        message,
        state.messages,
        state.context.understanding
      );

      // Add time context to understanding
      const understandingWithTime = {
        ...understanding,
        timeContext,
      };

      // Generate proposals with time context
      const proposals = await this.actionProposalAgent.proposeActions(
        message,
        understandingWithTime
      );

      // Update state with new proposals
      this.stateManager.updateState({
        actionContext: {
          ...state.actionContext,
          proposals: this.deduplicateProposals([
            ...state.actionContext.proposals,
            ...proposals,
          ]),
        },
      });

      return proposals;
    } catch (error) {
      this.logger.error(
        error instanceof ExpenseTrackerError
          ? error
          : new ExpenseTrackerError(
              "Failed to process message",
              ErrorCodes.MESSAGE_PROCESSING_FAILED,
              ErrorSeverity.HIGH,
              {
                component: "ExpenseAgent.processMessage",
                originalError:
                  error instanceof Error ? error.message : String(error),
                message,
              }
            )
      );
      throw error;
    }
  }

  async processAcceptedActions(proposals: ActionProposal[]): Promise<void> {
    try {
      const acceptedProposals = proposals.filter(
        (p) => p.status === "accepted"
      );

      if (acceptedProposals.length === 0) return;

      this.logger.log(
        LogLevel.INFO,
        "Processing accepted actions",
        "ExpenseAgent",
        {
          proposalCount: acceptedProposals.length,
        }
      );

      for (const proposal of acceptedProposals) {
        try {
          switch (proposal.action) {
            case "add_expense":
              await ExpenseTools.addExpense(proposal.parameters);
              this.logger.log(
                LogLevel.INFO,
                "Expense added successfully",
                "ExpenseAgent",
                {
                  proposalId: proposal.id,
                  action: proposal.action,
                }
              );
              break;
            default:
              this.logger.log(
                LogLevel.WARN,
                `Unknown action type: ${proposal.action}`,
                "ExpenseAgent"
              );
          }
        } catch (actionError) {
          throw new ExpenseTrackerError(
            `Failed to process action ${proposal.action}`,
            ErrorCodes.ACTION_PROCESSING_FAILED,
            ErrorSeverity.HIGH,
            {
              component: "ExpenseAgent.processAcceptedActions",
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
      let expenseError: ExpenseTrackerError;

      if (error instanceof ExpenseTrackerError) {
        expenseError = error;
      } else {
        expenseError = new ExpenseTrackerError(
          "Failed to process accepted actions",
          ErrorCodes.ACTION_PROCESSING_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ExpenseAgent.processAcceptedActions",
            originalError:
              error instanceof Error ? error.message : String(error),
            proposalCount: proposals.length,
          }
        );
      }

      this.logger.error(expenseError, "ExpenseAgent");
      throw expenseError;
    }
  }

  private async understand(state: AgentState): Promise<AgentState> {
    try {
      const lastMessage = state.messages[state.messages.length - 1];

      if (!lastMessage) {
        throw new ExpenseTrackerError(
          "No message found to understand",
          ErrorCodes.VALIDATION_FAILED,
          ErrorSeverity.MEDIUM,
          {
            component: "ExpenseAgent.understand",
            messageCount: state.messages.length,
            hasLastMessage: false,
          }
        );
      }

      const understanding = await this.understandingAgent.understand(
        lastMessage.content,
        state.messages
      );

      this.stateManager.updateState({
        context: {
          ...state.context,
          understanding,
        },
      });

      return this.stateManager.getState();
    } catch (error) {
      throw new ExpenseTrackerError(
        "Failed to process understanding phase",
        ErrorCodes.UNDERSTANDING_FAILED,
        ErrorSeverity.HIGH,
        {
          component: "ExpenseAgent.understand",
          originalError: error instanceof Error ? error.message : String(error),
          messageCount: state.messages.length,
          hasLastMessage: !!state.messages[state.messages.length - 1],
          currentStep: state.currentStep,
          hasUnderstanding: !!state.context?.understanding,
        }
      );
    }
  }

  private async think(state: AgentState): Promise<AgentState> {
    try {
      this.logger.log(
        LogLevel.INFO,
        "Generating expense proposals...",
        "ExpenseAgent"
      );
      const lastMessage = state.messages[state.messages.length - 1];

      if (!lastMessage || !state.context.understanding) {
        throw new ExpenseTrackerError(
          "Missing required context for thinking phase",
          ErrorCodes.VALIDATION_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ExpenseAgent.think",
            hasLastMessage: !!lastMessage,
            hasUnderstanding: !!state.context.understanding,
          }
        );
      }

      let proposals: ActionProposal[] = [];

      if (state.context.understanding.intent === "add_expense") {
        proposals = await this.actionProposalAgent.proposeActions(
          lastMessage.content,
          state.context.understanding
        );
        this.logger.log(
          LogLevel.DEBUG,
          "Generated expense proposals",
          "ExpenseAgent",
          {
            proposalCount: proposals.length,
          }
        );
      } else if (state.context.understanding.intent === "need_clarification") {
        this.logger.log(LogLevel.INFO, "Clarification needed", "ExpenseAgent", {
          reason: state.context.understanding.clarificationReason,
        });
      } else {
        this.logger.log(
          LogLevel.INFO,
          "Non-expense intent detected",
          "ExpenseAgent",
          {
            intent: state.context.understanding.intent,
          }
        );
      }

      this.stateManager.updateState({
        actionContext: {
          ...state.actionContext,
          proposals,
          currentInput: lastMessage.content,
        },
      });

      return this.stateManager.getState();
    } catch (error) {
      let expenseError: ExpenseTrackerError;

      if (error instanceof ExpenseTrackerError) {
        expenseError = error;
      } else {
        expenseError = new ExpenseTrackerError(
          "Failed to process thinking phase",
          ErrorCodes.THINKING_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ExpenseAgent.think",
            originalError:
              error instanceof Error ? error.message : String(error),
            understanding: state.context.understanding,
          }
        );
      }

      this.logger.error(expenseError, "ExpenseAgent");
      throw expenseError;
    }
  }

  private async act(state: AgentState): Promise<AgentState> {
    try {
      this.logger.log(LogLevel.DEBUG, "Starting act phase", "ExpenseAgent", {
        proposalCount: state.actionContext.proposals.length,
      });
      return state;
    } catch (error) {
      let expenseError: ExpenseTrackerError;

      if (error instanceof ExpenseTrackerError) {
        expenseError = error;
      } else {
        expenseError = new ExpenseTrackerError(
          "Failed to process acting phase",
          ErrorCodes.ACTING_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ExpenseAgent.act",
            originalError:
              error instanceof Error ? error.message : String(error),
            proposalCount: state.actionContext.proposals.length,
          }
        );
      }

      this.logger.error(expenseError, "ExpenseAgent");
      throw expenseError;
    }
  }

  async processPartialTranscript(text: string): Promise<ActionProposal[]> {
    try {
      const state = this.stateManager.getState();

      if (!text.trim()) return [];

      const hasExpensePattern = /\$?\d+(\.\d{2})?/.test(text);
      if (!hasExpensePattern) return [];

      const now = new Date();
      const timeContext = {
        now,
        formattedNow: now.toISOString().split("T")[0],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const understanding = await this.understandingAgent.understand(
        text,
        state.messages,
        state.context.understanding
      );

      const understandingWithTime = {
        ...understanding,
        timeContext,
      };

      if (understanding.intent !== "add_expense") return [];

      const proposals = await this.actionProposalAgent.proposeActions(
        text,
        understandingWithTime
      );

      this.stateManager.updateState({
        actionContext: {
          ...state.actionContext,
          proposals: this.deduplicateProposals([
            ...state.actionContext.proposals,
            ...proposals,
          ]),
        },
      });

      return proposals;
    } catch (error) {
      this.logger.error(
        error instanceof ExpenseTrackerError
          ? error
          : new ExpenseTrackerError(
              "Failed to process partial transcript",
              ErrorCodes.PARTIAL_PROCESSING_FAILED,
              ErrorSeverity.MEDIUM,
              {
                component: "ExpenseAgent.processPartialTranscript",
                originalError:
                  error instanceof Error ? error.message : String(error),
                transcriptionText: text,
              }
            )
      );
      return [];
    }
  }

  private deduplicateProposals(proposals: ActionProposal[]): ActionProposal[] {
    const uniqueProposals = new Map<string, ActionProposal>();
    proposals.forEach((proposal) => {
      const key = `${proposal.action}-${proposal.parameters.description}`;
      if (!uniqueProposals.has(key)) {
        uniqueProposals.set(key, proposal);
      }
    });
    return Array.from(uniqueProposals.values());
  }
}
