import { EventEmitter } from "events";
import { ExpenseAgent } from "./Agent";
import { StateManager } from "./StateManager";
import { TranscriptionOrderManager } from "../services/transcription/TranscriptionOrderManager";

export class ParallelProcessingManager extends EventEmitter {
  private agent: ExpenseAgent;
  private stateManager: StateManager;
  private transcriptionManager: TranscriptionOrderManager;
  private processingQueue: string[] = [];
  private isProcessing: boolean = false;

  constructor(
    agent: ExpenseAgent,
    transcriptionManager: TranscriptionOrderManager
  ) {
    super();
    this.agent = agent;
    this.stateManager = StateManager.getInstance();
    this.transcriptionManager = transcriptionManager;

    // Listen to transcription updates
    this.transcriptionManager.on("transcriptionUpdated", async (data) => {
      this.queueTranscriptionProcessing(data.transcript);
    });

    // Start the processing loop
    this.processQueue();
  }

  private queueTranscriptionProcessing(transcript: string) {
    this.processingQueue.push(transcript);
    this.emit("transcriptionQueued", transcript);
  }

  private async processQueue() {
    while (true) {
      if (this.processingQueue.length > 0 && !this.isProcessing) {
        this.isProcessing = true;
        const transcript = this.processingQueue.shift()!;

        try {
          const state = this.stateManager.getState();
          const proposals = await this.agent.processLatestTranscription(
            transcript,
            state
          );

          if (proposals.length > 0) {
            this.emit("proposalsGenerated", proposals);
            this.stateManager.updateState({
              existingProposals: [...state.existingProposals, ...proposals],
            });
          }
        } catch (error) {
          console.error("Error processing transcript:", error);
          this.emit("processingError", error);
        } finally {
          this.isProcessing = false;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to prevent CPU hogging
    }
  }
}