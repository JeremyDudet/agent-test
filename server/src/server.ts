// src/server.ts

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from 'dotenv';
import expenseRoutes from './routes/api/v1/expenses';
import { errorHandler } from './middleware/error/errorHandler';
import os from "os";
import { mkdir } from "fs/promises";
import { join } from "path";
import { ExpenseAgent } from "./core/Agent";
import { StateManager } from "./core/StateManager";
import { TranscriptionOrderManager } from "./services/transcription/TranscriptionOrderManager";
import { TranscriptionService } from "./services/transcription/TranscriptionService";
import { userConfig } from "./config";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from '@supabase/supabase-js';
import { getPendingExpenseProposals } from './services/database/expenses';
import { updateExpenseProposal } from './services/database/expenses';

// Load environment variables
config();

// Create Express app
const app = express();

// Configure middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

// API routes
app.use('/api/v1/expenses', expenseRoutes);

// Error handling
app.use(errorHandler);

// Create HTTP server
const httpServer = createServer(app);

// Configure Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize services
const stateManager = StateManager.getInstance();
const agent = new ExpenseAgent();
const transcriptionService = new TranscriptionService();
const transcriptionOrderManager = new TranscriptionOrderManager();

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

// Add helper function after imports
function getCategoryId(categoryName: string, categories: Array<{ id: string; name: string }>) {
  const category = categories.find(c => c.name === categoryName);
  return category?.id;
}

io.on('connection', async (socket) => {
  console.log('Client connected');

  // Load initial pending proposals for the user
  const userId = socket.data.user?.id;
  if (userId) {
    try {
      const pendingProposals = await getPendingExpenseProposals(userId);
      stateManager.setState({
        ...stateManager.getState(),
        existingProposals: pendingProposals || []
      });
      
      // Emit the initial state to the connected client
      socket.emit('state', stateManager.getState());
    } catch (error) {
      console.error('Error loading pending proposals:', error);
    }
  }

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  // Handle proposal approval
  socket.on('proposalApproved', async (proposal) => {
    try {
      if (!socket.data.user?.id) {
        socket.emit('proposalError', { error: 'Unauthorized', proposal });
        return;
      }

      // Update the proposal status to confirmed
      const updatedProposal = await updateExpenseProposal({
        ...proposal,
        status: 'confirmed',
        user_id: socket.data.user.id
      });

      // Update the state
      const state = stateManager.getState();
      stateManager.setState({
        ...state,
        existingProposals: state.existingProposals.filter(p => p.id !== proposal.id)
      });

      // Notify the client
      socket.emit('proposalUpdated', updatedProposal);
    } catch (error) {
      console.error('Error approving proposal:', error);
      socket.emit('proposalError', { 
        error: error instanceof Error ? error.message : 'Failed to approve proposal',
        proposal 
      });
    }
  });

  // Handle proposal rejection
  socket.on('proposalRejected', async (proposal) => {
    try {
      if (!socket.data.user?.id) {
        socket.emit('proposalError', { error: 'Unauthorized', proposal });
        return;
      }

      // Update the proposal status to rejected
      const updatedProposal = await updateExpenseProposal({
        ...proposal,
        status: 'rejected',
        user_id: socket.data.user.id
      });

      // Update the state
      const state = stateManager.getState();
      stateManager.setState({
        ...state,
        existingProposals: state.existingProposals.filter(p => p.id !== proposal.id)
      });

      // Notify the client
      socket.emit('proposalUpdated', updatedProposal);
    } catch (error) {
      console.error('Error rejecting proposal:', error);
      socket.emit('proposalError', { 
        error: error instanceof Error ? error.message : 'Failed to reject proposal',
        proposal 
      });
    }
  });

  // Handle incoming audio data
  socket.on('audioData', async (data: { audio: ArrayBuffer; context: any; sequenceId: number; timestamp: number }, callback) => {
    try {
      console.log('[AUDIO] Received chunk with sequenceId:', data.sequenceId);
      
      // Process the audio chunk through the transcription service
      const transcription = await transcriptionService.transcribeAudioChunk(data.audio);
      
      // Add the transcription to the order manager for processing
      transcriptionOrderManager.addChunk(
        data.sequenceId,
        data.timestamp,
        transcription,
        socket.data.user.id
      );
      
      // Send back success response with transcription
      callback({
        success: true,
        transcription,
        sequenceId: data.sequenceId,
        timestamp: data.timestamp
      });

    } catch (error) {
      console.error('[AUDIO] Error processing audio chunk:', error);
      callback({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        sequenceId: data.sequenceId
      });
    }
  });

  // Handle audio recording completion
  socket.on('audioComplete', () => {
    console.log('[AUDIO] Recording completed');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
