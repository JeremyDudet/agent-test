import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Missing Supabase credentials in environment variables');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);