import OpenAI from "openai";
import type { ActionProposal, Message, TimeContext } from "../types";
import { v4 as uuidv4 } from "uuid";
import { subMonths, subDays } from "date-fns";
import { ExpenseTools } from "../services/expense/ExpenseService";

export class ActionProposalAgent {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private calculateDate(relativeDate: string): string {
    if (relativeDate === "today") {
      return new Date().toISOString().split("T")[0];
    }

    const parts = relativeDate.split(" ");
    if (parts.length >= 2) {
      const amount = parseInt(parts[0]);
      const unit = parts[1];
      const now = new Date();

      if (unit.includes("year")) {
        return subMonths(now, amount * 12)
          .toISOString()
          .split("T")[0];
      } else if (unit.includes("month")) {
        return subMonths(now, amount).toISOString().split("T")[0];
      } else if (unit.includes("day")) {
        return subDays(now, amount).toISOString().split("T")[0];
      }
    }

    // If it's already a date string, ensure it's in YYYY-MM-DD format
    try {
      const date = new Date(relativeDate);
      return date.toISOString().split("T")[0];
    } catch {
      return new Date().toISOString().split("T")[0]; // fallback to today
    }
  }

  async proposeActions(
    input: string,
    history: Message[],
    timeContext: TimeContext
  ): Promise<ActionProposal[]> {
    // Get existing categories
    const categories = await ExpenseTools.getCategories();
    const categoryInfo = categories.map((c) => ({
      name: c.name,
      description: c.description || "No description available",
    }));

    const userDate = new Date()
      .toLocaleDateString("en-US", {
        timeZone: timeContext.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .split("/")
      .reverse()
      .join("-");

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that proposes concrete actions based on user input about expenses.
                     Your primary job is to detect when users mention spending money and create expense proposals.
                     
                     IMPORTANT: 
                     - Always create an add_expense proposal when a user mentions spending any amount of money
                     - Current date in user's timezone is: ${userDate}
                     - Always use YYYY-MM-DD format for dates
                     - Available expense categories:
                       ${categoryInfo
                         .map((c) => `- ${c.name}: ${c.description}`)
                         .join("\n           ")}
                     - When categorizing:
                       1. First try to match with an existing category (confidence >= 90%)
                       2. If no category matches with high confidence, suggest a new category
                       3. Try to avoid using categories like "Miscellaneous" or "Other"
                       4. For new categories:
                         - Make them specific but reusable
                         - Provide a clear description of what belongs in this category
                         - Explain why existing categories don't fit
                         - Suggest how the new category could be used for similar future expenses
                     
                     Return your response as a JSON object with the following structure:
                     {
                       "proposals": [
                         {
                           "action": "add_expense",
                           "parameters": {
                             "amount": number,
                             "description": string,
                             "date": string,
                             "category": string,
                             "categoryDescription": string,
                             "isNewCategory": boolean,
                             "categoryReasoning": string
                           },
                           "confidence": number,
                           "context": string,
                           "followUp": string[]
                         }
                       ]
                     }`,
        },
        ...history,
        {
          role: "user",
          content: `Please generate JSON proposals for the following input: ${input}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    return result.proposals.map((proposal: any) => {
      if (proposal.parameters?.date) {
        proposal.parameters.date = this.calculateDate(proposal.parameters.date);
      }

      // Find category ID if it's an existing category
      if (
        proposal.parameters?.category &&
        !proposal.parameters?.isNewCategory
      ) {
        const category = categories.find(
          (c) =>
            c.name.toLowerCase() === proposal.parameters.category.toLowerCase()
        );
        if (category) {
          proposal.parameters.category_id = category.id;
        }
      }

      return {
        id: uuidv4(),
        action: proposal.action,
        parameters: proposal.parameters || {},
        confidence: proposal.confidence,
        context: proposal.context,
        followUp: proposal.followUp || [],
        status: "pending",
        originalText: input,
      };
    });
  }
}
