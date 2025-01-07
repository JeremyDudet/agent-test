import { Server } from "socket.io";
import { createServer } from "http";
import { config } from "dotenv";
import { ExpenseAgent } from "./core/Agent";
import { TranscriptionService } from "./services/transcription/TranscriptionService";
import { StateManager } from "./core/StateManager";
import { mkdir } from "fs/promises";
import { join } from "path";
import os from "os";

config();

// Initialize state before creating server
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

// Create transcriptions directory
const tempDir = join(os.tmpdir(), "transcriptions");
await mkdir(tempDir, { recursive: true });

// Buffer to accumulate transcribed text
let transcriptionBuffer = "";

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("audioDataPartial", async (audioData: ArrayBuffer) => {
    try {
      console.log("Received audio chunk, size:", audioData.byteLength);

      // Transcribe the audio chunk
      const transcription = await transcriptionService.transcribeAudioChunk(
        audioData
      );
      console.log("Transcription result:", transcription);

      if (!transcription) {
        console.log("No transcription result");
        return;
      }

      // Accumulate transcribed text
      transcriptionBuffer += transcription + " ";
      console.log("Current transcription buffer:", transcriptionBuffer);

      // Only process if we have meaningful text
      if (transcriptionBuffer.trim().length > 0) {
        // Process accumulated text through agent
        const proposals = await agent.processMessage(
          transcriptionBuffer.trim()
        );
        console.log("Generated proposals:", proposals);

        if (proposals.length > 0) {
          socket.emit("proposals", { proposals });
        }
      }
    } catch (error) {
      console.error("Error processing audio:", error);
      socket.emit("error", {
        message: "Error processing audio",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  socket.on("audioComplete", async () => {
    try {
      console.log("Audio complete. Final buffer:", transcriptionBuffer);

      if (transcriptionBuffer.trim().length > 0) {
        const proposals = await agent.processMessage(
          transcriptionBuffer.trim()
        );
        console.log("Final proposals:", proposals);

        if (proposals.length > 0) {
          socket.emit("proposals", { proposals });
        }
      }

      // Clear buffer for next recording
      transcriptionBuffer = "";
    } catch (error) {
      console.error("Error processing final audio:", error);
      socket.emit("error", {
        message: "Error processing final audio",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    transcriptionBuffer = ""; // Clear buffer on disconnect
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
