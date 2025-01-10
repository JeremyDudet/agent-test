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
  isFinal: boolean;
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

  addChunk(
    id: number,
    timestamp: number,
    transcript: string,
    isFinal: boolean
  ) {
    this.chunks.set(id, { id, timestamp, transcript, isFinal });
    this.processChunks();
  }

  private processChunks() {
    while (this.chunks.has(this.nextExpectedId)) {
      const chunk = this.chunks.get(this.nextExpectedId)!;

      // Add to complete transcript
      this.completeTranscript += " " + chunk.transcript;
      this.completeTranscript = this.completeTranscript.trim();

      // Emit both the individual chunk and complete transcript
      this.emit("transcription", {
        transcript: chunk.transcript,
        completeTranscript: this.completeTranscript,
        id: chunk.id,
        timestamp: chunk.timestamp,
      });

      // Clean up processed chunk
      this.chunks.delete(this.nextExpectedId);
      this.nextExpectedId++;
    }

    this.handleTimedOutChunks();
  }

  private handleTimedOutChunks() {
    const now = Date.now();
    const timedOutIds: number[] = [];

    this.chunks.forEach((chunk, id) => {
      if (now - chunk.timestamp > this.CHUNK_TIMEOUT) {
        timedOutIds.push(id);
        this.logger.log(
          LogLevel.WARN,
          "Transcription chunk timed out",
          "TranscriptionOrderManager",
          { chunkId: id }
        );
      }
    });

    // Skip timed-out chunks if they're blocking progress
    if (timedOutIds.includes(this.nextExpectedId)) {
      this.nextExpectedId++;
      this.processChunks();
    }
  }

  reset() {
    this.chunks.clear();
    this.nextExpectedId = 0;
    this.completeTranscript = "";
  }
}
