import { EventEmitter } from "events";
import { LoggingService, LogLevel } from "../logging/LoggingService";
import {
  ExpenseTrackerError,
  ErrorCodes,
  ErrorSeverity,
} from "../../utils/error";

interface TranscriptionChunk {
  id: number;
  timestamp: number;
  transcript: string;
}

export class TranscriptionOrderManager extends EventEmitter {
  private chunks: Map<number, TranscriptionChunk>;
  private nextExpectedId: number;
  private logger: LoggingService;
  private readonly CHUNK_TIMEOUT = 5000; // 5 seconds
  private completeTranscript: string = "";

  constructor() {
    super();
    this.chunks = new Map();
    this.nextExpectedId = 0;
    this.logger = LoggingService.getInstance();
  }

  // Add a chunk to the manager, this will trigger the processChunks method
  addChunk(id: number, timestamp: number, transcript: string) {
    console.log("Adding chunk", id, timestamp, transcript);
    this.chunks.set(id, { id, timestamp, transcript }); // Add the chunk to the map
    this.processChunks(); // Process the chunks
  }

  private async processChunks() {
    console.log("Processing chunks", this.chunks);
    while (this.chunks.has(this.nextExpectedId)) {
      // While there are chunks to process
      console.log("Processing chunk", this.nextExpectedId);
      const chunk = this.chunks.get(this.nextExpectedId)!;

      // Emit the individual chunk to the client
      this.emit("transcription", {
        transcript: chunk.transcript,
        id: chunk.id,
        timestamp: chunk.timestamp,
      });

      // // 2) Perform business logic against this chunk
      // let result = null;
      // try {
      //   result = await this.generateProposalFromChunk(chunk.transcript);
      //   console.log("Proposal Generator result", result);
      // } catch (err) {
      //   this.logger.error(err, "TranscriptionOrderManager");
      //   // You might re-throw or handle error differently
      // }

      // console.log("Proposal Generator result", result);

      // // If the result is a proposal, emit it to the client
      // if (result.type === "proposal") {
      //   this.emit("proposals", {
      //     proposals: [result],
      //     isPartial: false,
      //     context: {},
      //   });
      // }

      // Clean up processed chunk
      this.chunks.delete(this.nextExpectedId);
      this.nextExpectedId++;
    }
  }

  reset() {
    this.chunks.clear();
    this.nextExpectedId = 0;
    this.completeTranscript = "";
  }
}
