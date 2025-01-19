// Types for the state machine
export type TranscriptionState =
  | "LISTENING"
  | "PROCESSING"
  | "AWAITING_CONTEXT"
  | "PROPOSAL_GENERATION";

export interface TranscriptionContext {
  buffer: string;
  lastActivity: number;
  proposals: Set<string>;
  confidence: number;
  sessionId: string;
  timeoutId?: NodeJS.Timeout;
}

export interface StateTransition {
  from: TranscriptionState;
  to: TranscriptionState;
  condition: (context: TranscriptionContext) => boolean;
}

export interface TranscriptionChunk {
  text: string;
  timestamp: number;
  isFinal: boolean;
  confidence: number;
}
