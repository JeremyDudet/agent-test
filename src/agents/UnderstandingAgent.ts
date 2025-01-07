import OpenAI from "openai";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "../utils/error";
import { LoggingService, LogLevel } from "../services/logging/LoggingService";
import type { Message, UnderstandingContext } from "../types";

export class UnderstandingAgent {
  private openai: OpenAI;
  private logger: LoggingService;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new ExpenseTrackerError(
        "OpenAI API key not configured",
        ErrorCodes.OPENAI_INITIALIZATION_FAILED,
        ErrorSeverity.CRITICAL,
        { component: "UnderstandingAgent" }
      );
    }

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

      const completion = await this.openai.chat.completions
        .create({
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
        })
        .catch((error) => {
          throw new ExpenseTrackerError(
            "OpenAI API call failed",
            ErrorCodes.UNDERSTANDING_FAILED,
            ErrorSeverity.HIGH,
            {
              component: "UnderstandingAgent.understand",
              originalError:
                error instanceof Error ? error.message : String(error),
              messageCount: history.length,
              input,
            }
          );
        });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new ExpenseTrackerError(
          "Empty response from OpenAI",
          ErrorCodes.UNDERSTANDING_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "UnderstandingAgent.understand",
            messageCount: history.length,
            input,
          }
        );
      }

      let understanding: UnderstandingContext;
      try {
        understanding = JSON.parse(content);
      } catch (error) {
        throw new ExpenseTrackerError(
          "Failed to parse OpenAI response",
          ErrorCodes.UNDERSTANDING_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "UnderstandingAgent.understand",
            originalError:
              error instanceof Error ? error.message : String(error),
            rawResponse: content,
          }
        );
      }

      // Validate the parsed understanding
      if (!this.isValidUnderstanding(understanding)) {
        throw new ExpenseTrackerError(
          "Invalid understanding format",
          ErrorCodes.UNDERSTANDING_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "UnderstandingAgent.understand",
            understanding,
          }
        );
      }

      this.logger.log(
        LogLevel.INFO,
        "Successfully processed understanding",
        "UnderstandingAgent",
        {
          intent: understanding.intent,
          confidence: understanding.confidence?.understanding,
        }
      );

      return understanding;
    } catch (error) {
      if (error instanceof ExpenseTrackerError) {
        this.logger.error(error, "UnderstandingAgent");
        throw error;
      }

      const wrappedError = new ExpenseTrackerError(
        "Unexpected error during understanding phase",
        ErrorCodes.UNDERSTANDING_FAILED,
        ErrorSeverity.HIGH,
        {
          component: "UnderstandingAgent.understand",
          originalError: error instanceof Error ? error.message : String(error),
          input,
          messageCount: history.length,
        }
      );

      this.logger.error(wrappedError, "UnderstandingAgent");
      throw wrappedError;
    }
  }

  private getSystemPrompt(): string {
    return `You are an AI assistant that understands user intentions regarding expenses.
           Extract basic facts from user input about expenses or queries.
           
           Return your response as a JSON object with the following structure:
           {
             "intent": "add_expense" | "get_insights" | "search" | "question" | "need_clarification",
             "amount": number | null,
             "description": string | null,
             "date": string | null,
             "relativeMonths": number | null,
             "relativeDays": number | null,
             "needsClarification": boolean,
             "clarificationReason": string | null,
             "confidence": {
               "understanding": number
             }
           }`;
  }

  private isValidUnderstanding(
    understanding: any
  ): understanding is UnderstandingContext {
    return (
      understanding &&
      typeof understanding === "object" &&
      typeof understanding.intent === "string" &&
      [
        "add_expense",
        "get_insights",
        "search",
        "question",
        "need_clarification",
      ].includes(understanding.intent) &&
      (understanding.amount === null ||
        typeof understanding.amount === "number") &&
      (understanding.description === null ||
        typeof understanding.description === "string") &&
      (understanding.date === null || typeof understanding.date === "string") &&
      typeof understanding.needsClarification === "boolean" &&
      (understanding.clarificationReason === null ||
        typeof understanding.clarificationReason === "string") &&
      understanding.confidence &&
      typeof understanding.confidence.understanding === "number"
    );
  }
}
