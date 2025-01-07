import { Server } from "socket.io";
import { createServer } from "http";
import { config } from "dotenv";
import { ExpenseAgent } from "./core/Agent";
import { TranscriptionService } from "./services/transcription/TranscriptionService";
import { StateManager } from "./core/StateManager";
import { AIContextManager } from "./core/AIContextManager";
import { mkdir } from "fs/promises";
import { join } from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { LoggingService, LogLevel } from "./services/logging/LoggingService";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "./utils/error";

config();

// Initialize services
const stateManager = StateManager.getInstance();
const logger = LoggingService.getInstance();
const agent = new ExpenseAgent();
const transcriptionService = new TranscriptionService();
const aiContextManager = new AIContextManager();

// Initialize state
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

// Create the transcriptions temp directory
const tempDir = join(os.tmpdir(), "transcriptions");
await mkdir(tempDir, { recursive: true });

// Store partial chunks as Uint8Array
const userAudioBuffers: Record<string, Uint8Array[]> = {};

io.on("connection", async (socket) => {
  logger.log(LogLevel.INFO, "Client connected", "SocketServer", {
    socketId: socket.id,
  });

  // Initialize AI Context Manager for this session
  await aiContextManager.initializeSession(socket.id);
  userAudioBuffers[socket.id] = [];

  // Listen for context updates from AI Context Manager
  aiContextManager.on("contextLoaded", ({ sessionId, analysis }) => {
    if (sessionId === socket.id) {
      socket.emit("contextUpdate", { type: "historical", analysis });
    }
  });

  aiContextManager.on("semanticUnit", async ({ sessionId, text, context }) => {
    if (sessionId === socket.id) {
      // Process the semantic unit through the agent
      const proposals = await agent.processPartialTranscript(text);
      if (proposals.length > 0) {
        socket.emit("proposals", {
          proposals,
          isPartial: true,
          context,
        });
      }
    }
  });

  socket.on("audioDataPartial", async (audioData: ArrayBuffer) => {
    try {
      const uint8Chunk = new Uint8Array(audioData);
      userAudioBuffers[socket.id].push(uint8Chunk);

      // Get transcript from Whisper
      const partialTranscript = await transcriptionService.transcribeAudioChunk(
        audioData,
        false
      );
      if (!partialTranscript.trim()) return;

      socket.emit("interimTranscript", partialTranscript);

      // Process through AI Context Manager
      await aiContextManager.processTranscript(socket.id, partialTranscript);
    } catch (error) {
      const trackerError =
        error instanceof ExpenseTrackerError
          ? error
          : new ExpenseTrackerError(
              "Error processing partial audio",
              ErrorCodes.PARTIAL_PROCESSING_FAILED,
              ErrorSeverity.MEDIUM,
              {
                component: "SocketServer.audioDataPartial",
                originalError:
                  error instanceof Error ? error.message : String(error),
              }
            );

      logger.error(trackerError, "SocketServer");
      socket.emit("error", {
        message: trackerError.message,
        details: trackerError.metadata,
      });
    }
  });

  socket.on("audioComplete", async () => {
    try {
      const allChunks = Buffer.concat(userAudioBuffers[socket.id]);
      userAudioBuffers[socket.id] = []; // clear buffer

      const finalTranscript = await transcriptionService.transcribeFinalAudio(
        allChunks
      );
      logger.log(LogLevel.INFO, "Audio complete", "SocketServer", {
        finalTranscript,
      });

      // Finalize the session in AI Context Manager
      await aiContextManager.finalizeSession(socket.id);

      if (finalTranscript.length > 0) {
        const proposals = await agent.processMessage(finalTranscript);
        if (proposals.length > 0) {
          socket.emit("proposals", {
            proposals,
            isPartial: false,
            isFinal: true,
          });
        }
      }
    } catch (error) {
      const trackerError =
        error instanceof ExpenseTrackerError
          ? error
          : new ExpenseTrackerError(
              "Error completing audio",
              ErrorCodes.AUDIO_COMPLETION_FAILED,
              ErrorSeverity.HIGH,
              {
                component: "SocketServer.audioComplete",
                originalError:
                  error instanceof Error ? error.message : String(error),
              }
            );

      logger.error(trackerError, "SocketServer");
      socket.emit("error", {
        message: trackerError.message,
        details: trackerError.metadata,
      });
    }
  });

  socket.on("disconnect", () => {
    logger.log(LogLevel.INFO, "Client disconnected", "SocketServer", {
      socketId: socket.id,
    });
    delete userAudioBuffers[socket.id];
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  logger.log(LogLevel.INFO, `Server running on port ${port}`, "SocketServer");
});
