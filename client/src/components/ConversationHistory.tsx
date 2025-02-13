import { useEffect } from 'react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import useStore from '../store/useStore';
import { formatDistanceToNow } from 'date-fns';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './ui/drawer';

interface ConversationHistoryProps {
  drawerTrigger?: React.ReactNode;
}

export function ConversationHistory({ drawerTrigger }: ConversationHistoryProps) {
  const {
    conversations,
    currentConversationId,
    loadConversations,
    setCurrentConversation,
    startNewConversation,
    archiveCurrentConversation,
  } = useStore();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const ConversationList = () => (
    <div className="h-[80vh] flex flex-col">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-4">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`p-3 rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                  currentConversationId === conversation.id ? 'bg-muted' : ''
                }`}
                onClick={() => setCurrentConversation(conversation.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {conversation.title || 'New Conversation'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  {currentConversationId === conversation.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveCurrentConversation();
                      }}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* New Conversation Button */}
      <div className="p-4 border-t bg-background">
        <Button
          onClick={() => startNewConversation()}
          className="w-full"
          variant="outline"
        >
          New Conversation
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer>
      {drawerTrigger ? (
        <DrawerTrigger asChild>
          {drawerTrigger}
        </DrawerTrigger>
      ) : null}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Conversations</DrawerTitle>
        </DrawerHeader>
        <ConversationList />
      </DrawerContent>
    </Drawer>
  );
} 