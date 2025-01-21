import OpenAI from "openai";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "../utils/error";
import type {
  ActionProposal,
  Message,
  TimeContext,
  UnderstandingContext,
} from "../types";
import { v4 as uuidv4 } from "uuid";
import { subMonths, subDays } from "date-fns";
import { ExpenseService } from "../services/expense/ExpenseService";
import { TavilyAPI } from "../services/search/TavilyAPI";
import { StateManager } from "../core/StateManager";

export class ActionProposalAgent {
  private openai: OpenAI;
  private tavilyAPI: TavilyAPI;
  private stateManager: StateManager;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new ExpenseTrackerError(
        "OpenAI API key not configured",
        ErrorCodes.OPENAI_INITIALIZATION_FAILED,
        ErrorSeverity.CRITICAL,
        { component: "ActionProposalAgent" }
      );
    }

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
        console.log(
          "Tavily API key not found, skipping research",
          "ActionProposalAgent"
        );
        return "";
      }

      const searchResults = await this.tavilyAPI.search(
        `${description} expense category type`
      );

      return `Research Results: ${searchResults.results
        .map((result) => result.content)
        .join("\n")}`;
    } catch (error) {
      console.log(
        "Research failed, continuing without research context",
        "ActionProposalAgent",
        {
          description,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return "";
    }
  }

  async proposeActions(
    input: string,
    understanding: UnderstandingContext
  ): Promise<ActionProposal[]> {
    try {
      const { timeContext } = understanding;

      // Get categories with error handling
      let categoryInfo;
      try {
        categoryInfo = await ExpenseService.getCategories();
      } catch (error) {
        throw new ExpenseTrackerError(
          "Failed to fetch expense categories",
          ErrorCodes.TOOL_EXECUTION_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ActionProposalAgent.proposeActions",
            originalError:
              error instanceof Error ? error.message : String(error),
          }
        );
      }

      // Get similar expenses with error handling
      let similarExpensesContext = "";
      if (understanding?.description) {
        try {
          const similarExpenses = await ExpenseService.getSimilarExpenses({
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
          console.log(
            "Failed to fetch similar expenses",
            "ActionProposalAgent",
            {
              description: understanding.description,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      // Get research context if needed
      const researchContext =
        !similarExpensesContext && understanding?.description
          ? await this.researchExpense(understanding.description)
          : "";

      // Call OpenAI API with error handling
      try {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: this.constructPrompt(
                timeContext,
                categoryInfo,
                similarExpensesContext,
                researchContext
              ),
            },
            {
              role: "user",
              content: `Please generate JSON proposals for the following input: ${input}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new ExpenseTrackerError(
            "Empty response from OpenAI",
            ErrorCodes.PROPOSAL_GENERATION_FAILED,
            ErrorSeverity.HIGH,
            {
              component: "ActionProposalAgent.proposeActions",
              input,
            }
          );
        }

        return this.processOpenAIResponse(content, categoryInfo, input);
      } catch (error) {
        if (error instanceof ExpenseTrackerError) throw error;

        throw new ExpenseTrackerError(
          "Failed to generate proposals",
          ErrorCodes.PROPOSAL_GENERATION_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ActionProposalAgent.proposeActions",
            originalError:
              error instanceof Error ? error.message : String(error),
            description: input,
            context: { input },
          }
        );
      }
    } catch (error) {
      console.error(
        error instanceof ExpenseTrackerError
          ? error
          : new ExpenseTrackerError(
              "Failed to propose actions",
              ErrorCodes.PROPOSAL_GENERATION_FAILED,
              ErrorSeverity.HIGH,
              {
                component: "ActionProposalAgent.proposeActions",
                originalError:
                  error instanceof Error ? error.message : String(error),
                input,
              }
            ),
        "ActionProposalAgent"
      );
      throw error;
    }
  }

  private constructPrompt(
    timeContext: TimeContext,
    categoryInfo: any[],
    similarExpensesContext: string,
    researchContext: string
  ): string {
    return `You are an AI assistant that proposes concrete actions based on user input about expenses.
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
${researchContext ? `\nAdditional research context:\n${researchContext}` : ""}`;
  }

  private processOpenAIResponse(
    content: string,
    categoryInfo: any[],
    originalInput: string
  ): ActionProposal[] {
    try {
      const result = JSON.parse(content);
      let proposals: any[] = [];

      // Handle different response formats
      if (result.proposals && Array.isArray(result.proposals)) {
        proposals = result.proposals;
      } else if (result.action === "add_expense") {
        // Handle single proposal format
        proposals = [
          {
            action: "add_expense",
            parameters: {
              date: result.date,
              amount: result.amount,
              category: result.category,
              description: result.description,
            },
            confidence: 1,
            context: {},
            followUp: [],
          },
        ];
      } else if (result.add_expense) {
        // Handle nested format
        proposals = [
          {
            action: "add_expense",
            parameters: {
              date: result.add_expense.date,
              amount: result.add_expense.amount,
              category: result.add_expense.category,
              description: result.add_expense.description,
            },
            confidence: 1,
            context: {},
            followUp: [],
          },
        ];
      } else {
        throw new ExpenseTrackerError(
          "Invalid proposal format from OpenAI",
          ErrorCodes.PROPOSAL_GENERATION_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ActionProposalAgent.processOpenAIResponse",
            rawResponse: content,
          }
        );
      }

      return proposals.map((proposal: any) => {
        if (proposal.parameters?.date) {
          proposal.parameters.date = this.calculateDate(
            proposal.parameters.date
          );
        }

        if (
          proposal.parameters?.category &&
          !proposal.parameters?.isNewCategory
        ) {
          const category = categoryInfo.find(
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
          confidence: proposal.confidence || 1,
          context: proposal.context || {},
          followUp: proposal.followUp || [],
          status: "pending",
          originalText: originalInput,
        };
      });
    } catch (error) {
      if (error instanceof ExpenseTrackerError) throw error;

      throw new ExpenseTrackerError(
        "Failed to process OpenAI response",
        ErrorCodes.PROPOSAL_GENERATION_FAILED,
        ErrorSeverity.HIGH,
        {
          component: "ActionProposalAgent.processOpenAIResponse",
          originalError: error instanceof Error ? error.message : String(error),
          rawResponse: content,
        }
      );
    }
  }
}
