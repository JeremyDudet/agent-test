import type { AgentState, AgentStep } from "../types";
import { StateManager } from "../core/StateManager";

export class GraphStateManager {
  private static instance: GraphStateManager;
  private stateManager: StateManager;

  private validTransitions: Record<AgentStep, AgentStep[]> = {
    initial: ["understanding"],
    understanding: ["thinking", "initial"],
    thinking: ["acting", "understanding"],
    acting: ["complete", "thinking"],
    complete: ["initial"],
  };

  private constructor() {
    this.stateManager = StateManager.getInstance();
  }

  static getInstance(): GraphStateManager {
    if (!GraphStateManager.instance) {
      GraphStateManager.instance = new GraphStateManager();
    }
    return GraphStateManager.instance;
  }

  async transition(
    from: AgentStep,
    to: AgentStep,
    updates: Partial<AgentState> = {}
  ): Promise<AgentState> {
    if (!this.isValidTransition(from, to)) {
      throw new Error(`Invalid state transition from ${from} to ${to}`);
    }

    this.stateManager.updateState({
      ...updates,
      currentStep: to,
    });

    return this.stateManager.getState();
  }

  private isValidTransition(from: AgentStep, to: AgentStep): boolean {
    return this.validTransitions[from]?.includes(to) ?? false;
  }
}
