import { useState, useEffect } from 'react';
import { stateManager } from '../services/StateManager';
import type { ClientState } from '../types';

export function useAppState() {
  const [state, setState] = useState<ClientState>(stateManager.getState());

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = stateManager.subscribe(newState => {
      setState(newState);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return {
    state,
    // Expose state manager methods
    updateState: stateManager.updateState.bind(stateManager),
    handleServerState: stateManager.handleServerState.bind(stateManager),
    addTranscription: stateManager.addTranscription.bind(stateManager),
    updateProposals: stateManager.updateProposals.bind(stateManager),
    removeProposal: stateManager.removeProposal.bind(stateManager),
    setError: stateManager.setError.bind(stateManager),
    reset: stateManager.reset.bind(stateManager),
  };
} 