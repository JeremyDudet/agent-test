import { format } from "date-fns";
import type { ActionParameters } from "../../types";
import { supabase } from "../database/supabase";
import type { ExpenseCategory } from "../../core/StateManager";
import { ExpenseModel } from '../../models/expense/ExpenseModel';
import { ExpenseCreateDTO, ExpenseUpdateDTO, Expense } from '../../types';
import { AppError } from '../../middleware/error/errorHandler';
import { openai } from '../ai/openai';

export class ExpenseService {
  constructor(private readonly expenseModel: ExpenseModel) {}

  async createExpense(userId: string, data: ExpenseCreateDTO): Promise<Expense> {
    // Validate category exists
    await this.validateCategory(data.category);
    
    // Check for duplicate expenses
    const similarExpenses = await this.expenseModel.findSimilar(
      userId,
      data.item,
      data.amount,
      data.date
    );

    if (similarExpenses.length > 0) {
      throw new AppError(
        'Similar expense already exists',
        400,
        'DUPLICATE_EXPENSE'
      );
    }

    return this.expenseModel.create(userId, data);
  }

  async updateExpense(userId: string, data: ExpenseUpdateDTO): Promise<Expense> {
    // Verify expense exists and belongs to user
    const existing = await this.expenseModel.findById(userId, data.id);
    if (!existing) {
      throw new AppError('Expense not found', 404, 'NOT_FOUND');
    }

    if (data.category) {
      await this.validateCategory(data.category);
    }

    return this.expenseModel.update(userId, data);
  }

  async deleteExpense(userId: string, id: string): Promise<void> {
    const existing = await this.expenseModel.findById(userId, id);
    if (!existing) {
      throw new AppError('Expense not found', 404, 'NOT_FOUND');
    }

    await this.expenseModel.delete(userId, id);
  }

  async getExpenseById(userId: string, id: string): Promise<Expense> {
    const expense = await this.expenseModel.findById(userId, id);
    if (!expense) {
      throw new AppError('Expense not found', 404, 'NOT_FOUND');
    }
    return expense;
  }

  async getExpenses(userId: string, options: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    category?: string;
  } = {}): Promise<{ expenses: Expense[]; total: number }> {
    if (options.category) {
      await this.validateCategory(options.category);
    }
    return this.expenseModel.findAll(userId, options);
  }

  async categorizeExpense(description: string): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that categorizes expenses. Respond with only the category name."
          },
          {
            role: "user",
            content: `Categorize this expense: ${description}`
          }
        ],
        temperature: 0.3,
        max_tokens: 10
      });

      return completion.choices[0]?.message?.content?.trim() || 'Uncategorized';
    } catch (error) {
      console.error('Error categorizing expense:', error);
      return 'Uncategorized';
    }
  }

  private async validateCategory(category: string): Promise<void> {
    // Here you would typically check against a list of valid categories
    const validCategories = ['Food & Dining', 'Transportation', 'Shopping', 'Bills & Utilities', 'Other'];
    if (!validCategories.includes(category)) {
      throw new AppError(
        'Invalid category',
        400,
        'INVALID_CATEGORY'
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

  static async getCategories(): Promise<ExpenseCategory[]> {
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
