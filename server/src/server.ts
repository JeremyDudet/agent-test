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
import { format, parseISO, subDays, subMonths } from "date-fns";
import { userConfig, DEFAULT_TEST_USER_ID } from "./config";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { persistExpenseProposal, updateExpenseProposal, deleteExpenseProposal, getPendingExpenseProposals } from './services/database/expenses';
import { createClient } from '@supabase/supabase-js';

config();

// Initialize services
const stateManager = StateManager.getInstance();
const agent = new ExpenseAgent();
const transcriptionService = new TranscriptionService(); // orchestrator for the transcription process
const transcriptionOrderManager = new TranscriptionOrderManager(); // maintains the order of the transcription chunks

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

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase credentials in environment variables');
}

// Initialize Supabase admin client for auth
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error) {
      console.error('[Auth] Token verification failed:', error);
      return next(new Error('Invalid authentication token'));
    }

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.data.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Authentication failed:', error);
    next(new Error('Authentication failed'));
  }
});

// Insert the proposals broadcast registration after io is created
transcriptionOrderManager.on("proposals", (data) => {
  io.emit("proposals", data);
});

// Initialize state
stateManager.setState({
  isProcessing: false,
  messageWindow: {
    processedMessages: [],
    newMessages: [],
    windowSize: 20,
  },
  existingProposals: [],
  timeContext: {
    now: new Date(),
    formattedNow: formatInTimeZone(
      new Date(),
      userConfig.timeZone,
      "yyyy-MM-dd"
    ),
    timeZone: userConfig.timeZone || "America/Los_Angeles",
  },
  userExpenseCategories: await stateManager.getUserExpenseCategories(),
});

// Create the transcriptions temp directory
const tempDir = join(os.tmpdir(), "transcriptions");
await mkdir(tempDir, { recursive: true });

// Store partial chunks as Uint8Array
const userAudioBuffers: Record<string, Uint8Array[]> = {};
3;

// Add helper function after imports
function getCategoryId(categoryName: string, categories: Array<{ id: string; name: string }>) {
  const category = categories.find(c => c.name === categoryName);
  return category?.id;
}

io.on("connection", async (socket) => {
  console.log("Client connected", "SocketServer", {
    socketId: socket.id,
    userId: socket.data.user?.id
  });

  userAudioBuffers[socket.id] = [];
  
  // Load initial proposals on connection
  try {
    const pendingProposals = await getPendingExpenseProposals(socket.data.user.id);
    
    // Update state manager with the loaded proposals
    stateManager.updateState({
      existingProposals: pendingProposals
    });

    // Emit state change to trigger UI update
    const state = stateManager.getState();
    socket.emit('stateChanged', state);

    // Also emit the proposals directly to ensure the client receives them
    socket.emit('proposals', { proposals: pendingProposals });
  } catch (error) {
    console.error('[Socket] Error loading initial proposals:', error);
  }

  // Handle loading existing proposals on request
  socket.on('loadExistingProposals', async () => {
    try {
      const pendingProposals = await getPendingExpenseProposals(socket.data.user.id);
      
      // Update state manager
      stateManager.updateState({
        existingProposals: pendingProposals
      });

      // Emit state change to trigger UI update
      const state = stateManager.getState();
      socket.emit('stateChanged', state);

      // Also emit the proposals directly
      socket.emit('proposals', { proposals: pendingProposals });
    } catch (error) {
      console.error('[Socket] Error loading existing proposals:', error);
    }
  });

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
        transcriptionOrderManager.addChunk(
          data.sequenceId,
          data.timestamp,
          transcript,
          socket.data.user.id
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
        console.log("Error processing partial audio", {
          component: "SocketServer.audioDataPartial",
          error: error instanceof Error ? error.message : String(error),
        });

        // Send error information back to client
        if (callback) {
          callback({
            success: false,
            error: error instanceof Error ? error.message : String(error),
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
      console.error("Error completing audio session", {
        component: "SocketServer.audioComplete",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 3) On disconnect, remove the listeners for this socket
  socket.on("disconnect", () => {
    console.log("Client disconnected", "SocketServer", { socketId: socket.id });

    delete userAudioBuffers[socket.id];
  });

  // NEW: Handle proposal approval
  socket.on("proposalApproved", async (proposal) => {
    console.log("[Socket] Proposal approved:", proposal);
    try {
      const state = stateManager.getState();
      
      // The proposal already has the correct category ID, no need to look it up
      const savedProposal = await persistExpenseProposal({
        ...proposal,
        status: 'confirmed',
        user_id: socket.data.user.id,
      });
      
      // Update state by removing the approved proposal
      const updatedProposals = state.existingProposals.filter(p => p.id !== proposal.id);
      stateManager.updateState({
        existingProposals: updatedProposals
      });

      // Get updated state
      const newState = stateManager.getState();

      // Notify all clients of the state change
      io.emit('stateChanged', newState);

      // Notify all clients of the updated proposals list
      io.emit('proposals', { proposals: updatedProposals });

      // Notify the approving client of the successful save
      socket.emit("proposalSaved", savedProposal);
    } catch (error) {
      console.error("[Socket] Error approving proposal:", error);
      socket.emit("proposalError", { 
        error: error instanceof Error ? error.message : String(error),
        proposal
      });
    }
  });

  // NEW: Handle proposal rejection
  socket.on("proposalRejected", async (proposal) => {
    console.log("[Socket] Proposal rejected:", proposal);
    try {
      // Delete from database if it exists there
      if (proposal.id) {
        await deleteExpenseProposal(proposal.id);
      }

      // Update state
      const state = stateManager.getState();
      const updatedProposals = state.existingProposals.filter(p => p.id !== proposal.id);
      stateManager.updateState({
        existingProposals: updatedProposals
      });

      // Broadcast updated proposals
      io.emit("proposals", { proposals: updatedProposals });
    } catch (error) {
      console.error("[Socket] Error rejecting proposal:", error);
      socket.emit("proposalError", { 
        error: error instanceof Error ? error.message : String(error),
        proposal
      });
    }
  });

  // NEW: Handle proposal editing
  socket.on("proposalEdited", async (proposal) => {
    console.log("[Socket] Proposal edited:", proposal);
    try {
      // Update in database
      const updatedProposal = await updateExpenseProposal(proposal);
      
      // Update state
      const state = stateManager.getState();
      const updatedProposals = state.existingProposals.map(p => 
        p.id === proposal.id ? updatedProposal : p
      );
      stateManager.updateState({
        existingProposals: updatedProposals
      });

      // Broadcast updated proposals
      io.emit("proposals", { proposals: updatedProposals });
    } catch (error) {
      console.error("[Socket] Error editing proposal:", error);
      socket.emit("proposalError", { 
        error: error instanceof Error ? error.message : String(error),
        proposal 
      });
    }
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`, "SocketServer");
});
