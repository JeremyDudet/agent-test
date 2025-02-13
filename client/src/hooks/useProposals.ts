import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Proposal } from '../types';
import useStore from '../store/useStore';

export function useProposals() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { proposals, updateProposals, authToken } = useStore();

  const fetchProposals = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.get<Proposal[]>('/api/v1/expenses/proposals/pending', authToken);
      updateProposals(data);
    } catch (err) {
      console.error('Error fetching proposals:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch proposals');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchProposals();
    }
  }, [authToken]);

  return {
    proposals,
    isLoading,
    error,
    refetch: fetchProposals,
    updateProposals
  };
} 