import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ExpenseTools } from "./expenseTools";

export const addExpenseTool = tool(
  async (args) => {
    // Hand off all logic to your existing utility
    return ExpenseTools.addExpense(args);
  },
  {
    name: "add_expense",
    description:
      "Add an expense. Provide { amount, description, date, category, etc. }",
    schema: z.object({
      amount: z.number().min(0),
      description: z.string().min(1),
      date: z.string().optional(),
      category: z.string().optional(),
      category_id: z.string().optional(),
      merchant: z.string().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
      isNewCategory: z.boolean().optional(),
      categoryReasoning: z.string().optional(),
      categoryDescription: z.string().optional(),
    }),
  }
);

export const getSpendingInsightsTool = tool(
  async (args) => {
    return ExpenseTools.getSpendingInsights(args);
  },
  {
    name: "get_spending_insights",
    description:
      "Get a summary of spending insights over a timeframe. Provide { timeframe }",
    schema: z.object({
      timeframe: z.string(),
    }),
  }
);

export const getSimilarExpensesTool = tool(
  async (args) => {
    return ExpenseTools.getSimilarExpenses(args);
  },
  {
    name: "get_similar_expenses",
    description:
      "Find expenses that are semantically similar to a given description. Provide { description, limit }",
    schema: z.object({
      description: z.string(),
      limit: z.number().optional(),
    }),
  }
);

export const categorizeExpenseTool = tool(
  async (args) => {
    return ExpenseTools.categorizeExpense(args);
  },
  {
    name: "categorize_expense",
    description:
      "Suggest a category for an expense based on description and amount. Provide { description, amount }",
    schema: z.object({
      description: z.string(),
      amount: z.number().min(0),
    }),
  }
);
