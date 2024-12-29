import { format } from "date-fns";
import type { ActionParameters } from "../../types";
import { supabase } from "../database/supabase";

export class ExpenseTools {
  static async addExpense(params: ActionParameters): Promise<any> {
    try {
      if (!params.amount || !params.description || !params.category) {
        throw new Error("Amount, description, and category are required");
      }

      const date = params.date ? new Date(params.date) : new Date();

      // Generate embedding for the description
      const { data: embedding } = await supabase.functions.invoke(
        "generate-embedding",
        {
          body: { text: params.description },
        }
      );

      if (!embedding) {
        throw new Error("Failed to generate embedding for expense description");
      }

      // Handle category
      let category_id = params.category_id;

      // If it's a new category, throw a special error to trigger user confirmation
      if (!category_id && params.isNewCategory) {
        throw {
          code: "NEEDS_CATEGORY_CONFIRMATION",
          suggestedCategory: params.category,
          reasoning: params.categoryReasoning,
          originalParams: params,
        };
      }

      // If we need to create a new category (after confirmation)
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
          throw new Error(
            `Failed to create category: ${categoryError.message}`
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
        description_embedding: embedding, // Add the embedding to the expense record
      };

      const { data, error } = await supabase
        .from("expenses")
        .insert(expense)
        .select()
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return data;
    } catch (error) {
      // Rethrow special category confirmation errors
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "NEEDS_CATEGORY_CONFIRMATION"
      ) {
        throw error;
      }
      throw new Error(
        `Failed to add expense: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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
