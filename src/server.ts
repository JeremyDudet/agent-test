// src/server.ts

import os from "os";
import { Server } from "socket.io";
import { createServer } from "http";
import { mkdir } from "fs/promises";
import { join } from "path";
import { config } from "dotenv";
import { ExpenseAgent } from "./core/Agent";
import { StateManager } from "./core/StateManager";
import { AIContextManager } from "./core/AIContextManager";
import { TranscriptionOrderManager } from "./services/transcription/TranscriptionOrderManager";
import { TranscriptionService } from "./services/transcription/TranscriptionService";
import { LoggingService, LogLevel } from "./services/logging/LoggingService";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "./utils/error";

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

  // 1) Set up per-socket event listeners here
  const handleContextLoaded = ({ sessionId, analysis }: any) => {
    if (sessionId === socket.id) {
      socket.emit("contextUpdate", { type: "historical", analysis });
    }
  };

  const handleSemanticUnit = async ({
    sessionId,
    text,
    context,
  }: {
    sessionId: string;
    text: string;
    context: any;
  }) => {
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
  };

  const handleTranscription = async ({
    transcript,
    completeTranscript,
    id,
  }: {
    transcript: string;
    completeTranscript: string;
    id: string;
  }) => {
    socket.emit("interimTranscript", {
      partial: transcript,
      complete: completeTranscript,
    });

    // Process through AI Context Manager
    await aiContextManager.processTranscript(socket.id, transcript);
  };

  // 2) Attach these listeners to the managers
  aiContextManager.on("contextLoaded", handleContextLoaded);
  aiContextManager.on("semanticUnit", handleSemanticUnit);
  transcriptionOrderManager.on("transcription", handleTranscription);

  // Initialize AI Context Manager for this session
  await aiContextManager.initializeSession(socket.id);
  userAudioBuffers[socket.id] = [];

  // This is the main handler for audio chunks coming in from the client
  // It processes incoming audio data in chunks, transcribes them, and manages the transcription order
  socket.on(
    "audioDataPartial",
    async (
      data: {
        audio: ArrayBuffer; // Raw audio data buffer
        context: any; // Additional context information
        sequenceId: number; // Sequence number to maintain order
        timestamp: number; // Timestamp when chunk was recorded
      },
      callback?: (response: any) => void // Optional callback to send results back
    ) => {
      // Log receipt of audio chunk with metadata
      console.log(
        `🎤 Received audio chunk #${data.sequenceId} [${
          data.audio.byteLength
        } bytes] at ${new Date(data.timestamp).toISOString()}`
      );
      try {
        // Convert ArrayBuffer to Uint8Array and store in buffer
        const uint8Chunk = new Uint8Array(data.audio);
        userAudioBuffers[socket.id].push(uint8Chunk);

        // Attempt to transcribe the audio chunk
        // The false parameter indicates this is a partial (not final) transcription
        const partialTranscript =
          await transcriptionService.transcribeAudioChunk(data.audio, false);

        // If transcription is empty, send success callback and exit early
        if (!partialTranscript.trim()) {
          if (callback) {
            callback({ success: true, sequenceId: data.sequenceId });
          }
          return;
        }

        // Add transcribed chunk to order manager to maintain sequence
        // The false parameter indicates this is not the final chunk
        transcriptionOrderManager.addChunk(
          data.sequenceId,
          data.timestamp,
          partialTranscript,
          false
        );

        // Send successful transcription result back to client
        if (callback) {
          callback({
            success: true,
            transcription: partialTranscript,
            sequenceId: data.sequenceId,
          });
        }
      } catch (error) {
        // Handle any errors during processing
        // Convert generic errors to ExpenseTrackerError for consistent error handling
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

        // Log the error
        logger.error(trackerError, "SocketServer");

        // Send error information back to client
        if (callback) {
          callback({
            success: false,
            error: trackerError.message,
            sequenceId: data.sequenceId,
          });
        }
      }
    }
  );

  socket.on("audioComplete", async () => {
    try {
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

  // 3) On disconnect, remove the listeners for this socket
  socket.on("disconnect", () => {
    logger.log(LogLevel.INFO, "Client disconnected", "SocketServer", {
      socketId: socket.id,
    });

    // Remove only the listeners this socket added
    aiContextManager.off("contextLoaded", handleContextLoaded);
    aiContextManager.off("semanticUnit", handleSemanticUnit);
    transcriptionOrderManager.off("transcription", handleTranscription);

    delete userAudioBuffers[socket.id];
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  logger.log(LogLevel.INFO, `Server running on port ${port}`, "SocketServer");
});
