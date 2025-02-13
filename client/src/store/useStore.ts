import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { persist } from 'zustand/middleware';
import { 
  ClientState, 
  Proposal, 
  Message, 
  ExpenseCategory,
  AudioChunk,
  SemanticContext 
} from '../types';

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthSlice {
  user: User | null;
  isAuthenticated: boolean;
  authToken: string | null;
  setUser: (user: User | null) => void;
  setAuthToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

interface AudioSlice {
  isListening: boolean;
  isRecording: boolean;
  isVadInitializing: boolean;
  isNoiseAnalyzing: boolean;
  audioChunks: AudioChunk[];
  setListening: (isListening: boolean) => void;
  setRecording: (isRecording: boolean) => void;
  setVadInitializing: (isVadInitializing: boolean) => void;
  setNoiseAnalyzing: (isNoiseAnalyzing: boolean) => void;
  addAudioChunk: (chunk: AudioChunk) => void;
  clearAudioChunks: () => void;
}

interface TranscriptionSlice {
  transcriptions: string[];
  addTranscription: (transcription: string) => void;
  clearTranscriptions: () => void;
}

interface ProposalSlice {
  proposals: Proposal[];
  updateProposals: (proposals: Proposal[]) => void;
  addProposal: (proposal: Proposal) => void;
  removeProposal: (proposalId: string | number) => void;
  updateProposalStatus: (proposalId: string | number, status: Proposal['status']) => void;
}

interface MessageSlice {
  messageWindow: {
    processedMessages: Message[];
    newMessages: Message[];
  };
  addProcessedMessage: (message: Message) => void;
  addNewMessage: (message: Message) => void;
  clearNewMessages: () => void;
  clearAllMessages: () => void;
}

interface CategorySlice {
  userExpenseCategories: ExpenseCategory[];
  setUserExpenseCategories: (categories: ExpenseCategory[]) => void;
  addExpenseCategory: (category: ExpenseCategory) => void;
  removeExpenseCategory: (categoryId: string) => void;
}

interface SystemSlice {
  isProcessing: boolean;
  isInitializing: boolean;
  error: string | null;
  setProcessing: (isProcessing: boolean) => void;
  setInitializing: (isInitializing: boolean) => void;
  setError: (error: string | null) => void;
}

type Store = SystemSlice & AudioSlice & TranscriptionSlice & ProposalSlice & MessageSlice & CategorySlice & AuthSlice;

const useStore = create<Store>()(
  devtools(
    persist(
      (set) => ({
        // Auth State
        user: null,
        isAuthenticated: false,
        authToken: null,
        setUser: (user) => set({ user, isAuthenticated: !!user }),
        setAuthToken: (token) => set({ authToken: token }),
        login: (user, token) => set({ 
          user, 
          authToken: token, 
          isAuthenticated: true 
        }),
        logout: () => set({ 
          user: null, 
          authToken: null, 
          isAuthenticated: false,
          // Clear user-specific data
          proposals: [],
          userExpenseCategories: [],
          messageWindow: {
            processedMessages: [],
            newMessages: [],
          },
        }),

        // System State
        isProcessing: false,
        isInitializing: false,
        error: null,
        setProcessing: (isProcessing) => set({ isProcessing }),
        setInitializing: (isInitializing) => set({ isInitializing }),
        setError: (error) => set({ error }),

        // Audio State
        isListening: false,
        isRecording: false,
        isVadInitializing: false,
        isNoiseAnalyzing: false,
        audioChunks: [],
        setListening: (isListening) => set({ isListening }),
        setRecording: (isRecording) => set({ isRecording }),
        setVadInitializing: (isVadInitializing) => set({ isVadInitializing }),
        setNoiseAnalyzing: (isNoiseAnalyzing) => set({ isNoiseAnalyzing }),
        addAudioChunk: (chunk) => set((state) => ({ audioChunks: [...state.audioChunks, chunk] })),
        clearAudioChunks: () => set({ audioChunks: [] }),

        // Transcription State
        transcriptions: [],
        addTranscription: (transcription) => 
          set((state) => ({ transcriptions: [...state.transcriptions, transcription] })),
        clearTranscriptions: () => set({ transcriptions: [] }),

        // Proposal State
        proposals: [],
        updateProposals: (proposals) => set({ proposals }),
        addProposal: (proposal) => 
          set((state) => ({ proposals: [...state.proposals, proposal] })),
        removeProposal: (proposalId) => 
          set((state) => ({
            proposals: state.proposals.filter((p) => p.id !== proposalId),
          })),
        updateProposalStatus: (proposalId, status) =>
          set((state) => ({
            proposals: state.proposals.map((p) =>
              p.id === proposalId ? { ...p, status } : p
            ),
          })),

        // Message State
        messageWindow: {
          processedMessages: [],
          newMessages: [],
        },
        addProcessedMessage: (message) =>
          set((state) => {
            // Validate message content
            const content = message.content.trim();
            if (content.length <= 1 || /^[.\s]*$/.test(content)) {
              return state; // Return unchanged state for invalid messages
            }
            return {
              messageWindow: {
                ...state.messageWindow,
                processedMessages: [...state.messageWindow.processedMessages, message],
              },
            };
          }),
        addNewMessage: (message) =>
          set((state) => {
            // Validate message content
            const content = message.content.trim();
            if (content.length <= 1 || /^[.\s]*$/.test(content)) {
              return state; // Return unchanged state for invalid messages
            }
            return {
              messageWindow: {
                ...state.messageWindow,
                newMessages: [...state.messageWindow.newMessages, message],
              },
            };
          }),
        clearNewMessages: () =>
          set((state) => ({
            messageWindow: {
              ...state.messageWindow,
              newMessages: [],
            },
          })),
        clearAllMessages: () =>
          set({
            messageWindow: {
              processedMessages: [],
              newMessages: [],
            },
          }),

        // Category State
        userExpenseCategories: [],
        setUserExpenseCategories: (categories) => set({ userExpenseCategories: categories }),
        addExpenseCategory: (category) =>
          set((state) => ({
            userExpenseCategories: [...state.userExpenseCategories, category],
          })),
        removeExpenseCategory: (categoryId) =>
          set((state) => ({
            userExpenseCategories: state.userExpenseCategories.filter(
              (c) => c.id !== categoryId
            ),
          })),
      }),
      {
        name: 'expense-tracker-store',
        partialize: (state) => ({
          // Only persist auth-related state
          user: state.user,
          authToken: state.authToken,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    )
  )
);

export default useStore; 