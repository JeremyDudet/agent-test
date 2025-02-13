import { useEffect } from 'react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import useStore from '../store/useStore';
import { formatDistanceToNow } from 'date-fns';

export function ConversationHistory() {
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <Button
          onClick={() => startNewConversation()}
          className="w-full"
          variant="default"
        >
          New Conversation
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
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
  );
} 