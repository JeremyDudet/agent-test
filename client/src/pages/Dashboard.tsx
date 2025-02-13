import { AudioRecorder } from '../components/AudioRecorder';
import { ProposalsList } from '../components/ProposalsList';
import { useProposals } from '../hooks/useProposals';
import useStore from '../store/useStore';
import { Alert, AlertDescription } from "../components/ui/alert";
import { Loader2, MessageSquare, SendHorizontal } from "lucide-react";
import { getSocket, isSocketReady } from '../services/socket';
import { useToast } from "@/components/ui/use-toast";
import { Proposal } from '@/types';
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { type TranscriptionEntry } from '../components/AudioRecorder';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from 'date-fns';

export function Dashboard() {
  const { user, conversations, currentConversationId, startNewConversation, setCurrentConversation } = useStore();
  const { proposals, isLoading, error, refetch, updateProposals } = useProposals();
  const { toast } = useToast();
  const [conversationEntries, setConversationEntries] = useState<TranscriptionEntry[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [messageInput, setMessageInput] = useState('');

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    
    const newEntry: TranscriptionEntry = {
      type: 'transcription',
      content: messageInput,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setConversationEntries(prev => [...prev, newEntry]);
    setMessageInput('');
  };

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
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 space-y-4 p-4 md:space-y-6 md:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Voice Expense Recorder</h2>
        </div>

        <div className="grid gap-4 md:gap-6">
          <div className="col-span-full">
            <AudioRecorder 
              onConversationEntriesChange={setConversationEntries}
            />
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

      {/* Combined History Drawer */}
      <div className="fixed bottom-4 right-4 z-50">
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerTrigger asChild>
            <Button 
              variant="default"
              size="icon" 
              className="shadow-lg md:h-10 md:w-auto md:px-4 bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
            >
              <MessageSquare className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">History</span>
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-[95vh] md:h-[85vh] p-0">
            <div className="h-full flex flex-col md:flex-row">
              {/* Sidebar */}
              <div className="w-full md:w-64 flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r">
                <div className="p-4">
                  <Button
                    onClick={startNewConversation}
                    className="w-full"
                    variant="outline"
                  >
                    New Chat
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2 p-2">
                    {conversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={`p-3 rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                          currentConversationId === conversation.id ? 'bg-muted' : ''
                        }`}
                        onClick={() => setCurrentConversation(conversation.id)}
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 shrink-0 opacity-70" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {conversation.title || 'New Conversation'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main Chat Area */}
              <div className="flex-1 flex flex-col h-full min-h-0">
                <DrawerHeader className="border-b px-4 py-3">
                  <DrawerTitle>Chat History</DrawerTitle>
                  <DrawerDescription className="hidden md:block">View your conversation history</DrawerDescription>
                </DrawerHeader>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {conversationEntries.map((entry, i) => (
                      <div
                        key={i}
                        className={`flex ${entry.type === 'transcription' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex max-w-[90%] md:max-w-[80%] items-start gap-2 rounded-lg px-3 py-2 ${
                          entry.type === 'transcription' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <div className="flex-1">
                            <p className="text-sm">{entry.content}</p>
                            <p className="text-xs opacity-70">{entry.timestamp}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Message Input */}
                <div className="flex-none border-t p-4">
                  <div className="max-w-3xl mx-auto flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Type a message..."
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <Button 
                      size="icon"
                      onClick={handleSendMessage}
                      className="shrink-0"
                    >
                      <SendHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
} 