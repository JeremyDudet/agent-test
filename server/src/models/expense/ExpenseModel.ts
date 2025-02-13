import { SupabaseClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { Expense, ExpenseCreateDTO, ExpenseUpdateDTO } from '../../types';

export class ExpenseModel {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly openai: OpenAI
  ) {}

  async create(userId: string, data: ExpenseCreateDTO): Promise<Expense> {
    const { data: expense, error } = await this.supabase
      .from('expenses')
      .insert({
        ...data,
        userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return expense;
  }

  async update(userId: string, data: ExpenseUpdateDTO): Promise<Expense> {
    const { data: expense, error } = await this.supabase
      .from('expenses')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.id)
      .eq('userId', userId)
      .select()
      .single();

    if (error) throw error;
    return expense;
  }

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await this.supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('userId', userId);

    if (error) throw error;
  }

  async findById(userId: string, id: string): Promise<Expense | null> {
    const { data: expense, error } = await this.supabase
      .from('expenses')
      .select()
      .eq('id', id)
      .eq('userId', userId)
      .single();

    if (error) throw error;
    return expense;
  }

  async findAll(userId: string, options: { 
    limit?: number; 
    offset?: number;
    startDate?: string;
    endDate?: string;
    category?: string;
  } = {}): Promise<{ expenses: Expense[]; total: number }> {
    let query = this.supabase
      .from('expenses')
      .select('*', { count: 'exact' })
      .eq('userId', userId);

    if (options.startDate) {
      query = query.gte('date', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('date', options.endDate);
    }
    if (options.category) {
      query = query.eq('category', options.category);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data: expenses, error, count } = await query;

    if (error) throw error;
    return { expenses: expenses || [], total: count || 0 };
  }

  async findSimilar(userId: string, description: string, amount: number, date: string): Promise<Expense[]> {
    try {
      const embeddings = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: description,
      });

      const embedding = embeddings.data[0]?.embedding;
      if (!embedding) {
        throw new Error("Failed to generate embedding for similarity check");
      }

      const { data: similarExpenses, error } = await this.supabase.rpc(
        'match_expenses',
        {
          query_embedding: embedding,
          match_threshold: 0.8,
          match_count: 5,
          p_user_id: userId
        }
      );

      if (error) throw error;
      return similarExpenses || [];
    } catch (error) {
      console.error('Error finding similar expenses:', error);
      return [];
    }
  }
} 