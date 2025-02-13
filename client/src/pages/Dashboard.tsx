import { AudioRecorder } from '../components/AudioRecorder';
import { ProposalsList } from '../components/ProposalsList';
import { useProposals } from '../hooks/useProposals';
import useStore from '../store/useStore';
import { Alert, AlertDescription } from "../components/ui/alert";
import { Loader2 } from "lucide-react";
import { getSocket, isSocketReady } from '../services/socket';
import { useToast } from "@/components/ui/use-toast";
import { Proposal } from '@/types';
import { useEffect } from 'react';

export function Dashboard() {
  const { user } = useStore();
  const { proposals, isLoading, error, refetch, updateProposals } = useProposals();
  const { toast } = useToast();

  // Add socket event listeners for real-time updates
  useEffect(() => {
    if (!isSocketReady()) return;

    const socket = getSocket();

    // Listen for new proposals
    socket.on('proposals', (data: { proposals: Proposal[] }) => {
      console.log('[SOCKET] Received proposals update:', data);
      // Immediately refetch to get the latest state
      refetch();
      // Show a toast notification
      toast({
        title: "New Expense Detected",
        description: "A new expense proposal has been created."
      });
    });

    // Listen for proposal saved events
    socket.on('proposalSaved', () => {
      refetch(); // Refresh the list when a proposal is saved
    });

    // Listen for state changes
    socket.on('stateChanged', (state: any) => {
      console.log('[SOCKET] State changed:', state);
      if (state.existingProposals) {
        updateProposals(state.existingProposals);
      }
    });

    return () => {
      if (isSocketReady()) {
        const socket = getSocket();
        socket.off('proposals');
        socket.off('proposalSaved');
        socket.off('stateChanged');
      }
    };
  }, [refetch, updateProposals]);

  const handleApprove = async (proposal: Proposal) => {
    try {
      const socket = getSocket();
      if (!socket?.connected) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Not connected to server"
        });
        return;
      }
      
      socket.emit('proposalApproved', proposal);
      await refetch(); // Refresh the proposals list
      toast({
        title: "Success",
        description: "Expense approved successfully"
      });
    } catch (err) {
      console.error('Error approving proposal:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to approve expense"
      });
    }
  };

  const handleReject = async (proposal: Proposal) => {
    try {
      const socket = getSocket();
      if (!socket?.connected) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Not connected to server"
        });
        return;
      }
      
      socket.emit('proposalRejected', proposal);
      await refetch(); // Refresh the proposals list
      toast({
        title: "Success",
        description: "Expense rejected successfully"
      });
    } catch (err) {
      console.error('Error rejecting proposal:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to reject expense"
      });
    }
  };

  const handleEdit = (proposal: Proposal) => {
    // TODO: Implement edit functionality
    console.log('Edit:', proposal);
  };

  return (
    <div className="flex-1 space-y-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Voice Expense Recorder</h2>
      </div>

      <div className="grid gap-6">
        <div className="col-span-full">
          <AudioRecorder />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <ProposalsList 
            proposals={proposals}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
            categories={[]} // TODO: Add categories
          />
        )}
      </div>
    </div>
  );
} 