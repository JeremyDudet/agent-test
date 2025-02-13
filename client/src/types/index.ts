// Database types
export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  messages?: Message[];
}

export interface Message {
  id?: string;
  conversationId?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt?: string;
  sequenceNumber?: number;
}

// ... rest of existing types ... 