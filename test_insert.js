const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('messages').insert([{ text: 'TEST FROM BACKEND', user_id: 'mochi', is_read: false }]);
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
