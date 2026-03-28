import { NextResponse } from 'next/server';
import webPush from 'web-push';
import { supabase } from '../../../utils/supabase/client';

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

    const { title, body, imageUrl } = await req.json();

    // 購読者リストをSupabaseから全件取得
    const { data: subs, error } = await supabase.from('subscriptions').select('*');
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return NextResponse.json({ success: true, message: 'No active subscriptions' });
    }

    const payload = JSON.stringify({
      title: title || "新着メッセージ",
      body: body || "チャットアプリから通知",
      icon: '/icon-192x192.png',
      image: imageUrl, // PWAに画像プレビューを表示
    });

    const sendPromises = subs.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      
      try {
        await webPush.sendNotification(pushSubscription, payload);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // エンドポイントが無効になった購読（アンインストール等）をDBから削除
          await supabase.from('subscriptions').delete().eq('id', sub.id);
        } else {
          console.error("Push Error on endpoint:", sub.endpoint, err);
        }
      }
    });

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, sentCount: subs.length });

  } catch (error: any) {
    console.error("Error sending push notification:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
