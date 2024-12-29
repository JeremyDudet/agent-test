import OpenAI from "openai";
import type {
  ActionProposal,
  Message,
  TimeContext,
  UnderstandingContext,
} from "../types";
import { v4 as uuidv4 } from "uuid";
import { subMonths, subDays } from "date-fns";
import { ExpenseTools } from "../services/expense/ExpenseService";
import { TavilyAPI } from "../services/search/TavilyAPI";
import { StateManager } from "../core/StateManager";

export class ActionProposalAgent {
  private openai: OpenAI;
  private tavilyAPI: TavilyAPI;
  private stateManager: StateManager;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.tavilyAPI = new TavilyAPI();
    this.stateManager = StateManager.getInstance();
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

  private async researchExpense(description: string): Promise<string> {
    try {
      if (!process.env.TAVILY_API_KEY) {
        console.log("Tavily API key not found, skipping research");
        return "";
      }

      const searchResults = await this.tavilyAPI.search(
        `${description} product service what is it used for`
      );

      // Use GPT to analyze the search results
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are an AI that analyzes product/service information to help categorize expenses.
                     Based on the search results, provide a concise summary of what this expense is for.
                     Focus on: what it is, its primary purpose, and typical use cases.
                     Keep the response under 100 words.`,
          },
          {
            role: "user",
            content: JSON.stringify(searchResults),
          },
        ],
        temperature: 0.3,
      });

      const searchResultAnalysis =
        completion.choices[0]?.message?.content || "";

      console.log("Research Results: ", searchResultAnalysis);
      return searchResultAnalysis;
    } catch (error) {
      console.error("Research failed:", error);
      return ""; // Return empty string on failure
    }
  }

  async proposeActions(
    input: string,
    understanding: UnderstandingContext
  ): Promise<ActionProposal[]> {
    // Get existing categories
    const categories = await ExpenseTools.getCategories();
    const categoryInfo = categories.map((c) => ({
      name: c.name,
      description: c.description || "No description available",
    }));

    let similarExpensesContext = "";
    if (understanding?.description) {
      try {
        const similarExpenses = await ExpenseTools.getSimilarExpenses({
          description: understanding.description,
          limit: 3,
        });

        if (similarExpenses?.results?.length > 0) {
          similarExpensesContext =
            "\nSimilar past expenses:\n" +
            similarExpenses.results
              .map(
                (exp: any) =>
                  `- ${exp.description} ($${exp.amount}) categorized as ${exp.category}`
              )
              .join("\n");
        }
      } catch (error) {
        console.error("Failed to fetch similar expenses:", error);
      }
    }

    // Only do research if we have a description but no similar expenses
    let researchContext = "";
    if (understanding?.description && !similarExpensesContext) {
      researchContext = await this.researchExpense(understanding.description);
    }

    // Construct the base prompt
    const basePrompt = `You are an AI assistant that proposes concrete actions based on user input about expenses.
Your primary job is to detect when users mention spending money and create expense proposals.

IMPORTANT: 
- Always create an add_expense proposal when a user mentions spending any amount of money
- Current date in user's timezone is: ${timeContext.formattedNow}
- Always use YYYY-MM-DD format for dates
- NEVER use generic categories like "miscellaneous" or "other" - instead:
  1. Use the research context and similar expenses to understand the expense better
  2. Choose the most specific appropriate category from the available options
  3. If no category fits well, suggest a new specific category with detailed reasoning
- Available expense categories:
  ${categoryInfo.map((c) => `- ${c.name}: ${c.description}`).join("\n  ")}
${
  similarExpensesContext
    ? `\nSimilar past expenses for context:${similarExpensesContext}`
    : ""
}
${researchContext ? `\nAdditional research context:\n${researchContext}` : ""}

When choosing categories:
1. First, consider similar past expenses if available
2. Then, use any research context to understand the expense type
3. Match the expense purpose with the most specific available category
4. If no category fits well, propose a new specific category

You must respond with a JSON object in this exact format:
{
  "proposals": [{
    "action": "add_expense",
    "parameters": {
      "amount": number,
      "description": string,
      "date": string,
      "category": string,
      "isNewCategory": boolean
    },
    "confidence": number,
    "context": string,
    "categoryReasoning": string  // Explain why this category was chosen or why a new category is needed
  }]
}`;

    // Only use the most recent message for proposal generation
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: basePrompt,
      },
      {
        role: "user",
        content: `Please generate JSON proposals for the following input: ${input}`,
      },
    ];

    // Call the OpenAI API to generate proposals
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    // Process the response
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    console.log("OpenAI Response:", content);
    try {
      const result = JSON.parse(content);
      if (!result.proposals || !Array.isArray(result.proposals)) {
        console.error("Invalid response format:", result);
        return [];
      }

      return result.proposals.map((proposal: any) => {
        if (proposal.parameters?.date) {
          proposal.parameters.date = this.calculateDate(
            proposal.parameters.date
          );
        }

        // Find category ID if it's an existing category
        if (
          proposal.parameters?.category &&
          !proposal.parameters?.isNewCategory
        ) {
          const category = categories.find(
            (c) =>
              c.name.toLowerCase() ===
              proposal.parameters.category.toLowerCase()
          );
          if (category) {
            proposal.parameters.category_id = category.id;
          }
        }

        return {
          id: uuidv4(),
          action: proposal.action,
          parameters: {
            ...proposal.parameters,
            categoryReasoning:
              proposal.categoryReasoning || "No category reasoning provided",
          },
          confidence: proposal.confidence,
          context: proposal.context,
          followUp: proposal.followUp || [],
          status: "pending",
          originalText: input,
        };
      });
    } catch (error) {
      console.error("Failed to parse OpenAI response:", error);
      return [];
    }
  }
}
