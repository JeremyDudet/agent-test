import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Dashboard } from '../Dashboard';
import { getSocket, isSocketReady } from '../../services/socket';
import { useProposals } from '../../hooks/useProposals';
import useStore from '../../store/useStore';
import { useToast } from '@/components/ui/use-toast';

// Mock the dependencies
vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(),
  isSocketReady: vi.fn(),
}));

vi.mock('../../hooks/useProposals', () => ({
  useProposals: vi.fn(),
}));

vi.mock('../../store/useStore', () => ({
  default: vi.fn(),
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: vi.fn(),
}));

// Mock socket.io client
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
};

// Mock proposals data
const mockProposals = [
  {
    id: '1',
    amount: 50,
    merchant: 'Uber Eats',
    category: 'Food & Dining',
    date: '2025-02-13',
    status: 'pending_review',
    description: 'Lunch delivery',
  },
];

describe('Dashboard', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    (isSocketReady as any).mockReturnValue(true);
    (getSocket as any).mockReturnValue(mockSocket);
    
    (useProposals as any).mockReturnValue({
      proposals: mockProposals,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      updateProposals: vi.fn(),
    });

    (useStore as any).mockReturnValue({
      user: { id: '123', name: 'Test User' },
    });

    (useToast as any).mockReturnValue({
      toast: vi.fn(),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', () => {
    render(<Dashboard />);
    expect(screen.getByText('Voice Expense Recorder')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    (useProposals as any).mockReturnValue({
      proposals: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      updateProposals: vi.fn(),
    });

    render(<Dashboard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error message when there is an error', () => {
    const errorMessage = 'Failed to load proposals';
    (useProposals as any).mockReturnValue({
      proposals: [],
      isLoading: false,
      error: errorMessage,
      refetch: vi.fn(),
      updateProposals: vi.fn(),
    });

    render(<Dashboard />);
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('renders proposals list when data is loaded', () => {
    render(<Dashboard />);
    expect(screen.getByText('Uber Eats')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('sets up socket event listeners on mount', () => {
    render(<Dashboard />);
    expect(mockSocket.on).toHaveBeenCalledWith('proposals', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('proposalSaved', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('stateChanged', expect.any(Function));
  });

  it('cleans up socket event listeners on unmount', () => {
    const { unmount } = render(<Dashboard />);
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('proposals');
    expect(mockSocket.off).toHaveBeenCalledWith('proposalSaved');
    expect(mockSocket.off).toHaveBeenCalledWith('stateChanged');
  });

  it('handles new proposals from socket', async () => {
    const { refetch } = useProposals() as { refetch: () => void };
    const { toast } = useToast() as { toast: (props: any) => void };
    
    render(<Dashboard />);

    // Get the proposals event handler
    const proposalsCall = mockSocket.on.mock.calls.find(
      call => call[0] === 'proposals'
    );
    const proposalsHandler = proposalsCall ? proposalsCall[1] : null;
    expect(proposalsHandler).toBeTruthy();

    if (proposalsHandler) {
      // Simulate receiving new proposals
      proposalsHandler({ proposals: [{ id: '2', amount: 25, merchant: 'Starbucks' }] });

      expect(refetch).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith({
        title: 'New Expense Detected',
        description: 'A new expense proposal has been created.',
      });
    }
  });

  it('handles proposal approval', async () => {
    const { refetch } = useProposals() as { refetch: () => void };
    const { toast } = useToast() as { toast: (props: any) => void };
    
    render(<Dashboard />);

    // Find and click the approve button
    const approveButton = screen.getByRole('button', { name: /accept/i });
    fireEvent.click(approveButton);

    expect(mockSocket.emit).toHaveBeenCalledWith('proposalApproved', mockProposals[0]);
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Expense approved successfully',
      });
    });
  });

  it('handles proposal rejection', async () => {
    const { refetch } = useProposals() as { refetch: () => void };
    const { toast } = useToast() as { toast: (props: any) => void };
    
    render(<Dashboard />);

    // Find and click the reject button
    const rejectButton = screen.getByRole('button', { name: /reject/i });
    fireEvent.click(rejectButton);

    expect(mockSocket.emit).toHaveBeenCalledWith('proposalRejected', mockProposals[0]);
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Expense rejected successfully',
      });
    });
  });

  it('handles socket disconnection during proposal actions', async () => {
    const { toast } = useToast() as { toast: (props: any) => void };
    mockSocket.connected = false;
    
    render(<Dashboard />);

    // Try to approve a proposal while disconnected
    const approveButton = screen.getByRole('button', { name: /accept/i });
    fireEvent.click(approveButton);

    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Error',
      description: 'Not connected to server',
    });
  });

  it('handles state changes from socket', async () => {
    const { updateProposals } = useProposals() as { updateProposals: (proposals: any[]) => void };
    
    render(<Dashboard />);

    // Get the stateChanged event handler
    const stateChangedCall = mockSocket.on.mock.calls.find(
      call => call[0] === 'stateChanged'
    );
    const stateChangedHandler = stateChangedCall ? stateChangedCall[1] : null;
    expect(stateChangedHandler).toBeTruthy();

    if (stateChangedHandler) {
      // Simulate receiving state change
      const newProposals = [{ id: '3', amount: 75, merchant: 'Amazon' }];
      stateChangedHandler({ existingProposals: newProposals });

      expect(updateProposals).toHaveBeenCalledWith(newProposals);
    }
  });
}); 