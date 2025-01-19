import type { UnderstandingContext, ActionProposal } from "../types";

export enum ErrorCodes {
  // State Management Errors
  INVALID_STATE = "INVALID_STATE",
  STATE_CHANGE_FAILED = "STATE_CHANGE_FAILED",
  TIME_CONTEXT_FAILED = "TIME_CONTEXT_FAILED",
  STATE_MACHINE_ERROR = "STATE_MACHINE_ERROR",

  // Initialization Errors
  EVENT_SETUP_FAILED = "EVENT_SETUP_FAILED",
  GRAPH_INITIALIZATION_FAILED = "GRAPH_INITIALIZATION_FAILED",
  OPENAI_INITIALIZATION_FAILED = "OPENAI_INITIALIZATION_FAILED",
  AGENT_INITIALIZATION_FAILED = "AGENT_INITIALIZATION_FAILED",

  // Processing Errors
  MESSAGE_PROCESSING_FAILED = "MESSAGE_PROCESSING_FAILED",
  UNDERSTANDING_FAILED = "UNDERSTANDING_FAILED",
  PROPOSAL_GENERATION_FAILED = "PROPOSAL_GENERATION_FAILED",
  PROPOSAL_LIFECYCLE_FAILED = "PROPOSAL_LIFECYCLE_FAILED",
  THINKING_FAILED = "THINKING_FAILED",
  ACTING_FAILED = "ACTING_FAILED",
  ACTION_PROCESSING_FAILED = "ACTION_PROCESSING_FAILED",
  PARTIAL_PROCESSING_FAILED = "PARTIAL_PROCESSING_FAILED",
  TRANSCRIPTION_FAILED = "TRANSCRIPTION_FAILED",

  // Tool Related Errors
  TOOL_PREPARATION_FAILED = "TOOL_PREPARATION_FAILED",
  TOOL_EXECUTION_FAILED = "TOOL_EXECUTION_FAILED",
  TOOL_VALIDATION_FAILED = "TOOL_VALIDATION_FAILED",

  // Date Related Errors
  DATE_FORMATTING_FAILED = "DATE_FORMATTING_FAILED",
  INVALID_TIME_CONTEXT = "INVALID_TIME_CONTEXT",
  DATE_PARSING_FAILED = "DATE_PARSING_FAILED",

  // Response Generation Errors
  RESPONSE_GENERATION_FAILED = "RESPONSE_GENERATION_FAILED",
  CLARIFICATION_FAILED = "CLARIFICATION_FAILED",

  // Queue Related Errors
  QUEUE_OPERATION_FAILED = "QUEUE_OPERATION_FAILED",
  PROPOSAL_PROCESSING_FAILED = "PROPOSAL_PROCESSING_FAILED",

  // Validation Errors
  VALIDATION_FAILED = "VALIDATION_FAILED",
  INVALID_PROPOSAL = "INVALID_PROPOSAL",
  INVALID_TOOL_CALL = "INVALID_TOOL_CALL",

  SESSION_FINALIZATION_FAILED = "SESSION_FINALIZATION_FAILED",
  CONTEXT_LOADING_FAILED = "CONTEXT_LOADING_FAILED",
  SEMANTIC_ANALYSIS_FAILED = "SEMANTIC_ANALYSIS_FAILED",

  AUDIO_COMPLETION_FAILED = "AUDIO_COMPLETION_FAILED",
  FILE_OPERATION_FAILED = "FILE_OPERATION_FAILED",
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface ErrorMetadata {
  component: string;
  originalError?: string;
  transcriptionText?: string;
  messageCount?: number;
  lastMessage?: string;
  message?: string;
  input?: string;
  understanding?: UnderstandingContext;
  proposals?: ActionProposal[];
  currentStep?: string;
  [key: string]: any;
}

export class ExpenseTrackerError extends Error {
  code: ErrorCodes;
  severity: ErrorSeverity;
  metadata: ErrorMetadata;

  constructor(
    message: string,
    code: ErrorCodes,
    severity: ErrorSeverity,
    metadata: Partial<ErrorMetadata>
  ) {
    super(message);
    this.name = "ExpenseTrackerError";
    this.code = code;
    this.severity = severity;
    this.metadata = {
      component: metadata.component || "unknown",
      ...metadata,
    };
  }
}
