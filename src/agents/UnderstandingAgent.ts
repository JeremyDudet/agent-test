import { OpenAI } from "openai";
import { LoggingService, LogLevel } from "../services/logging/LoggingService";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "../utils/error";
import type { Message, UnderstandingContext } from "../types";

export class UnderstandingAgent {
  private openai: OpenAI;
  private logger: LoggingService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.logger = LoggingService.getInstance();
  }

  async understand(
    input: string,
    history: Message[],
    currentContext?: UnderstandingContext
  ): Promise<UnderstandingContext> {
    try {
      this.logger.log(
        LogLevel.DEBUG,
        "Starting understanding phase",
        "UnderstandingAgent",
        { messageCount: history.length, input }
      );

      if (!input.trim()) {
        throw new ExpenseTrackerError(
          "Empty input provided",
          ErrorCodes.VALIDATION_FAILED,
          ErrorSeverity.MEDIUM,
          {
            component: "UnderstandingAgent.understand",
            messageCount: history.length,
          }
        );
      }

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt(),
          },
          ...history,
          {
            role: "user",
            content: input,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      const understanding = JSON.parse(
        completion.choices[0]?.message?.content || "{}"
      );

      if (!understanding.intent) {
        throw new ExpenseTrackerError(
          "Failed to determine intent",
          ErrorCodes.UNDERSTANDING_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "UnderstandingAgent.understand",
            input,
          }
        );
      }

      return understanding;
    } catch (error) {
      throw new ExpenseTrackerError(
        "OpenAI API call failed",
        ErrorCodes.UNDERSTANDING_FAILED,
        ErrorSeverity.HIGH,
        {
          component: "UnderstandingAgent.understand",
          originalError: error instanceof Error ? error.message : String(error),
          messageCount: history.length,
          input,
        }
      );
    }
  }

  private getSystemPrompt(): string {
    return "You are an AI that helps users understand and categorize their expenses.";
  }
}
