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

export class AgentError extends Error {
  code: ErrorCodes;
  details?: Record<string, any>;

  constructor(
    message: string,
    code: ErrorCodes,
    details?: { originalError?: string; [key: string]: any }
  ) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = details;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }
}
