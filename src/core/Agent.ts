// src/agent.ts
import { OpenAI } from "openai";
import { TavilyAPI } from "../services/search/TavilyAPI";
import { StateManager, type AgentState } from "./StateManager";
import { ExpenseTrackerError, ErrorSeverity, ErrorCodes } from "../utils/error";

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

  // // this is a tool for the agent to use to research expenses, if
  // private async researchExpenseTool(description: string): Promise<string> {
  //   try {
  //     if (!process.env.TAVILY_API_KEY) {
  //       console.log(
  //         "Tavily API key not found, skipping research",
  //         "ActionProposalAgent"
  //       );
  //       return "";
  //     }

  //     const searchResults = await this.tavilyAPI.search(
  //       `${description} expense category type`
  //     );

  //     return `Research Results: ${searchResults.results
  //       .map((result) => result.content)
  //       .join("\n")}`;
  //   } catch (error) {
  //     console.log(
  //       "Research failed, continuing without research context",
  //       "ActionProposalAgent",
  //       {
  //         description,
  //         error: error instanceof Error ? error.message : String(error),
  //       }
  //     );
  //     return "";
  //   }
  // }

  // private calculateDate(relativeDate: string): string {
  //   if (relativeDate === "today") {
  //     return new Date().toISOString().split("T")[0];
  //   }

  //   const parts = relativeDate.split(" ");
  //   if (parts.length >= 2) {
  //     const amount = parseInt(parts[0]);
  //     const unit = parts[1];
  //     const now = new Date();

  //     if (unit.includes("year")) {
  //       return subMonths(now, amount * 12)
  //         .toISOString()
  //         .split("T")[0];
  //     } else if (unit.includes("month")) {
  //       return subMonths(now, amount).toISOString().split("T")[0];
  //     } else if (unit.includes("day")) {
  //       return subDays(now, amount).toISOString().split("T")[0];
  //     }
  //   }

  //   // If it's already a date string, ensure it's in YYYY-MM-DD format
  //   try {
  //     const date = new Date(relativeDate);
  //     return date.toISOString().split("T")[0];
  //   } catch {
  //     return new Date().toISOString().split("T")[0]; // fallback to today
  //   }
  // }

  // main handler for transcript inputs to the agent
  // we pass the latest transcript and the state (current date, existing categories, previously generated proposals, previous transcriptions) to the agent to edit exisiting or generate new proposals.
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
        content: `You are an AI expense tracking assistant. Your task is to analyze conversations and generate or update expense proposals.

Current Context:
- Time: ${timeContext.formattedNow}
- Timezone: ${timeContext.timeZone}
- Available Categories: ${categories.map((c) => c.name).join(", ")}

Previous Context:
${processedMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}

Current Proposals:
${existingProposals
  .map((p) => `- ${p.action}: ${p.item} ($${p.amount}) [${p.status}]`)
  .join("\n")}

Based on the new transcript, either:
1. Generate new expense proposals
2. Modify existing proposals
3. Return empty array if no changes needed

If any changes were made at all, please return the entire array of proposals.

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
}

`,
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

      if (result.proposals && Array.isArray(result.proposals)) {
        proposals = result.proposals.map((p: ExpenseProposal) => ({
          id: p.id || crypto.randomUUID(),
          status: p.status || "draft",
          action: p.action,
          item: p.item,
          amount: p.amount,
          date: p.date || timeContext.formattedNow,
          category: p.category,
          originalText: newTranscript,
          created_at: new Date().toISOString(),
        }));
      }

      // Update state with new proposals if any were generated
      if (proposals.length > 0) {
        this.stateManager.updateState({
          existingProposals: [...state.existingProposals, ...proposals],
        });
      }

      return proposals;
    } catch (error) {
      throw new ExpenseTrackerError(
        "Failed to process transcription",
        ErrorCodes.MESSAGE_PROCESSING_FAILED,
        ErrorSeverity.HIGH,
        {
          component: "ExpenseAgent.processNewTranscription",
          originalError: error instanceof Error ? error.message : String(error),
          transcriptionText: newTranscript,
        }
      );
    }
  }
}
