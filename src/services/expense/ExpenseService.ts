import { format } from "date-fns";
import type { ActionParameters } from "../../types";
import { supabase } from "../database/supabase";
import {
  ExpenseTrackerError,
  ErrorCodes,
  ErrorSeverity,
} from "../../utils/error";
import { LoggingService, LogLevel } from "../logging/LoggingService";

export class ExpenseTools {
  private static logger = LoggingService.getInstance();

  static async addExpense(params: ActionParameters): Promise<any> {
    try {
      // Validate required parameters
      if (!params.amount || !params.description || !params.category) {
        throw new ExpenseTrackerError(
          "Missing required expense parameters",
          ErrorCodes.VALIDATION_FAILED,
          ErrorSeverity.MEDIUM,
          {
            component: "ExpenseTools.addExpense",
            providedParams: Object.keys(params),
          }
        );
      }

      const date = params.date ? new Date(params.date) : new Date();

      // Generate embedding
      try {
        const { data: embedding, error: embeddingError } =
          await supabase.functions.invoke("generate-embedding", {
            body: { text: params.description },
          });

        if (embeddingError || !embedding) {
          throw new ExpenseTrackerError(
            "Failed to generate embedding",
            ErrorCodes.TOOL_EXECUTION_FAILED,
            ErrorSeverity.MEDIUM,
            {
              component: "ExpenseTools.addExpense",
              originalError: embeddingError?.message,
              description: params.description,
            }
          );
        }

        // Handle category
        let category_id = params.category_id;

        // Handle new category suggestion
        if (!category_id && params.isNewCategory) {
          throw {
            code: "NEEDS_CATEGORY_CONFIRMATION",
            suggestedCategory: params.category,
            reasoning: params.categoryReasoning,
            originalParams: params,
          };
        }

        // Create new category if needed
        if (!category_id && params.category) {
          const { data: newCategory, error: categoryError } = await supabase
            .from("categories")
            .insert({
              name: params.category,
              description:
                params.categoryDescription || params.categoryReasoning || null,
            })
            .select("id")
            .single();

          if (categoryError) {
            throw new ExpenseTrackerError(
              "Failed to create category",
              ErrorCodes.TOOL_EXECUTION_FAILED,
              ErrorSeverity.HIGH,
              {
                component: "ExpenseTools.addExpense",
                originalError: categoryError.message,
                category: params.category,
              }
            );
          }
          category_id = newCategory.id;
        }

        const expense = {
          id: crypto.randomUUID(),
          amount: params.amount,
          description: params.description,
          category_id,
          date: date.toISOString(),
          merchant: params.merchant || null,
          tags: params.tags || [],
          metadata: params.metadata || {},
          date_created: new Date().toISOString(),
          description_embedding: embedding,
        };

        const { data, error } = await supabase
          .from("expenses")
          .insert(expense)
          .select()
          .single();

        if (error) {
          throw new ExpenseTrackerError(
            "Failed to insert expense",
            ErrorCodes.TOOL_EXECUTION_FAILED,
            ErrorSeverity.HIGH,
            {
              component: "ExpenseTools.addExpense",
              originalError: error.message,
              expense: {
                amount: expense.amount,
                description: expense.description,
                category_id: expense.category_id,
              },
            }
          );
        }

        this.logger.log(
          LogLevel.INFO,
          "Successfully added expense",
          "ExpenseTools.addExpense",
          {
            expenseId: data.id,
            amount: data.amount,
            category: data.category_id,
          }
        );

        return data;
      } catch (error) {
        // Special handling for category confirmation
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "NEEDS_CATEGORY_CONFIRMATION"
        ) {
          throw error;
        }

        // Handle other errors
        if (error instanceof ExpenseTrackerError) {
          throw error;
        }

        throw new ExpenseTrackerError(
          "Failed to add expense",
          ErrorCodes.TOOL_EXECUTION_FAILED,
          ErrorSeverity.HIGH,
          {
            component: "ExpenseTools.addExpense",
            originalError:
              error instanceof Error ? error.message : String(error),
          }
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof ExpenseTrackerError
          ? error
          : new ExpenseTrackerError(
              "Unexpected error in addExpense",
              ErrorCodes.TOOL_EXECUTION_FAILED,
              ErrorSeverity.CRITICAL,
              {
                component: "ExpenseTools.addExpense",
                originalError:
                  error instanceof Error ? error.message : String(error),
              }
            ),
        "ExpenseTools"
      );
      throw error;
    }
  }

  static async getSpendingInsights(params: {
    timeframe: string;
  }): Promise<any> {
    try {
      // Mock insights generation
      return {
        timeframe: params.timeframe,
        totalSpent: 1234.56,
        topCategories: ["groceries", "entertainment", "utilities"],
        averagePerDay: 41.15,
      };
    } catch (error) {
      throw new Error(
        `Failed to get insights: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  static async getSimilarExpenses(params: {
    description: string;
    limit?: number;
  }): Promise<any> {
    try {
      // Get embedding for the query description
      const { data: embedding } = await supabase.functions.invoke(
        "generate-embedding",
        {
          body: { text: params.description },
        }
      );

      if (!embedding) {
        throw new Error("Failed to generate embedding for search query");
      }

      // Perform vector similarity search
      const { data: similarExpenses, error } = await supabase.rpc(
        "search_expenses",
        {
          query_embedding: embedding,
          similarity_threshold: 0.5,
          match_count: params.limit || 5,
        }
      );

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        query: params.description,
        limit: params.limit || 5,
        results: similarExpenses.map((expense: any) => ({
          description: expense.description,
          amount: expense.amount,
          date: expense.date,
          category: expense.category_name,
          similarity: expense.similarity,
        })),
      };
    } catch (error) {
      throw new Error(
        `Failed to find similar expenses: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  static async categorizeExpense(params: {
    description: string;
    amount: number;
  }): Promise<any> {
    try {
      // Mock categorization logic
      const categories = [
        "groceries",
        "entertainment",
        "utilities",
        "transportation",
        "dining",
      ];
      const suggestedCategory =
        categories[Math.floor(Math.random() * categories.length)];

      return {
        description: params.description,
        amount: params.amount,
        suggestedCategory,
        confidence: 0.85,
      };
    } catch (error) {
      throw new Error(
        `Failed to categorize expense: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  static async getCategories(): Promise<
    { id: string; name: string; description: string }[]
  > {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, description")
        .order("name");

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      throw new Error(
        `Failed to get categories: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
