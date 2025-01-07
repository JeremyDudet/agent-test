export enum ErrorCodes {
  // State Management Errors
  INVALID_STATE = "INVALID_STATE",
  STATE_CHANGE_FAILED = "STATE_CHANGE_FAILED",
  TIME_CONTEXT_FAILED = "TIME_CONTEXT_FAILED",

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
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface ErrorMetadata {
  timestamp: string;
  severity: ErrorSeverity;
  component: string;
  originalError?: Error | unknown;
  state?: Record<string, unknown>;
  context?: Record<string, unknown>;
  proposalId?: string;
  proposalCount?: number;
  action?: string;
  messageCount?: number;
  lastMessage?: string;
  hasLastMessage?: boolean;
  understanding?: unknown;
  hasUnderstanding?: boolean;
  currentStep?: string;
  hasContext?: boolean;
  hasActionContext?: boolean;
  expense?: {
    amount?: number;
    description?: string;
    category_id?: string;
  };
  category?: string;
  description?: string;
  providedParams?: string[];
  input?: string;
  response?: string;
  rawResponse?: unknown;
}

export class ExpenseTrackerError extends Error {
  readonly code: ErrorCodes;
  readonly severity: ErrorSeverity;
  readonly metadata: ErrorMetadata;
  readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCodes,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    metadata: Partial<ErrorMetadata> = {},
    isOperational = true
  ) {
    super(message);
    this.name = "ExpenseTrackerError";
    this.code = code;
    this.severity = severity;
    this.isOperational = isOperational;
    this.metadata = {
      timestamp: new Date().toISOString(),
      severity,
      component: metadata.component || "unknown",
      ...metadata,
    };

    Error.captureStackTrace(this, ExpenseTrackerError);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      metadata: this.metadata,
      stack: this.isOperational ? undefined : this.stack,
    };
  }
}
