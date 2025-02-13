import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseAgent } from '../Agent';
import { StateManager } from '../StateManager';
import { supabase } from '../../services/database/supabase';

interface ChatMessage {
  role: string;
  content: string;
}

// Hoist mocks
vi.mock('openai', async () => {
  const actual = await vi.importActual('openai');
  return {
    ...actual,
    OpenAI: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockImplementation(({ messages }: { messages: ChatMessage[] }) => {
            // Get the user's message (transcript)
            const userMessage = messages.find(m => m.role === 'user')?.content || '';
            
            // Return empty proposals for empty transcripts
            if (!userMessage.trim()) {
              return {
                choices: [{
                  message: {
                    content: JSON.stringify({ proposals: [] })
                  }
                }]
              };
            }
            
            // Return mock proposal for non-empty transcripts
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    proposals: [{
                      id: 'test-id',
                      status: 'draft',
                      action: 'create_expense',
                      item: 'Coffee at Starbucks',
                      amount: 5.99,
                      date: '2024-02-14',
                      category: 'Food & Dining',
                      originalText: 'I spent $5.99 on coffee at Starbucks',
                      created_at: '2024-02-14T12:00:00Z'
                    }]
                  })
                }
              }]
            };
          })
        }
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{
            embedding: new Array(1536).fill(0)
          }]
        })
      }
    }))
  };
});

vi.mock('../../services/database/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ 
      data: [], 
      error: null,
      count: null,
      status: 200,
      statusText: 'OK'
    })
  }
}));

describe('ExpenseAgent', () => {
  let agent: ExpenseAgent;
  let stateManager: StateManager;

  beforeEach(() => {
    // Reset environment and mocks
    process.env.OPENAI_API_KEY = 'test-key';
    vi.clearAllMocks();
    
    // Initialize agent and state manager
    agent = new ExpenseAgent();
    stateManager = StateManager.getInstance();
    
    // Set initial state
    stateManager.setState({
      isProcessing: false,
      messageWindow: {
        processedMessages: [],
        newMessages: [],
        windowSize: 20
      },
      existingProposals: [],
      timeContext: {
        now: new Date('2024-02-14'),
        formattedNow: '2024-02-14',
        timeZone: 'America/Los_Angeles'
      },
      userExpenseCategories: [
        { id: '1', name: 'Food & Dining', description: 'Food and beverage expenses' },
        { id: '2', name: 'Transportation', description: 'Transportation expenses' }
      ]
    });
  });

  it('should process a transcription and return expense proposals', async () => {
    const transcript = 'I spent $5.99 on coffee at Starbucks today';
    const state = stateManager.getState();

    const proposals = await agent.processLatestTranscription(transcript, state);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      status: 'draft',
      action: 'create_expense',
      item: 'Coffee at Starbucks',
      amount: 5.99,
      category: 'Food & Dining'
    });
  });

  it('should handle empty transcriptions', async () => {
    const transcript = '';
    const state = stateManager.getState();

    const proposals = await agent.processLatestTranscription(transcript, state);

    expect(proposals).toHaveLength(0);
  });

  it('should skip duplicate expenses', async () => {
    // Mock finding similar expenses
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{
        item: 'Coffee at Starbucks',
        amount: 5.99,
        date: '2024-02-14'
      }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK'
    });

    const transcript = 'I spent $5.99 on coffee at Starbucks today';
    const state = stateManager.getState();

    const proposals = await agent.processLatestTranscription(transcript, state);

    expect(proposals).toHaveLength(0);
  });
}); 