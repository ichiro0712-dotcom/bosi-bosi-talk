import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if(!supabaseUrl) {
   console.log("No supabase url");
   process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('messages').insert([{
      text: 'Test mochi insert',
      user_id: 'mochi',
      is_read: false
  }]);
  console.log("data:", data, "error:", error);
}
run();
