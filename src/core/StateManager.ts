import { EventEmitter } from "events";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "../utils/error";
import type {
  Message,
  ExpenseContext,
  AgentStep,
  ToolCall,
  ActionContext,
} from "../types";
import { ExpenseService } from "../services/expense/ExpenseService";

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
}

export interface ExpenseProposal {
  id: string;
  content: string;
  amount: number;
  merchant: string;
  category: ExpenseCategory;
  context: ExpenseContext;
}

export interface MessageWindow {
  processedMessages: Message[]; // Historical messages
  newMessages: Message[]; // Recent/current messages
  windowSize: number; // Max number of messages to keep
}

export interface AgentState {
  isProcessing: boolean;
  messageWindow: MessageWindow;
  existingProposals: ExpenseProposal[];
  currentStep: AgentStep;
  toolCalls: ToolCall[];
  actionContext: ActionContext;
}

export class StateManager extends EventEmitter {
  private static instance: StateManager;
  private state: AgentState | null = null;
  private stateHistory: AgentState[] = [];
  private readonly MAX_HISTORY = 10;
  private readonly DEFAULT_WINDOW_SIZE = 20;

  private constructor() {
    super();
  }

  // get the singleton instance
  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  // check if the state has been initialized
  hasState(): boolean {
    return this.state !== null;
  }

  // get the current state
  getState(): AgentState {
    if (!this.state) {
      throw new ExpenseTrackerError(
        "State not initialized",
        ErrorCodes.INVALID_STATE,
        ErrorSeverity.HIGH,
        {
          component: "StateManager",
          context: { hasState: false },
        }
      );
    }
    return this.state;
  }

  // set the entire state
  setState(newState: AgentState): void {
    if (this.state) {
      this.stateHistory.push({ ...this.state });
      if (this.stateHistory.length > this.MAX_HISTORY) {
        this.stateHistory.shift();
      }
    }

    this.state = { ...newState };
    this.emit("stateChanged", this.state);
  }

  // update just the portion of the state that is passed in
  updateState(updates: Partial<AgentState>): void {
    if (!this.state) {
      throw new Error("State not initialized");
    }

    this.stateHistory.push({ ...this.state });
    if (this.stateHistory.length > this.MAX_HISTORY) {
      this.stateHistory.shift();
    }

    this.state = {
      ...this.state,
      ...updates,
      messageWindow: {
        ...this.state.messageWindow,
        ...(updates.messageWindow || {}),
      },
      actionContext: {
        ...this.state.actionContext,
        ...(updates.actionContext || {}),
        proposals:
          updates.actionContext?.proposals !== undefined
            ? updates.actionContext.proposals
            : this.state.actionContext.proposals,
      },
    };

    // Emit general state change event
    this.emit("stateChanged", this.state);

    // If proposals were updated, emit specific proposals update event
    if (updates.actionContext?.proposals !== undefined) {
      this.emit("proposalsUpdated", {
        proposals: this.state.actionContext.proposals,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // append a message to the processed messages
  appendToProcessedMessages(message: Message): void {
    // Validate state exists
    if (!this.state) {
      return;
    }

    // Ensure arrays exist with default empty arrays
    const currentNewMessages = this.state.messageWindow.newMessages || [];
    const currentProcessedMessages =
      this.state.messageWindow.processedMessages || [];

    // Update state with filtered newMessages and prepended processedMessages
    this.updateState({
      messageWindow: {
        newMessages: currentNewMessages.filter((msg) => msg !== message), // remove the message from the newMessages array
        processedMessages: [message, ...currentProcessedMessages], // add the message to the processedMessages array
        windowSize: this.state.messageWindow.windowSize,
      },
    });
  }

  // fetch the user's expense categories
  async fetchUserExpenseCategories(): Promise<ExpenseCategory[]> {
    return ExpenseService.getCategories();
  }

  // reset the state
  reset(): void {
    this.setState({
      isProcessing: false,
      messageWindow: {
        processedMessages: [],
        newMessages: [],
        windowSize: this.DEFAULT_WINDOW_SIZE,
      },
      existingProposals: [],
      currentStep: "initial",
      toolCalls: [],
      actionContext: {
        proposals: [],
        currentInput: "",
        isProcessing: false,
      },
    });
    this.stateHistory = [];
    this.emit("stateReset");
  }
}
