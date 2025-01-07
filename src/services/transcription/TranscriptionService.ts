import { OpenAI } from "openai";
import { EventEmitter } from "events";
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import path from "path";
import fs from "fs";

interface TranscriptionEvents {
  transcriptionComplete: (text: string) => void;
  transcriptionError: (error: Error) => void;
  transcriptionProgress: (progress: number) => void;
}

export class TranscriptionService extends EventEmitter {
  private openai: OpenAI;
  private tempDir: string;

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.tempDir = path.join(os.tmpdir(), "transcriptions");
  }

  async transcribeAudioChunk(audioBuffer: ArrayBuffer): Promise<string> {
    try {
      // Generate a temporary file path
      const tempFilePath = path.join(this.tempDir, `${uuidv4()}.wav`);

      // Write the audio buffer to a temporary file
      await writeFile(tempFilePath, Buffer.from(audioBuffer));

      // Create a readable stream from the temporary file
      const audioStream = createReadStream(tempFilePath);

      // Call Whisper API
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        language: "en",
        response_format: "text",
      });

      // Clean up the temporary file
      await fs.promises.unlink(tempFilePath);

      return transcription;
    } catch (error) {
      console.error("Transcription error:", error);
      this.emit(
        "transcriptionError",
        error instanceof Error ? error : new Error(String(error))
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async transcribeAudioComplete(audioBuffer: ArrayBuffer): Promise<string> {
    try {
      const tempFilePath = path.join(this.tempDir, `${uuidv4()}.wav`);
      await writeFile(tempFilePath, Buffer.from(audioBuffer));
      const audioStream = createReadStream(tempFilePath);

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        language: "en",
        response_format: "text",
      });

      await fs.promises.unlink(tempFilePath);
      this.emit("transcriptionComplete", transcription);
      return transcription;
    } catch (error) {
      console.error("Final transcription error:", error);
      this.emit(
        "transcriptionError",
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  public on<K extends keyof TranscriptionEvents>(
    event: K,
    listener: TranscriptionEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof TranscriptionEvents>(
    event: K,
    ...args: Parameters<TranscriptionEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
