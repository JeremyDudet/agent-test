import { OpenAI } from "openai";
import { EventEmitter } from "events";
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import path from "path";
import fs from "fs";
import { TranscriptionBufferManager } from "./TranscriptionBufferManager";
import { LoggingService, LogLevel } from "../logging/LoggingService";
import {
  ExpenseTrackerError,
  ErrorCodes,
  ErrorSeverity,
} from "../../utils/error";

export class TranscriptionService extends EventEmitter {
  private openai: OpenAI;
  private tempDir: string;
  private bufferManager: TranscriptionBufferManager;
  private logger: LoggingService;
  private accumulatedTranscript = "";

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.tempDir = path.join(os.tmpdir(), "transcriptions");
    this.bufferManager = new TranscriptionBufferManager();
    this.logger = LoggingService.getInstance();

    // Listen for buffer updates
    this.bufferManager.on("bufferUpdated", (newText) => {
      this.accumulatedTranscript += newText + " ";
      this.emit("partialTranscript", newText);
    });
  }

  getAccumulatedTranscript(): string {
    return this.accumulatedTranscript.trim();
  }

  clearAccumulatedTranscript(): void {
    this.accumulatedTranscript = "";
    this.bufferManager.clear();
  }

  // For single/partial chunks
  async transcribeAudioChunk(
    audioBuffer: ArrayBuffer,
    isFinal = false
  ): Promise<string> {
    try {
      if (audioBuffer.byteLength < 4000) {
        this.logger.log(
          LogLevel.DEBUG,
          "Skipping short audio chunk",
          "TranscriptionService",
          { byteLength: audioBuffer.byteLength }
        );
        return "";
      }

      const tempFilePath = path.join(this.tempDir, `${uuidv4()}.wav`);
      await writeFile(tempFilePath, Buffer.from(audioBuffer));
      const audioStream = createReadStream(tempFilePath);

      // For partial transcripts, we can keep a lower temperature
      // and rely on partial context from getLastPhrase
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        language: "en",
        response_format: "text",
        temperature: 0.3,
        prompt: this.bufferManager.getLastPhrase(),
      });

      await fs.promises.unlink(tempFilePath);

      if (!transcription.trim()) {
        return "";
      }

      if (isFinal) {
        this.bufferManager.appendFinalTranscript(transcription);
        this.logger.log(
          LogLevel.INFO,
          "Processed final transcript",
          "TranscriptionService",
          { transcript: transcription }
        );
      } else {
        this.bufferManager.appendInterimTranscript(transcription);
        this.logger.log(
          LogLevel.DEBUG,
          "Processed interim transcript",
          "TranscriptionService",
          { transcript: transcription }
        );
      }

      return transcription;
    } catch (error) {
      this.logger.error(
        new ExpenseTrackerError(
          "Failed to transcribe audio chunk",
          ErrorCodes.TRANSCRIPTION_FAILED,
          ErrorSeverity.MEDIUM,
          {
            component: "TranscriptionService",
            originalError:
              error instanceof Error ? error.message : String(error),
            isFinal,
            bufferLength: this.bufferManager.getFullTranscript().length,
          }
        )
      );
      throw error;
    }
  }

  // For the final, complete audio data
  async transcribeFinalAudio(totalBuffer: Buffer): Promise<string> {
    try {
      const tempFilePath = path.join(this.tempDir, `${uuidv4()}.wav`);
      await writeFile(tempFilePath, totalBuffer);
      const audioStream = createReadStream(tempFilePath);

      // This is a "best effort" final pass
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        language: "en",
        response_format: "text",
        // You can also tune these parameters to reduce hallucination:
        temperature: 0, // 0 is more deterministic
        // no_speech_threshold, logprob_threshold, etc. (if supported by the library)
      });

      await fs.promises.unlink(tempFilePath);

      return transcription.trim();
    } catch (error) {
      this.logger.error(
        new ExpenseTrackerError(
          "Failed to transcribe final audio",
          ErrorCodes.TRANSCRIPTION_FAILED,
          ErrorSeverity.MEDIUM,
          {
            component: "TranscriptionService.transcribeFinalAudio",
            originalError:
              error instanceof Error ? error.message : String(error),
          }
        )
      );
      throw error;
    }
  }
}
