import { AgentState, Proposal } from '../types';

type StateListener = (state: ClientState) => void;

interface ClientState {
  isProcessing: boolean;
  isListening: boolean;
  isRecording: boolean;
  isInitializing: boolean;
  error: string | null;
  transcriptions: string[];
  proposals: Proposal[];
  messageWindow: {
    processedMessages: { role: string; content: string }[];
    newMessages: { role: string; content: string }[];
  };
  userExpenseCategories: { id: string; name: string; description: string }[];
}

class StateManager {
  private static instance: StateManager;
  private state: ClientState;
  private listeners: Set<StateListener>;

  private constructor() {
    this.listeners = new Set();
    this.state = {
      isProcessing: false,
      isListening: false,
      isRecording: false,
      isInitializing: false,
      error: null,
      transcriptions: [],
      proposals: [],
      messageWindow: {
        processedMessages: [],
        newMessages: [],
      },
      userExpenseCategories: [],
    };
  }

  public static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  // Get the current state
  public getState(): ClientState {
    return { ...this.state };
  }

  // Update state with partial updates
  public updateState(updates: Partial<ClientState>) {
    this.state = {
      ...this.state,
      ...updates,
    };
    this.notifyListeners();
  }

  // Handle server state updates
  public handleServerState(serverState: AgentState) {
    this.updateState({
      isProcessing: serverState.isProcessing,
      proposals: serverState.existingProposals,
      messageWindow: serverState.messageWindow,
      userExpenseCategories: serverState.userExpenseCategories,
    });
  }

  // Add a new transcription
  public addTranscription(transcription: string) {
    this.state.transcriptions = [...this.state.transcriptions, transcription];
    this.notifyListeners();
  }

  // Update proposals
  public updateProposals(proposals: Proposal[]) {
    this.state.proposals = proposals;
    this.notifyListeners();
  }

  // Remove a proposal (e.g., after approval/rejection)
  public removeProposal(proposalId: string | number) {
    this.state.proposals = this.state.proposals.filter(p => p.id !== proposalId);
    this.notifyListeners();
  }

  // Set error state
  public setError(error: string | null) {
    this.state.error = error;
    this.notifyListeners();
  }

  // Reset state (e.g., when stopping recording)
  public reset() {
    this.state = {
      ...this.state,
      isProcessing: false,
      isListening: false,
      isRecording: false,
      isInitializing: false,
      error: null,
      transcriptions: [],
    };
    this.notifyListeners();
  }

  // Subscribe to state changes
  public subscribe(listener: StateListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of state changes
  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()));
  }
}

export const stateManager = StateManager.getInstance(); 