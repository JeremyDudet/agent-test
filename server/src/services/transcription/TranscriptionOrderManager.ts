import { EventEmitter } from "events";
import { StateManager } from "../../core/StateManager";
import { ExpenseAgent } from "../../core/Agent";
import { persistExpenseProposal } from "../database/expenses";
import { DEFAULT_TEST_USER_ID } from "../../config";

interface TranscriptionChunk {
  id: number;
  timestamp: number;
  transcript: string;
}

export class TranscriptionOrderManager extends EventEmitter {
  private stateManager: StateManager;
  private chunks: Map<number, { chunk: TranscriptionChunk; userId: string }>;
  private readonly CHUNK_TIMEOUT = 5000; // 5 seconds
  private agent: ExpenseAgent;
  constructor() {
    super();
    this.chunks = new Map();
    this.stateManager = StateManager.getInstance(); // get the state manager
    this.agent = new ExpenseAgent();
  }

  // once a transcription is received, add it to the process queue, and trigger the processChunks method
  addChunk(id: number, timestamp: number, transcript: string, userId: string) {
    console.log(
      "[TRANSCRIPTION ORDER MANAGER] Adding chunk",
      `id: ${id}\ntimestamp: ${timestamp}\ntranscript: ${transcript}\nuserId: ${userId}`
    );
    this.chunks.set(id, { 
      chunk: { id, timestamp, transcript },
      userId 
    }); // Add the chunk to the map

    this.processChunks(); // Process the chunks
  }

  // process the chunks in order
  private async processChunks() {
    // set the state to processing
    console.log("[TRANSCRIPTION ORDER MANAGER] Processing...");
    this.stateManager.updateState({
      isProcessing: true,
    });
    do {
      const state = this.stateManager.getState(); // get the state
      console.log("[TRANSCRIPTION ORDER MANAGER] State:", state);
      const chunksToProcess = Array.from(this.chunks.values()); // Get all available chunks
      console.log(
        "[TRANSCRIPTION ORDER MANAGER] Chunks to process:",
        chunksToProcess
      );

      // Sort by timestamp and combine
      const orderedChunks = chunksToProcess.sort(
        (a, b) => a.chunk.timestamp - b.chunk.timestamp
      );

      // Get the user ID from the first chunk (they should all be from the same user)
      const userId = orderedChunks[0].userId;

      // Combine the chunks into a single string
      const combinedTranscript = orderedChunks
        .map((chunk) => chunk.chunk.transcript)
        .join(" ")
        .trim();

      // Get the last chunk
      const lastChunk = orderedChunks[orderedChunks.length - 1].chunk;

      // Emit combined transcription to the client
      this.emit("transcription", {
        transcript: combinedTranscript,
        id: lastChunk.id,
        timestamp: lastChunk.timestamp,
      });

      // Process the transcription through the agent
      console.log("[TRANSCRIPTION ORDER MANAGER] Processing transcription:", combinedTranscript);
      const proposals = await this.agent.processLatestTranscription(
        combinedTranscript,
        state
      );
      console.log("[TRANSCRIPTION ORDER MANAGER] Generated proposals:", proposals);

      if (proposals.length > 0) {
        // Persist each proposal to the database with pending_review status
        const persistedProposals = await Promise.all(
          proposals.map(async (proposal) => {
            try {
              const validCategory = state.userExpenseCategories.find((c: { id: string; name: string }) => c.name === proposal.category)?.id;
              if (!validCategory) {
                throw new Error(`Category not found: ${proposal.category}`);
              }
              return await persistExpenseProposal({
                ...proposal,
                category: validCategory,
                status: 'pending_review',
                user_id: userId,
                merchant: proposal.item
              });
            } catch (error) {
              console.error("[TRANSCRIPTION ORDER MANAGER] Error persisting proposal:", error);
              return proposal;
            }
          })
        );

        // Update state with persisted proposals
        this.stateManager.updateState({
          existingProposals: [...state.existingProposals, ...persistedProposals],
        });

        // Emit proposals event to the client
        this.emit("proposals", {
          proposals: persistedProposals,
          context: {
            transcript: combinedTranscript,
            timestamp: lastChunk.timestamp,
          },
        });
      }
      // once agent has processed the new transcription, add to processed messages
      this.stateManager.appendToProcessedMessages({
        role: "user",
        content: combinedTranscript,
      });

      // Clear processed chunks
      orderedChunks.forEach((chunk) => this.chunks.delete(chunk.chunk.id));
    } while (this.chunks.size > 0); // Continue if new chunks arrived during processing

    // set the state to not processing
    this.stateManager.updateState({
      isProcessing: false,
    });
  }

  reset() {
    // clear the chunks
    this.chunks.clear();
    // set the state to not processing
    this.stateManager.updateState({
      isProcessing: false,
    });
    console.log("Resetting transcription order manager");
  }
}
