import { supabase } from './supabase';
import type { ExpenseProposal } from '../../types';

export async function persistExpenseProposal(proposal: ExpenseProposal) {
  try {
    if (proposal.status === 'confirmed') {
      // For confirmed proposals, create an expense record first
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          amount: proposal.amount,
          description: proposal.description || `Expense at ${proposal.merchant || proposal.item}`,
          category_id: proposal.category,
          date: proposal.date,
          merchant: proposal.merchant || proposal.item,
          date_created: new Date().toISOString(),
          metadata: {
            proposal_id: proposal.id,
            user_id: proposal.user_id,
            transcription_id: proposal.transcription_id
          }
        })
        .select()
        .single();

      if (expenseError) throw expenseError;

      // Update the proposal status to confirmed
      const { data: updatedProposal, error: proposalError } = await supabase
        .from('expense_proposals')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', proposal.id)
        .select()
        .single();

      if (proposalError) throw proposalError;
      
      return { ...updatedProposal, expense };
    } else {
      // For new pending proposals
      const { data, error } = await supabase
        .from('expense_proposals')
        .insert({
          amount: proposal.amount,
          merchant: proposal.merchant || proposal.item,
          category: proposal.category,
          date: proposal.date,
          status: proposal.status,
          user_id: proposal.user_id,
          description: proposal.description,
          transcription_id: proposal.transcription_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Error persisting expense proposal:', error);
    throw error;
  }
}

export async function updateExpenseProposal(proposal: ExpenseProposal) {
  try {
    const { data, error } = await supabase
      .from('expense_proposals')
      .update({
        amount: proposal.amount,
        merchant: proposal.item,
        category: proposal.category,
        date: proposal.date,
        status: proposal.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', proposal.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating expense proposal:', error);
    throw error;
  }
}

export async function deleteExpenseProposal(proposalId: string) {
  try {
    const { error } = await supabase
      .from('expense_proposals')
      .delete()
      .eq('id', proposalId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting expense proposal:', error);
    throw error;
  }
}

export async function getPendingExpenseProposals(userId: string) {
  try {
    const { data, error } = await supabase
      .from('expense_proposals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending_review');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching pending expense proposals:', error);
    throw error;
  }
} 