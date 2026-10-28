import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Service Worker が push を受け取ったら呼ぶ。 「サーバは送った (last_sent_at) のに
// 端末に届いていない (last_received_at が古い)」 を見分けるための受信記録。
export async function POST(req: Request) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    await supabase.from('subscriptions').update({ last_received_at: new Date().toISOString() }).eq('endpoint', endpoint);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
