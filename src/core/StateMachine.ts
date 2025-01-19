import { EventEmitter } from "events";
import { ExpenseAgent } from "../core/Agent";
import { AIContextManager } from "../core/AIContextManager";
import { TranscriptionOrderManager } from "../services/transcription/TranscriptionOrderManager";
import { LoggingService, LogLevel } from "../services/logging/LoggingService";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "../utils/error";
import type {
  TranscriptionState,
  TranscriptionContext,
  StateTransition,
  TranscriptionChunk,
} from "../types/stateMachine";

export class TranscriptionStateMachine extends EventEmitter {
  private currentState: TranscriptionState = "LISTENING";
  private context: TranscriptionContext;
  private aiContextManager: AIContextManager;
  private transcriptionOrderManager: TranscriptionOrderManager;
  private logger: LoggingService;

  private readonly CONTEXT_TIMEOUT = 2000; // 2 seconds
  private readonly MIN_CONFIDENCE = 0.85;

  constructor(sessionId: string) {
    super();
    this.context = {
      buffer: "",
      lastActivity: Date.now(),
      proposals: new Set(),
      confidence: 0,
      sessionId,
    };

    this.aiContextManager = new AIContextManager();
    this.transcriptionOrderManager = new TranscriptionOrderManager();
    this.logger = LoggingService.getInstance();
  }

  private readonly transitions: StateTransition[] = [
    {
      from: "LISTENING",
      to: "PROCESSING",
      condition: (ctx) => ctx.buffer.length > 0,
    },
    {
      from: "PROCESSING",
      to: "AWAITING_CONTEXT",
      condition: (ctx) =>
        ctx.buffer.length > 0 &&
        Date.now() - ctx.lastActivity < this.CONTEXT_TIMEOUT,
    },
    {
      from: "AWAITING_CONTEXT",
      to: "PROPOSAL_GENERATION",
      condition: (ctx) => ctx.confidence >= this.MIN_CONFIDENCE,
    },
    {
      from: "PROPOSAL_GENERATION",
      to: "LISTENING",
      condition: () => true,
    },
  ];

  public async addChunk(chunk: TranscriptionChunk): Promise<void> {
    this.context.lastActivity = chunk.timestamp;
    this.context.buffer += " " + chunk.text;
    this.context.buffer = this.context.buffer.trim();

    if (this.currentState === "LISTENING") {
      await this.handleStateTransition("PROCESSING");
    }

    await this.checkTransitions();
  }

  private async handleStateTransition(newState: TranscriptionState) {
    const prevState = this.currentState;
    this.currentState = newState;

    this.logger.log(
      LogLevel.DEBUG,
      `State transition: ${prevState} -> ${newState}`,
      "TranscriptionStateMachine"
    );

    switch (newState) {
      case "PROCESSING":
        await this.processBuffer();
        break;
      case "AWAITING_CONTEXT":
        this.startContextTimeout();
        break;
      case "PROPOSAL_GENERATION":
        await this.generateProposal();
        break;
      case "LISTENING":
        this.resetContext();
        break;
    }
  }

  private async processBuffer(): Promise<void> {
    try {
      await this.aiContextManager.processTranscript(
        this.context.sessionId,
        this.context.buffer
      );

      this.context.confidence = this.aiContextManager.getSessionConfidence(
        this.context.sessionId
      );
      await this.checkTransitions();
    } catch (error) {
      this.handleError(error);
    }
  }

  private startContextTimeout(): void {
    if (this.context.timeoutId) {
      clearTimeout(this.context.timeoutId);
    }

    this.context.timeoutId = setTimeout(async () => {
      if (this.currentState === "AWAITING_CONTEXT") {
        await this.handleStateTransition("PROPOSAL_GENERATION");
      }
    }, this.CONTEXT_TIMEOUT);
  }

  private async generateProposal(): Promise<void> {
    try {
      const agent = new ExpenseAgent();
      const proposals = await agent.processPartialTranscript(
        this.context.buffer
      );

      if (proposals.length > 0) {
        this.emit("proposalsGenerated", proposals);
      }

      await this.handleStateTransition("LISTENING");
    } catch (error) {
      this.handleError(error);
    }
  }

  private async checkTransitions(): Promise<void> {
    const validTransition = this.transitions.find(
      (t) => t.from === this.currentState && t.condition(this.context)
    );

    if (validTransition) {
      await this.handleStateTransition(validTransition.to);
    }
  }

  private resetContext(): void {
    this.context.buffer = "";
    this.context.confidence = 0;
    if (this.context.timeoutId) {
      clearTimeout(this.context.timeoutId);
    }
  }

  private handleError(error: unknown): void {
    this.logger.error(
      error instanceof ExpenseTrackerError
        ? error
        : new ExpenseTrackerError(
            "State machine error",
            ErrorCodes.STATE_MACHINE_ERROR,
            ErrorSeverity.HIGH,
            {
              component: "TranscriptionStateMachine",
              state: this.currentState,
              originalError:
                error instanceof Error ? error.message : String(error),
            }
          )
    );
  }
}
