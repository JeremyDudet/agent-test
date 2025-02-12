export interface ExpenseProposal {
  id?: string;
  user_id: string;
  transcription_id?: string;
  amount: number;
  merchant: string;
  category: string;
  date: string;
  status: 'pending_review' | 'confirmed' | 'rejected';
  created_at?: string;
  updated_at?: string;
  embedding?: number[];
  description?: string;
  
  // Client-side properties that we'll map
  item?: string; // maps to merchant
} 