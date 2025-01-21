// src/server.ts

import os from "os";
import { Server } from "socket.io";
import { createServer } from "http";
import { mkdir } from "fs/promises";
import { join } from "path";
import { config } from "dotenv";
import { ExpenseAgent } from "./core/Agent";
import { StateManager } from "./core/StateManager";
import { TranscriptionOrderManager } from "./services/transcription/TranscriptionOrderManager";
import { TranscriptionService } from "./services/transcription/TranscriptionService";
import { ExpenseTrackerError, ErrorCodes, ErrorSeverity } from "./utils/error";
import type { ActionProposal } from "./types";

config();

// Initialize services
const stateManager = StateManager.getInstance();
const agent = new ExpenseAgent();
const transcriptionService = new TranscriptionService(); // orchestrator for the transcription process
const transcriptionOrderManager = new TranscriptionOrderManager(); // maintains the order of the transcription chunks

// Initialize state
stateManager.setState({
  isProcessing: false,
  messageWindow: {
    processedMessages: [],
    newMessages: [],
    windowSize: 20,
  },
  existingProposals: [],
  currentStep: "initial",
  actionContext: {
    proposals: [],
    currentInput: "",
    isProcessing: false,
  },
  toolCalls: [],
});

const httpServer = createServer();
const io = new Server(httpServer, {
  transports: ["websocket"],
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowEIO3: true,
  pingInterval: 25000, // 25 seconds - How often to send a ping
  pingTimeout: 60000, // 60 seconds - How long to wait for a pong response
});

// Create the transcriptions temp directory
const tempDir = join(os.tmpdir(), "transcriptions");
await mkdir(tempDir, { recursive: true });

// Store partial chunks as Uint8Array
const userAudioBuffers: Record<string, Uint8Array[]> = {};
3;

io.on("connection", async (socket) => {
  console.log("Client connected", "SocketServer", {
    socketId: socket.id,
  });

  userAudioBuffers[socket.id] = [];

  // This is the main handler for audio chunks coming in from the client
  socket.on(
    "audioData",
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

        // transcribe the audio chunk
        const transcript = await transcriptionService.transcribeAudioChunk(
          data.audio
        );

        // if transcription is empty, send success callback and exit early
        if (!transcript.trim()) {
          if (callback) {
            callback({ success: true, sequenceId: data.sequenceId });
          }
          return;
        }

        // add transcribed chunk to order manager to maintain sequence
        // the false parameter indicates this is not the final chunk
        transcriptionOrderManager.addChunk(
          data.sequenceId,
          data.timestamp,
          transcript
        );

        // send successful transcription result back to client
        if (callback) {
          callback({
            success: true,
            transcription: transcript,
            sequenceId: data.sequenceId,
          });
        }
      } catch (error) {
        // handle any errors during processing
        // convert generic errors to ExpenseTrackerError for consistent error handling
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
        console.error(trackerError, "SocketServer");

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
      // Reset the audio buffer for this socket ID when audio recording is complete
      userAudioBuffers[socket.id] = [];
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
      console.error(trackerError, "SocketServer");
      socket.emit("error", {
        message: trackerError.message,
        details: trackerError.metadata,
      });
    }
  });

  // 3) On disconnect, remove the listeners for this socket
  socket.on("disconnect", () => {
    console.log("Client disconnected", "SocketServer", {
      socketId: socket.id,
    });

    delete userAudioBuffers[socket.id];
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`, "SocketServer");
});
