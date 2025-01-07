import { EventEmitter } from "events";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "../utils/error";
import type { AgentState } from "../types";

export class StateManager extends EventEmitter {
  private static instance: StateManager;
  private state: AgentState | null = null;
  private stateHistory: AgentState[] = [];
  private readonly MAX_HISTORY = 10;

  private constructor() {
    super();
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  hasState(): boolean {
    return this.state !== null;
  }

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
      context: {
        ...this.state.context,
        ...(updates.context || {}),
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

    this.emit("stateChanged", this.state);
  }

  undoLastChange(): boolean {
    if (this.stateHistory.length > 0) {
      const previousState = this.stateHistory.pop()!;
      this.state = { ...previousState };
      this.emit("stateChanged", this.state);
      return true;
    }
    return false;
  }

  clearActionContext(): void {
    if (!this.state) return;

    this.updateState({
      actionContext: {
        proposals: [],
        currentInput: "",
        isProcessing: false,
      },
    });
  }

  getSnapshot(): string {
    return JSON.stringify(this.state, null, 2);
  }

  reset(): void {
    this.setState({
      messages: [],
      context: {},
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

  onStateChange(callback: (state: AgentState) => void): void {
    this.on("stateChanged", callback);
  }

  offStateChange(callback: (state: AgentState) => void): void {
    this.off("stateChanged", callback);
  }

  debugState(): void {
    console.log("Current State:", this.getSnapshot());
    console.log("State History Length:", this.stateHistory.length);
  }
}

export interface StateManagerEvents {
  stateChanged: (state: AgentState) => void;
  stateReset: () => void;
}
