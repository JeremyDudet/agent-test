import { supabase } from "../config/supabase";
import type { Expense, Category, Budget } from "../types";
import OpenAI from "openai";
import { formatInTimeZone } from "date-fns-tz";

export class ExpenseTools {
  private static openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  static async addExpense(data: Partial<Expense>) {
    // First get the category ID - pass false to skip confirmation since we're in the final add step
    const { category } = await this.categorizeExpense(
      data.description || "",
      false
    );

    // Generate embedding for semantic search
    const embedding = await this.generateEmbedding(data.description || "");

    const now = new Date();
    const timeZone = "America/Los_Angeles";

    // Debug logging
    console.log("Input date:", data.date);

    const dateToSave =
      data.date instanceof Date
        ? formatInTimeZone(data.date, timeZone, "yyyy-MM-dd'T'00:00:00XXX")
        : formatInTimeZone(now, timeZone, "yyyy-MM-dd'T'00:00:00XXX");

    // Debug logging
    console.log("Formatted date to save:", dateToSave);

    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        ...data,
        category_id: category.id,
        embedding,
        date: dateToSave,
        date_created: formatInTimeZone(
          now,
          timeZone,
          "yyyy-MM-dd'T'HH:mm:ssXXX"
        ),
      })
      .select()
      .single();

    if (error) throw error;
    return expense;
  }

  static async categorizeExpense(
    description: string,
    requireConfirmation = true
  ): Promise<{
    category: Category;
    confidence: number;
    isNew: boolean;
    needsConfirmation: boolean;
  }> {
    const { data: existingCategories, error } = await supabase
      .from("categories")
      .select("*");

    if (error) throw error;
    const categories = existingCategories || [];

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an expense categorization assistant. Given an expense description, either:
                   1. Choose an existing category if it's appropriate (confidence > 60%)
                   2. Suggest creating a new category if none fit well

                   Common mappings to consider:
                   - "gas", "fuel", "car fuel" → "Transportation"
                   - "groceries", "food" → "Groceries"
                   - "restaurant", "dining" → "Food & Dining"

                   Existing categories:
                   ${categories
                     .map((c) => `"${c.name}" (${c.description})`)
                     .join("\n")}
                   
                   Reply in JSON format:
                   {
                     "useExisting": boolean,
                     "categoryName": string,
                     "confidence": number,
                     "description": string
                   }`,
        },
        {
          role: "user",
          content: description,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const needsConfirmation = requireConfirmation && result.confidence < 80;

    if (result.useExisting) {
      const category = categories.find(
        (c) => c.name.toLowerCase() === result.categoryName.toLowerCase()
      );
      if (!category) {
        throw new Error(`Category matching error: ${result.categoryName}`);
      }
      return {
        category,
        confidence: result.confidence,
        isNew: false,
        needsConfirmation,
      };
    } else {
      if (needsConfirmation) {
        return {
          category: {
            id: "",
            name: result.categoryName,
            description: result.description,
          },
          confidence: result.confidence,
          isNew: true,
          needsConfirmation,
        };
      }

      // Only create new category if we don't need confirmation
      const { data: newCategory, error: insertError } = await supabase
        .from("categories")
        .insert({
          name: result.categoryName,
          description: result.description,
        })
        .select()
        .single();

      if (insertError || !newCategory) {
        throw new Error(
          `Failed to create new category: ${insertError?.message}`
        );
      }

      return {
        category: newCategory,
        confidence: result.confidence,
        isNew: true,
        needsConfirmation: false,
      };
    }
  }

  static async getSimilarExpenses(description: string, limit = 5) {
    const embedding = await this.generateEmbedding(description);

    const { data: expenses, error } = await supabase.rpc("match_expenses", {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: limit,
    });

    if (error) throw error;
    return expenses;
  }

  static async getSpendingInsights(timeframe?: { start: Date; end: Date }) {
    const query = supabase.from("expenses").select(`
      amount,
      date,
      description,
      categories (
        name
      )
    `);

    if (timeframe?.start && timeframe?.end) {
      query
        .gte("date", timeframe.start.toISOString())
        .lte("date", timeframe.end.toISOString());
    }

    const { data: expenses, error } = await query;

    if (error) throw error;
    if (!expenses || expenses.length === 0) {
      return {
        total: 0,
        categoryTotals: {},
        topCategories: [],
        message: "No expenses found for the specified timeframe",
      };
    }

    return this.analyzeSpending(expenses);
  }

  private static async generateEmbedding(text: string) {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
  }

  private static analyzeSpending(expenses: any[]) {
    const categoryTotals = expenses.reduce((acc, expense) => {
      const categoryName = expense.categories.name;
      acc[categoryName] = (acc[categoryName] || 0) + expense.amount;
      return acc;
    }, {});

    const total = Object.values(categoryTotals).reduce(
      (sum: any, amount: any) => sum + amount,
      0
    );

    return {
      total,
      categoryTotals,
      topCategories: Object.entries(categoryTotals)
        .sort(([, a]: any, [, b]: any) => b - a)
        .slice(0, 3),
    };
  }
}
