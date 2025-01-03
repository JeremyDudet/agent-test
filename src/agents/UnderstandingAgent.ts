import { OpenAI } from "openai";
import type { Message, UnderstandingContext } from "../types";

export class UnderstandingAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async understand(
    input: string,
    history: Message[],
    currentContext?: UnderstandingContext
  ): Promise<UnderstandingContext> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that understands user intentions regarding expenses.
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
                   }`,
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
      completion.choices[0].message.content || "{}"
    );

    return {
      ...currentContext,
      ...understanding,
      timeContext: currentContext?.timeContext || {
        now: new Date(),
        formattedNow: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  }
}
