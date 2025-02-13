import { supabase } from './supabase';
import type { Conversation, Message } from '../types';

export class ConversationService {
  static async createConversation(title?: string): Promise<Conversation | null> {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert([{ title: title || 'New Conversation' }])
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }

    return conversation;
  }

  static async getConversations(archived = false): Promise<Conversation[]> {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('is_archived', archived)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }

    return conversations || [];
  }

  static async getConversation(id: string): Promise<Conversation | null> {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select(`
        *,
        messages (
          *
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching conversation:', error);
      return null;
    }

    return conversation;
  }

  static async addMessage(conversationId: string, message: Omit<Message, 'id' | 'createdAt' | 'conversationId'>): Promise<Message | null> {
    const { data: latestMessage, error: seqError } = await supabase
      .from('messages')
      .select('sequence_number')
      .eq('conversation_id', conversationId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    const sequenceNumber = (latestMessage?.sequence_number || 0) + 1;

    const { data: newMessage, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        sequence_number: sequenceNumber
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding message:', error);
      return null;
    }

    return newMessage;
  }

  static async archiveConversation(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('conversations')
      .update({ is_archived: true })
      .eq('id', id);

    if (error) {
      console.error('Error archiving conversation:', error);
      return false;
    }

    return true;
  }
} 