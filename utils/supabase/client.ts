import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Supabaseを使用する場合は必ず .env.local が設定されているか確認
export const supabase = createClient(
  supabaseUrl || 'https://mock.supabase.co', 
  supabaseKey || 'mock-key'
);
