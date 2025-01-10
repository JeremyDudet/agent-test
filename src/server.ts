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
import { LoggingService, LogLevel } from "./services/logging/LoggingService";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "./utils/error";
import { TranscriptionOrderManager } from "./services/transcription/TranscriptionOrderManager";

config();

// Initialize services
const stateManager = StateManager.getInstance();
const logger = LoggingService.getInstance();
const agent = new ExpenseAgent();
const transcriptionService = new TranscriptionService();
const aiContextManager = new AIContextManager();
const transcriptionOrderManager = new TranscriptionOrderManager();

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

  socket.on(
    "audioDataPartial",
    async (
      data: {
        audio: ArrayBuffer;
        context: any;
        sequenceId: number;
        timestamp: number;
      },
      callback
    ) => {
      logger.log(LogLevel.DEBUG, "Received audio data", "SocketServer", {
        sequenceId: data.sequenceId,
        audioSize: data.audio.byteLength,
      });
      try {
        const uint8Chunk = new Uint8Array(data.audio);
        userAudioBuffers[socket.id].push(uint8Chunk);

        // Get transcript from Whisper
        const partialTranscript =
          await transcriptionService.transcribeAudioChunk(data.audio, false);

        if (!partialTranscript.trim()) {
          callback({ success: true, sequenceId: data.sequenceId });
          return;
        }

        // Add to order manager
        transcriptionOrderManager.addChunk(
          data.sequenceId,
          data.timestamp,
          partialTranscript,
          false
        );

        // Send immediate callback with transcription
        callback({
          success: true,
          transcription: partialTranscript,
          sequenceId: data.sequenceId,
        });
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
        callback({
          success: false,
          error: trackerError.message,
          sequenceId: data.sequenceId,
        });
      }
    }
  );

  // Add transcription order manager event listener
  transcriptionOrderManager.on(
    "transcription",
    async ({ transcript, completeTranscript, id }) => {
      socket.emit("interimTranscript", {
        partial: transcript,
        complete: completeTranscript,
      });

      // Process through AI Context Manager
      await aiContextManager.processTranscript(socket.id, transcript);
    }
  );

  socket.on("audioComplete", async () => {
    try {
      // Clear the audio buffers since we don't need them anymore
      userAudioBuffers[socket.id] = [];

      // Finalize the session in AI Context Manager
      await aiContextManager.finalizeSession(socket.id);
    } catch (error) {
      const trackerError =
        error instanceof ExpenseTrackerError
          ? error
          : new ExpenseTrackerError(
              "Error completing audio session",
              ErrorCodes.AUDIO_COMPLETION_FAILED,
              ErrorSeverity.MEDIUM,
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
