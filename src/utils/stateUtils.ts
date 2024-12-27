import type {
  AgentState,
  ActionProposal,
  Message,
  StateUpdater,
  ProposalHandler,
  AgentStep,
  TimeContext,
  ActionContext,
} from "../types";
import { StateManager } from "../core/StateManager";
import { config } from "../config";

export class StateUtils {
  private static stateManager = StateManager.getInstance();

  /**
   * Safe state transition with validation
   */
  static async transition(
    currentStep: AgentStep,
    nextStep: AgentStep,
    updates: Partial<AgentState>
  ): Promise<void> {
    const currentState = this.stateManager.getState();

    // Validate transition is allowed
    if (!this.isValidTransition(currentStep, nextStep)) {
      throw new Error(
        `Invalid state transition from ${currentStep} to ${nextStep}`
      );
    }

    // Update state with new step and updates
    this.stateManager.updateState({
      ...updates,
      currentStep: nextStep,
    });
  }

  /**
   * Add a message to the conversation history
   */
  static addMessage(message: Message): void {
    const currentState = this.stateManager.getState();
    this.stateManager.updateState({
      messages: [...currentState.messages, message],
    });
  }

  /**
   * Update proposals with type safety
   */
  static updateProposals(
    updater: (proposals: ActionProposal[]) => ActionProposal[]
  ): void {
    const currentState = this.stateManager.getState();
    const updatedProposals = updater(currentState.actionContext.proposals);

    this.stateManager.updateState({
      actionContext: {
        ...currentState.actionContext,
        proposals: updatedProposals,
      },
    });
  }

  /**
   * Get current time context or create new one
   */
  static getTimeContext(): TimeContext {
    const currentState = this.stateManager.getState();
    return (
      currentState.context.timeContext || {
        now: new Date(),
        formattedNow: new Date().toISOString(),
        timeZone: config.timezone,
      }
    );
  }

  /**
   * Batch update state with multiple changes
   */
  static batchUpdate(updates: StateUpdater[]): void {
    const currentState = this.stateManager.getState();
    const combinedUpdates = updates.reduce(
      (acc, updater) => ({
        ...acc,
        ...updater(currentState),
      }),
      {}
    );

    this.stateManager.updateState(combinedUpdates);
  }

  /**
   * Create a snapshot of current state
   */
  static createSnapshot(): string {
    return this.stateManager.getSnapshot();
  }

  /**
   * Restore state from snapshot
   */
  static restoreSnapshot(snapshot: string): void {
    try {
      const state = JSON.parse(snapshot);
      if (state) {
        this.stateManager.setState(state);
      }
    } catch (error) {
      console.error("Failed to restore state from snapshot:", error);
    }
  }

  /**
   * Validate state transitions
   */
  private static isValidTransition(from: AgentStep, to: AgentStep): boolean {
    const validTransitions: Record<AgentStep, AgentStep[]> = {
      initial: ["understanding"],
      understanding: ["thinking", "initial"],
      thinking: ["acting", "understanding"],
      acting: ["complete", "thinking"],
      complete: ["initial"],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Create middleware for state changes
   */
  static createMiddleware(handler: ProposalHandler) {
    return async (proposal: ActionProposal) => {
      const currentState = this.stateManager.getState();

      try {
        this.stateManager.updateState({
          actionContext: {
            ...currentState.actionContext,
            isProcessing: true,
          },
        });

        await handler(proposal);

        this.stateManager.updateState({
          actionContext: {
            ...currentState.actionContext,
            isProcessing: false,
          },
        });
      } catch (error) {
        this.stateManager.updateState({
          actionContext: {
            ...currentState.actionContext,
            isProcessing: false,
          },
        });
        throw error;
      }
    };
  }

  /**
   * Debug helper
   */
  static debugState(): void {
    console.log("=== State Debug Info ===");
    console.log("Current Step:", this.stateManager.getState().currentStep);
    console.log(
      "Proposals:",
      this.stateManager.getState().actionContext.proposals.length
    );
    console.log("Messages:", this.stateManager.getState().messages.length);
    console.log(
      "Is Processing:",
      this.stateManager.getState().actionContext.isProcessing
    );
    console.log("=====================");
  }
}

export function createInitialState(): AgentState {
  return {
    messages: [],
    context: {},
    currentStep: "initial",
    toolCalls: [],
    actionContext: {
      proposals: [],
      currentInput: "",
      isProcessing: false,
      currentProposal: null,
      proposalHistory: [],
    },
  };
}

export function resetActionContext(): Partial<AgentState> {
  return {
    actionContext: {
      proposals: [],
      currentInput: "",
      isProcessing: false,
      currentProposal: null,
      proposalHistory: [],
    },
  };
}

// Function to update processing state while maintaining other required fields
export function updateProcessingState(
  isProcessing: boolean
): Partial<AgentState> {
  return {
    actionContext: {
      proposals: [],
      currentInput: "",
      isProcessing,
      currentProposal: null,
      proposalHistory: [],
    },
  };
}

// Helper function to merge state updates
export const mergeStates = (
  currentState: AgentState,
  newState: Partial<AgentState>
): AgentState => ({
  ...currentState,
  ...newState,
  context: {
    ...currentState.context,
    ...(newState.context || {}),
  },
  actionContext: {
    ...currentState.actionContext,
    ...(newState.actionContext || {}),
  },
});

// If we need to add a proposal, we can use this function instead
export function addProposalToState(
  state: AgentState,
  proposal: ActionProposal
): Partial<AgentState> {
  return {
    actionContext: {
      ...state.actionContext,
      proposals: [...state.actionContext.proposals, proposal],
      currentInput: state.actionContext.currentInput,
      isProcessing: state.actionContext.isProcessing,
      currentProposal: state.actionContext.currentProposal,
      proposalHistory: state.actionContext.proposalHistory,
    },
  };
}
