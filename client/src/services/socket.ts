// socket.ts
import { io, Socket } from 'socket.io-client';
import { AgentState } from '../types';

let socket: Socket | null = null;
let isInitialized = false;

export const initSocket = (token: string | undefined) => {
  console.log('[SOCKET] Initializing socket with token:', token ? 'present' : 'missing');
  
  if (socket) {
    console.log('[SOCKET] Cleaning up existing socket connection');
    socket.close();
    socket = null;
    isInitialized = false;
  }

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
  console.log('[SOCKET] Connecting to backend URL:', backendUrl);

  const newSocket = io(backendUrl, {
    transports: ['websocket'],
    auth: {
      token
    }
  });

  // Connection error handling
  newSocket.on('connect', () => {
    console.log('[SOCKET] Connected successfully');
    isInitialized = true;
    
    // Request existing proposals on connection
    console.log('[SOCKET] Requesting existing proposals');
    newSocket.emit('loadExistingProposals');
  });

  newSocket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error.message);
    console.error('[SOCKET] Full error:', error);
    isInitialized = false;
  });

  newSocket.on('disconnect', (reason) => {
    console.error('[SOCKET] Disconnected. Reason:', reason);
    isInitialized = false;
  });

  newSocket.on('error', (error) => {
    console.error('[SOCKET] Socket error:', error);
  });

  // Enhanced socket events for semantic processing
  newSocket.on('semanticUpdate', (data) => {
    console.log('[SOCKET] Semantic understanding update:', data);
  });

  newSocket.on('contextProgress', (data) => {
    console.log('[SOCKET] Context building progress:', data);
  });

  newSocket.on('learningUpdate', (data) => {
    console.log('[SOCKET] Learning system update:', data);
  });

  newSocket.on(
    'contextUpdate',
    (data: {
      contextComplete: boolean;
      enhancedUnderstanding: boolean;
      learningUpdates?: string[];
    }) => {
      console.log('[SOCKET] Context update:', data);
    }
  );

  newSocket.on(
    'semanticUnitDetected',
    (data: { unit: string; confidence: number; requiresMoreContext: boolean }) => {
      console.log('[SOCKET] Semantic unit detected:', data);
    }
  );

  // Add handler for ordered transcriptions
  newSocket.on(
    'orderedTranscription',
    (data: { transcription: string; sequenceId: number; isComplete: boolean }) => {
      console.log('[SOCKET] Received ordered transcription:', data);
    }
  );

  // State change handler
  newSocket.on('stateChanged', (state: AgentState) => {
    console.log('[SOCKET] Agent state updated:', {
      isProcessing: state.isProcessing,
      messageCount: {
        processed: state.messageWindow.processedMessages.length,
        new: state.messageWindow.newMessages.length,
      },
      proposalsCount: state.existingProposals.length,
      categories: state.userExpenseCategories.map((cat) => cat.name),
      time: state.timeContext.formattedNow,
    });

    // Dispatch state change event
    const stateChangeEvent = new CustomEvent('agentStateChanged', {
      detail: state,
    });
    window.dispatchEvent(stateChangeEvent);
  });

  // Handle proposals updates
  newSocket.on('proposals', (data: { proposals: any[] }) => {
    console.log('[SOCKET] Received proposals update:', data);
    const proposalsEvent = new CustomEvent('proposalsUpdated', {
      detail: data.proposals,
    });
    window.dispatchEvent(proposalsEvent);
  });

  // Handle successful proposal save
  newSocket.on('proposalSaved', (data: any) => {
    console.log('[SOCKET] Proposal saved successfully:', data);
    const savedEvent = new CustomEvent('proposalSaved', {
      detail: data,
    });
    window.dispatchEvent(savedEvent);
  });

  // Handle proposal errors
  newSocket.on('proposalError', (data: { error: string; proposal: any }) => {
    console.error('[SOCKET] Proposal error:', data);
    const errorEvent = new CustomEvent('proposalError', {
      detail: data,
    });
    window.dispatchEvent(errorEvent);
  });

  // Add handler for existing proposals
  newSocket.on('existingProposals', (proposals: any[]) => {
    console.log('[SOCKET] Received existing proposals:', proposals);
    const proposalsEvent = new CustomEvent('existingProposalsLoaded', {
      detail: proposals,
    });
    window.dispatchEvent(proposalsEvent);
  });

  socket = newSocket;
  return newSocket;
};

export const getSocket = () => {
  if (!socket || !isInitialized) {
    throw new Error('Socket not initialized or not connected. Call initSocket first and wait for connection.');
  }
  return socket;
};

export const isSocketReady = () => {
  return isInitialized && socket?.connected;
};

export const closeSocket = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
  isInitialized = false;
};
