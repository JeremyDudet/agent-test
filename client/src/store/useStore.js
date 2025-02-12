import create from 'zustand';

const useStore = create((set) => ({
  isProcessing: false,
  isListening: false,
  isRecording: false,
  isInitializing: false,
  error: null,
  transcriptions: [],
  proposals: [],
  messageWindow: {
    processedMessages: [],
    newMessages: [],
  },
  userExpenseCategories: [],

  // Actions
  setProcessing: (isProcessing) => set({ isProcessing }),
  setListening: (isListening) => set({ isListening }),
  setRecording: (isRecording) => set({ isRecording }),
  setInitializing: (isInitializing) => set({ isInitializing }),
  setError: (error) => set({ error }),
  addTranscription: (transcription) =>
    set((state) => ({
      transcriptions: [...state.transcriptions, transcription],
    })),
  updateProposals: (proposals) => set({ proposals }),
  removeProposal: (proposalId) =>
    set((state) => ({
      proposals: state.proposals.filter((p) => p.id !== proposalId),
    })),
  reset: () =>
    set({
      isProcessing: false,
      isListening: false,
      isRecording: false,
      isInitializing: false,
      error: null,
      transcriptions: [],
    }),
}));

export default useStore; 