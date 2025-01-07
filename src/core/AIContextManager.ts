import { EventEmitter } from "events";
import { OpenAI } from "openai";
import { StateManager } from "./StateManager";
import { LoggingService, LogLevel } from "../services/logging/LoggingService";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "../utils/error";
import type { UnderstandingContext, Message } from "../types";

export class AIContextManager extends EventEmitter {
  private openai: OpenAI;
  private stateManager: StateManager;
  private logger: LoggingService;
  private sessionContext: Map<
    string,
    {
      transcriptBuffer: string;
      semanticUnits: string[];
      lastAnalysis: number;
      confidence: number;
    }
  > = new Map();

  private readonly MIN_CONFIDENCE_THRESHOLD = 0.85;
  private readonly MIN_ANALYSIS_INTERVAL = 500; // ms

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.stateManager = StateManager.getInstance();
    this.logger = LoggingService.getInstance();
  }

  async initializeSession(sessionId: string): Promise<void> {
    this.sessionContext.set(sessionId, {
      transcriptBuffer: "",
      semanticUnits: [],
      lastAnalysis: Date.now(),
      confidence: 0,
    });

    // Load historical context
    await this.loadHistoricalContext(sessionId);
  }

  private async loadHistoricalContext(sessionId: string): Promise<void> {
    try {
      const state = this.stateManager.getState();
      const messages = state.messages.slice(-5); // Get last 5 messages for context

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content:
              "Analyze the user's expense tracking patterns and preferences from recent interactions.",
          },
          ...messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        ],
        temperature: 0,
      });

      const analysis = completion.choices[0]?.message?.content;
      if (analysis) {
        this.emit("contextLoaded", { sessionId, analysis });
      }
    } catch (error) {
      this.logger.error(
        new ExpenseTrackerError(
          "Failed to load historical context",
          ErrorCodes.CONTEXT_LOADING_FAILED,
          ErrorSeverity.MEDIUM,
          {
            component: "AIContextManager",
            sessionId,
            originalError:
              error instanceof Error ? error.message : String(error),
          }
        )
      );
    }
  }

  async processTranscript(
    sessionId: string,
    transcript: string
  ): Promise<void> {
    const context = this.sessionContext.get(sessionId);
    if (!context) {
      throw new Error(`No context found for session ${sessionId}`);
    }

    context.transcriptBuffer += " " + transcript;
    const now = Date.now();

    // Check if we should analyze the current buffer
    if (
      now - context.lastAnalysis >= this.MIN_ANALYSIS_INTERVAL &&
      context.transcriptBuffer.length > 0
    ) {
      await this.analyzeSemanticCompleteness(sessionId);
    }
  }

  private async analyzeSemanticCompleteness(sessionId: string): Promise<void> {
    const context = this.sessionContext.get(sessionId);
    if (!context) return;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `Analyze if this transcript fragment contains a complete semantic unit about expenses.
                     Return JSON: {
                       "isComplete": boolean,
                       "confidence": number,
                       "expenseContext": object | null
                     }`,
          },
          {
            role: "user",
            content: context.transcriptBuffer,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const analysis = JSON.parse(
        completion.choices[0]?.message?.content || "{}"
      );

      if (
        analysis.isComplete &&
        analysis.confidence > this.MIN_CONFIDENCE_THRESHOLD
      ) {
        context.semanticUnits.push(context.transcriptBuffer);
        context.transcriptBuffer = "";
        context.lastAnalysis = Date.now();
        context.confidence = analysis.confidence;

        if (analysis.expenseContext) {
          this.emit("semanticUnit", {
            sessionId,
            text: context.transcriptBuffer,
            context: analysis.expenseContext,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        new ExpenseTrackerError(
          "Failed to analyze semantic completeness",
          ErrorCodes.SEMANTIC_ANALYSIS_FAILED,
          ErrorSeverity.MEDIUM,
          {
            component: "AIContextManager",
            sessionId,
            originalError:
              error instanceof Error ? error.message : String(error),
          }
        )
      );
    }
  }

  async finalizeSession(sessionId: string): Promise<void> {
    const context = this.sessionContext.get(sessionId);
    if (!context) return;

    try {
      // Process any remaining buffer
      if (context.transcriptBuffer.length > 0) {
        await this.analyzeSemanticCompleteness(sessionId);
      }

      // Final context reconciliation
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content:
              "Review all semantic units and create a coherent final understanding.",
          },
          {
            role: "user",
            content: JSON.stringify(context.semanticUnits),
          },
        ],
        temperature: 0,
      });

      const finalAnalysis = completion.choices[0]?.message?.content;
      if (finalAnalysis) {
        this.emit("sessionComplete", { sessionId, analysis: finalAnalysis });
      }

      // Cleanup
      this.sessionContext.delete(sessionId);
    } catch (error) {
      this.logger.error(
        new ExpenseTrackerError(
          "Failed to finalize session",
          ErrorCodes.SESSION_FINALIZATION_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "AIContextManager",
            sessionId,
            originalError:
              error instanceof Error ? error.message : String(error),
          }
        )
      );
    }
  }
}
