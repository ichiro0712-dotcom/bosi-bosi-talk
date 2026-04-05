import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://pxvqxcbqfxpeashgnvjx.supabase.co',
  'sb_publishable_Lk6MqB7YrRstK6sDInNwCw_VGOiIK_t'
);

async function run() {
  const { data, error } = await supabase.from('subscriptions').select('*');
  console.log("Error:", error);
  console.log("Subscriptions Found:", data?.length);
  data?.forEach((r, i) => {
    console.log(`[${i}] user=${r.user_id} p256dhLength=${r.p256dh?.length} authLength=${r.auth?.length} endpoint=${r.endpoint.substring(0,60)}...`);
  });
}
run();

