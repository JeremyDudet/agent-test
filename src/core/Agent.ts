// src/agent.ts
import { OpenAI } from "openai";
import { ActionProposalAgent } from "../agents/ActionProposalAgent";
import { ExpenseService } from "../services/expense/ExpenseService";
import { format, parseISO, subDays, subMonths } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { StateManager } from "./StateManager";
import type { ActionProposal } from "../types";
import { config } from "../config";
import { ExpenseTrackerError, ErrorSeverity, ErrorCodes } from "../utils/error";

export class ExpenseAgent {
  private stateManager: StateManager;
  private actionProposalAgent: ActionProposalAgent;

  constructor() {
    this.stateManager = StateManager.getInstance();
    this.actionProposalAgent = new ActionProposalAgent();
  }

  // main handler for transcript inputs to the agent
  async processNewTranscription(
    newTranscript: string
  ): Promise<ActionProposal[]> {
    try {
      // Get current state
      const state = this.stateManager.getState();

      // Get time context
      const now = new Date();
      const timeContext = {
        now,
        formattedNow: format(now, "yyyy-MM-dd"),
        timeZone: config.timeZone || "America/Los_Angeles",
      };

      // Create understanding context
      const understanding = {
        timeContext,
        description: newTranscript.trim(),
        needsClarification: false,
      };

      // Use ActionProposalAgent to generate proposals
      const proposals = await this.actionProposalAgent.proposeActions(
        newTranscript,
        understanding
      );

      // Update state with new proposals if any were generated
      if (proposals.length > 0) {
        this.stateManager.updateState({
          actionContext: {
            ...state.actionContext,
            proposals: [...state.actionContext.proposals, ...proposals],
          },
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
