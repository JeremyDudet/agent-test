import { Server } from "socket.io";
import { createServer } from "http";
import { config } from "dotenv";
import { ExpenseAgent } from "./core/Agent";
import { TranscriptionService } from "./services/transcription/TranscriptionService";
import { StateManager } from "./core/StateManager";
import { mkdir } from "fs/promises";
import { join } from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

config();

// Initialize state
const stateManager = StateManager.getInstance();
stateManager.setState({
  messages: [],
  context: {},
  currentStep: "initial",
  toolCalls: [],
  actionContext: {
    proposals: [],
    currentInput: "",
    isProcessing: false,
  },
});

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const agent = new ExpenseAgent();
const transcriptionService = new TranscriptionService();

// Create the transcriptions temp directory
const tempDir = join(os.tmpdir(), "transcriptions");
await mkdir(tempDir, { recursive: true });

// Store partial chunks as Uint8Array
const userAudioBuffers: Record<string, Uint8Array[]> = {};

io.on("connection", (socket) => {
  console.log("Client connected");

  // Keep an array of partial chunks in memory per client
  userAudioBuffers[socket.id] = [];

  socket.on("audioDataPartial", async (audioData: ArrayBuffer) => {
    try {
      const uint8Chunk = new Uint8Array(audioData);
      userAudioBuffers[socket.id].push(uint8Chunk);

      // Get a partial transcript from Whisper
      const partialTranscript = await transcriptionService.transcribeAudioChunk(
        audioData,
        false
      );
      if (!partialTranscript.trim()) return;

      // Always send partial text for real-time user feedback
      socket.emit("interimTranscript", partialTranscript);

      // Conditionally call agent.processPartialTranscript only if content is big enough
      const MIN_LENGTH_FOR_EXPENSE = 25;
      const HAS_EXPENSE_PATTERN = /\$?\d+(\.\d{2})?/.test(partialTranscript);
      if (
        partialTranscript.length >= MIN_LENGTH_FOR_EXPENSE &&
        HAS_EXPENSE_PATTERN
      ) {
        // You can adjust your logic to skip if it’s pure filler or not final enough
        const proposals = await agent.processPartialTranscript(
          partialTranscript
        );
        if (proposals.length > 0) {
          socket.emit("proposals", {
            proposals,
            isPartial: true,
          });
        }
      }
    } catch (error) {
      console.error("Error processing partial audio:", error);
      socket.emit("error", {
        message: "Error processing partial audio",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Final pass with all chunks
  socket.on("audioComplete", async () => {
    try {
      const allChunks = Buffer.concat(userAudioBuffers[socket.id]);
      userAudioBuffers[socket.id] = []; // clear out

      const finalTranscript = await transcriptionService.transcribeFinalAudio(
        allChunks
      );
      console.log("Audio complete. Final transcript:", finalTranscript);

      if (finalTranscript.length > 0) {
        const proposals = await agent.processMessage(finalTranscript);
        if (proposals.length > 0) {
          socket.emit("proposals", { proposals, isPartial: false });
        }
      }
      transcriptionService.clearAccumulatedTranscript();
    } catch (error) {
      console.error("Error completing audio:", error);
      socket.emit("error", {
        message: "Error completing audio",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    // Cleanup on disconnect
    delete userAudioBuffers[socket.id];
  });
});

const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
