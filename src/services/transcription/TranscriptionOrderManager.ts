import { EventEmitter } from "events";
import { StateManager } from "../../core/StateManager";
import { ExpenseAgent } from "../../core/Agent";

interface TranscriptionChunk {
  id: number;
  timestamp: number;
  transcript: string;
}

export class TranscriptionOrderManager extends EventEmitter {
  private stateManager: StateManager;
  private chunks: Map<number, TranscriptionChunk>;
  private readonly CHUNK_TIMEOUT = 5000; // 5 seconds
  private agent: ExpenseAgent;
  constructor() {
    super();
    this.chunks = new Map();
    this.stateManager = StateManager.getInstance(); // get the state manager
    this.agent = new ExpenseAgent();
  }

  // once a transcription is received, add it to the process queue, and trigger the processChunks method
  addChunk(id: number, timestamp: number, transcript: string) {
    console.log(
      "[TRANSCRIPTION ORDER MANAGER] Adding chunk",
      `id: ${id}\ntimestamp: ${timestamp}\ntranscript: ${transcript}`
    );
    this.chunks.set(id, { id, timestamp, transcript }); // Add the chunk to the map

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
        (a, b) => a.timestamp - b.timestamp
      );

      // Combine the chunks into a single string
      const combinedTranscript = orderedChunks
        .map((chunk) => chunk.transcript)
        .join(" ")
        .trim();

      // Get the last chunk
      const lastChunk = orderedChunks[orderedChunks.length - 1];

      // Emit combined transcription to the client
      this.emit("transcription", {
        transcript: combinedTranscript,
        id: lastChunk.id,
        timestamp: lastChunk.timestamp,
      });

      // Process the transcription through the agent
      const proposals = await this.agent.processLatestTranscription(
        combinedTranscript,
        state
      );

      if (proposals.length > 0) {
        // Update state with new proposals
        this.stateManager.updateState({
          existingProposals: [...state.existingProposals, ...proposals],
        });

        // Emit proposals event to the client
        this.emit("proposals", {
          proposals,
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
      orderedChunks.forEach((chunk) => this.chunks.delete(chunk.id));
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
