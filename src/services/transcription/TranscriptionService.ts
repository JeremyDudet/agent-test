import { OpenAI } from "openai";
import { EventEmitter } from "events";
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import path from "path";
import fs from "fs";

export class TranscriptionService extends EventEmitter {
  private openai: OpenAI;
  private tempDir: string;
  private readonly MIN_CHUNK_SIZE = 4000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // ms

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.tempDir = path.join(os.tmpdir(), "transcriptions");
  }

  // write audio to temporary file
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
      throw new Error(
        `Failed to write audio file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // transcribe audio with OpenAI Whisper API
  private async transcribe(filePath: string): Promise<string> {
    let lastError: Error | null = null;

    // try to transcribe the audio file up to MAX_RETRIES times
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const audioStream = createReadStream(filePath);

        const transcription = await this.openai.audio.transcriptions.create({
          file: audioStream,
          model: "whisper-1",
          language: "en",
          response_format: "text",
          temperature: 0.1,
        });

        if (transcription) {
          console.log(
            "[TRANSCRIPTION SERVICE] transcription successful!\n",
            `transcription: "${transcription}"`
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

    throw new Error(
      `Max retries exceeded for transcription: ${lastError?.message}`
    );
  }

  // cleanup temporary file
  private async cleanup(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      console.error(
        "Failed to cleanup temporary file:",
        error instanceof Error ? error.message : String(error),
        { filePath }
      );
    }
  }
  // the orchestrator for the transcription process
  async transcribeAudioChunk(audioBuffer: ArrayBuffer): Promise<string> {
    try {
      // check if audio buffer is too short, if so, skip
      if (audioBuffer.byteLength < this.MIN_CHUNK_SIZE) {
        console.log("Skipping short audio chunk", "TranscriptionService", {
          byteLength: audioBuffer.byteLength,
        });
        return "";
      }

      const tempFilePath = path.join(this.tempDir, `${uuidv4()}.wav`);
      // write audio to temporary file
      await this.writeAudioFile(tempFilePath, audioBuffer);

      // transcribe audio
      const transcription = await this.transcribe(tempFilePath);

      // cleanup temporary file
      await this.cleanup(tempFilePath);

      // return transcription without leading or trailing whitespace
      return transcription.trim();
    } catch (error) {
      throw new Error(
        `Failed to transcribe audio chunk: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
