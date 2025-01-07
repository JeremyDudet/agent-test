import { OpenAI } from "openai";
import { EventEmitter } from "events";
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import path from "path";
import fs from "fs";
import { LoggingService, LogLevel } from "../logging/LoggingService";
import {
  ExpenseTrackerError,
  ErrorCodes,
  ErrorSeverity,
} from "../../utils/error";

export class TranscriptionService extends EventEmitter {
  private openai: OpenAI;
  private tempDir: string;
  private logger: LoggingService;
  private readonly MIN_CHUNK_SIZE = 4000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // ms

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.tempDir = path.join(os.tmpdir(), "transcriptions");
    this.logger = LoggingService.getInstance();
  }

  async transcribeAudioChunk(
    audioBuffer: ArrayBuffer,
    isFinal = false
  ): Promise<string> {
    try {
      if (audioBuffer.byteLength < this.MIN_CHUNK_SIZE) {
        this.logger.log(
          LogLevel.DEBUG,
          "Skipping short audio chunk",
          "TranscriptionService",
          { byteLength: audioBuffer.byteLength }
        );
        return "";
      }

      const tempFilePath = path.join(this.tempDir, `${uuidv4()}.wav`);
      await this.writeAudioFile(tempFilePath, audioBuffer);

      const transcription = await this.retryTranscription(
        tempFilePath,
        isFinal
      );

      await this.cleanup(tempFilePath);
      return transcription.trim();
    } catch (error) {
      throw new ExpenseTrackerError(
        "Failed to transcribe audio chunk",
        ErrorCodes.TRANSCRIPTION_FAILED,
        ErrorSeverity.MEDIUM,
        {
          component: "TranscriptionService.transcribeAudioChunk",
          originalError: error instanceof Error ? error.message : String(error),
          isFinal,
        }
      );
    }
  }

  async transcribeFinalAudio(totalBuffer: Buffer): Promise<string> {
    try {
      const tempFilePath = path.join(this.tempDir, `${uuidv4()}.wav`);
      await this.writeAudioFile(tempFilePath, totalBuffer);

      const transcription = await this.retryTranscription(tempFilePath, true);

      await this.cleanup(tempFilePath);
      return transcription.trim();
    } catch (error) {
      throw new ExpenseTrackerError(
        "Failed to transcribe final audio",
        ErrorCodes.TRANSCRIPTION_FAILED,
        ErrorSeverity.HIGH,
        {
          component: "TranscriptionService.transcribeFinalAudio",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async writeAudioFile(
    filePath: string,
    audioData: ArrayBuffer | Buffer
  ): Promise<void> {
    try {
      let dataToWrite: Buffer;

      if (Buffer.isBuffer(audioData)) {
        // It's already a Node.js Buffer
        dataToWrite = audioData;
      } else {
        // Otherwise, treat it as an ArrayBuffer
        // Cast to ArrayBuffer so TS knows which Buffer.from(...) overload to use
        dataToWrite = Buffer.from(audioData as ArrayBuffer);
      }

      await writeFile(filePath, dataToWrite);
    } catch (error) {
      throw new ExpenseTrackerError(
        "Failed to write audio file",
        ErrorCodes.FILE_OPERATION_FAILED,
        ErrorSeverity.MEDIUM,
        {
          component: "TranscriptionService.writeAudioFile",
          originalError: error instanceof Error ? error.message : String(error),
          filePath,
        }
      );
    }
  }

  private async retryTranscription(
    filePath: string,
    isFinal: boolean
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const audioStream = createReadStream(filePath);

        const transcription = await this.openai.audio.transcriptions.create({
          file: audioStream,
          model: "whisper-1",
          language: "en",
          response_format: "text",
          temperature: isFinal ? 0 : 0.3,
        });

        if (transcription) {
          this.logger.log(
            isFinal ? LogLevel.INFO : LogLevel.DEBUG,
            `Transcription successful on attempt ${attempt}`,
            "TranscriptionService",
            { isFinal, transcription }
          );
          return transcription;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
          continue;
        }
      }
    }

    throw new ExpenseTrackerError(
      "Max retries exceeded for transcription",
      ErrorCodes.TRANSCRIPTION_FAILED,
      ErrorSeverity.HIGH,
      {
        component: "TranscriptionService.retryTranscription",
        originalError: lastError?.message,
        attempts: this.MAX_RETRIES,
        isFinal,
      }
    );
  }

  private async cleanup(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      this.logger.error(
        new ExpenseTrackerError(
          "Failed to cleanup temporary file",
          ErrorCodes.FILE_OPERATION_FAILED,
          ErrorSeverity.LOW,
          {
            component: "TranscriptionService.cleanup",
            originalError:
              error instanceof Error ? error.message : String(error),
            filePath,
          }
        )
      );
    }
  }
}
