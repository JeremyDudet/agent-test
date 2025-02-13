import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      expenses: {
        Row: {
          id: string;
          amount: number;
          description: string;
          category_id: string;
          date: string;
          merchant: string;
          date_created: string;
          user_id: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
        };
      };
    };
  };
}; 