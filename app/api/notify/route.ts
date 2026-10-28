import { NextResponse } from 'next/server';
import webPush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    // 実行時に初期化する（ビルド時の静的解析エラーを回避）
    if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:vibe@example.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    } else {
      console.warn("VAPID Keys are not set, push notification will be skipped.");
    }

    const { title, body, imageUrl, senderUserId } = await req.json();

    // 購読者リストをSupabaseから取得（送信者自身を除外）
    let query = supabase.from('subscriptions').select('*');
    if (senderUserId) {
      query = query.neq('user_id', senderUserId);
    }
    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return NextResponse.json({ success: true, message: 'No active subscriptions (or sender excluded)' });
    }

    const payload = JSON.stringify({
      title: title || "新着メッセージ",
      body: body || "チャットアプリから通知",
      icon: '/icon-192x192.png',
      image: imageUrl || undefined,
    });

    const sendResults = await Promise.all(subs.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      
      // 送信結果を subscriptions に残す (端末側の受信 = last_received_at と突き合わせて診断する)
      const recordSend = (status: string) =>
        supabase.from('subscriptions').update({ last_sent_at: new Date().toISOString(), last_send_status: status }).eq('id', sub.id).then();

      try {
        const res = await webPush.sendNotification(pushSubscription, payload, {
          urgency: 'high',
          TTL: 60 * 60,
        });
        await recordSend(String(res.statusCode));
        return { success: true, user_id: sub.user_id, statusCode: res.statusCode, endpoint: sub.endpoint };
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('subscriptions').delete().eq('id', sub.id);
          return { success: false, user_id: sub.user_id, reason: 'unsubscribed', endpoint: sub.endpoint };
        } else {
          console.error("Push Error on endpoint:", sub.endpoint, err);
          await recordSend(`error ${err.statusCode ?? ''} ${err.message ?? ''}`.trim());
          return { success: false, user_id: sub.user_id, reason: err.message, body: err.body, endpoint: sub.endpoint };
        }
      }
    }));

    console.log('[notify]', JSON.stringify(sendResults.map(r => ({ user: r.user_id, ok: r.success, status: (r as any).statusCode ?? (r as any).reason }))));
    const errors = sendResults.filter(r => !r.success);
    return NextResponse.json({ success: true, sentCount: subs.length, results: sendResults, errors });

  } catch (error: any) {
    console.error("Error sending push notification:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
