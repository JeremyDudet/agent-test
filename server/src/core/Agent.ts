// src/agent.ts
import { OpenAI } from "openai";
import { TavilyAPI } from "../services/search/TavilyAPI";
import { StateManager, type AgentState } from "./StateManager";
import { supabase } from "../services/database/supabase";

export interface ExpenseProposal {
  id: string;
  status: "draft" | "pending_review" | "confirmed" | "rejected";
  action: string;
  item: string;
  amount: number;
  date: string;
  category: string;
  originalText: string;
  created_at: string;
}

export class ExpenseAgent {
  private openai: OpenAI;
  private tavilyAPI: TavilyAPI;
  private stateManager: StateManager;

  constructor() {
    this.stateManager = StateManager.getInstance();
    this.tavilyAPI = new TavilyAPI();

    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not configured");
      throw new Error("OpenAI API key not configured");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private async findSimilarExpenses(description: string, amount: number, date: string): Promise<any[]> {
    try {
      const embeddings = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: description,
      });

      const embedding = embeddings.data[0]?.embedding;
      if (!embedding) {
        throw new Error("Failed to generate embedding for similarity check");
      }

      // Search for similar expenses using vector similarity
      const { data: similarExpenses, error } = await supabase.rpc(
        "search_expenses",
        {
          query_embedding: embedding,
          similarity_threshold: 0.6, // Lower threshold for less strict matching
          match_count: 5,
        }
      );

      if (error) {
        console.error("Error finding similar expenses:", error);
        return [];
      }

      // Filter further by amount similarity (within 20%) and date proximity (within 2 days)
      const dateThreshold = 2 * 24 * 60 * 60 * 1000; // 2 days in milliseconds
      const targetDate = new Date(date).getTime();
      const targetAmount = amount;

      const filteredExpenses = similarExpenses.filter((expense: any) => {
        const amountDiffPercent = Math.abs((expense.amount - targetAmount) / targetAmount);
        const dateDiff = Math.abs(new Date(expense.date).getTime() - targetDate);
        const isAmountSimilar = amountDiffPercent <= 0.2;
        const isDateClose = dateDiff <= dateThreshold;

        console.log(`[SIMILARITY CHECK] Comparing expense:`, {
          description: expense.description,
          amount: expense.amount,
          date: expense.date,
          amountDiffPercent,
          dateDiff: dateDiff / (24 * 60 * 60 * 1000), // Convert to days for logging
          isAmountSimilar,
          isDateClose
        });

        return isAmountSimilar && isDateClose;
      });

      return filteredExpenses;
    } catch (error) {
      console.error("Error in findSimilarExpenses:", error);
      return [];
    }
  }

  // main handler for transcript inputs to the agent
  async processLatestTranscription(
    newTranscript: string,
    state: AgentState
  ): Promise<ExpenseProposal[]> {
    try {
      // Get user categories for context
      const categories = state.userExpenseCategories;
      const timeContext = state.timeContext;
      const existingProposals = state.existingProposals;
      const processedMessages = state.messageWindow.processedMessages;

      // Construct the system message with all context
      const systemMessage = {
        role: "system",
        content: `You are an AI expense tracking assistant. Your task is to analyze conversations and generate or update expense proposals with high accuracy and minimal duplicates.

Current Context:
- Time: ${timeContext.formattedNow}
- Timezone: ${timeContext.timeZone}
- Available Categories: ${categories.map((c) => c.name).join(", ")}

Previous Context:
${processedMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}

Current Proposals:
${existingProposals
  .map((p) => `- ${p.action}: ${p.item} ($${p.amount}) [${p.status}] on ${p.date}`)
  .join("\n")}

Guidelines for Expense Detection:
1. Only generate proposals for clear, explicit mentions of expenses
2. Avoid duplicating expenses that are similar in amount, merchant, and date
3. Be specific with merchant names and categories
4. Extract exact amounts when available
5. Default to today's date only if the expense is clearly recent
6. If a date is ambiguous or not mentioned, ask for clarification instead of guessing
7. If an expense seems similar to an existing proposal, skip it to avoid duplicates
8. For recurring expenses, ensure they are actually different instances

Based on the new transcript, either:
1. Generate new expense proposals
2. Modify existing proposals
3. Return empty array if no changes needed or if expenses seem like duplicates

Response must be a JSON array of ExpenseProposal objects.

Example JSON structure:
{
  "proposals": [
    {
      "id": "uuid-string",
      "status": "draft",
      "action": "create_expense",
      "item": "Lunch at Subway",
      "amount": 42.50,
      "date": "2024-02-14",
      "category": "Food & Dining",
      "originalText": "I spent $42.50 on lunch at Subway",
      "created_at": "2024-02-14T12:00:00Z"
    }
  ]
}`,
      };

      // Call OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: systemMessage.content,
          },
          {
            role: "user",
            content: newTranscript,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      // Parse and validate the response
      const result = JSON.parse(content);
      let proposals: ExpenseProposal[] = [];

      console.log("[AGENT] OpenAI generated result:", result);

      if (result.proposals && Array.isArray(result.proposals)) {
        // Process each proposal with similarity checking
        for (const p of result.proposals) {
          console.log("[AGENT] Processing proposal:", p);
          
          // Check for similar existing expenses in database
          const similarExpenses = await this.findSimilarExpenses(
            p.item,
            p.amount,
            p.date || timeContext.formattedNow
          );

          // Skip if we found similar expenses in database
          if (similarExpenses.length > 0) {
            console.log(`[AGENT] Skipping duplicate expense (found in database): ${p.item} ($${p.amount})`, {
              similarExpenses
            });
            continue;
          }

          // Check for similar proposals in current batch
          const similarInBatch = proposals.some(existing => {
            const amountDiffPercent = Math.abs((existing.amount - p.amount) / p.amount);
            return amountDiffPercent <= 0.2; // If amounts are within 20%, consider it a duplicate
          });

          if (similarInBatch) {
            console.log(`[AGENT] Skipping duplicate expense (found in current batch): ${p.item} ($${p.amount})`);
            continue;
          }

          console.log(`[AGENT] Adding new proposal: ${p.item} ($${p.amount})`);

          // Add the proposal if no duplicates found
          proposals.push({
            id: p.id || crypto.randomUUID(),
            status: p.status || "draft",
            action: p.action,
            item: p.item,
            amount: p.amount,
            date: p.date || timeContext.formattedNow,
            category: p.category,
            originalText: newTranscript,
            created_at: new Date().toISOString(),
          });
        }
      }

      // Update state with new proposals if any were generated
      if (proposals.length > 0) {
        console.log("[AGENT] Generated proposals:", proposals);
        this.stateManager.updateState({
          existingProposals: [...state.existingProposals, ...proposals],
        });
      } else {
        console.log("[AGENT] No new proposals generated");
      }

      return proposals;
    } catch (error) {
      console.error("Failed to process transcription", {
        component: "ExpenseAgent.processNewTranscription",
        error: error instanceof Error ? error.message : String(error),
        transcriptionText: newTranscript,
      });
      return [];
    }
  }
}
