import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

export const maxDuration = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
const supabase = createClient(supabaseUrl, supabaseKey);

if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:vibe@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Hub Platform からの完了通知受信エンドポイント。
//
// 期待 body:
// {
//   type: "task_completed",
//   task_id: "task_xxx",
//   origin: "mochi",
//   origin_user_hint: "milk" | "merry" | undefined,
//   text: "通知本文",
//   image_urls?: string[],
//   metadata?: Record<string, unknown>,
// }
//
// 認証: Authorization: Bearer <MOCHI_EXTERNAL_NOTIFY_TOKEN>
//
// 動作:
// 1. Bearer 検証
// 2. external_notifications にログ
// 3. messages テーブルに INSERT (user_id='mochi'、 column 名は 'text')
// 4. subscriptions 全件に Web Push 配信 (410 は自動削除)
// 5. { ok: true } を返す (push 失敗は致命的でないので無視)

export async function POST(req: Request) {
  const expected = process.env.MOCHI_EXTERNAL_NOTIFY_TOKEN;
  if (!expected) {
    console.error('[external-notify] MOCHI_EXTERNAL_NOTIFY_TOKEN env not set');
    return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const {
    type,
    task_id,
    origin,
    origin_user_hint,
    text,
    image_urls = [],
    metadata = {},
  } = body || {};

  if (type !== 'task_completed') {
    return NextResponse.json({ error: `unknown type: ${type}` }, { status: 400 });
  }
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text required' }, { status: 400 });
  }
  if (!origin || typeof origin !== 'string') {
    return NextResponse.json({ error: 'origin required' }, { status: 400 });
  }

  try {
    await supabase.from('external_notifications').insert([
      {
        task_id: task_id ?? null,
        origin,
        origin_user_hint: origin_user_hint ?? null,
        text,
        metadata: metadata ?? {},
      },
    ]);
  } catch (e) {
    console.warn('[external-notify] log insert failed (ignored):', e);
  }

  const primaryImageUrl: string | null =
    Array.isArray(image_urls) && image_urls.length > 0 ? image_urls[0] : null;

  // Hub からの応答は LLM 言い換えせず、 固定テンプレで囲んで本文をそのまま流す。
  // 「もちが外部 LLM に依頼して、 その答えを引用してきた」 という見え方にして、
  // 人間味と正確性 (数値・固有名詞が改変されない) を両立する。
  // 短い応答 (例: 単一文) は引用区切りを省略。
  const mochiText = formatHubReply(text);

  const { error: insertErr } = await supabase.from('messages').insert([
    {
      user_id: 'mochi',
      text: mochiText,
      image_url: primaryImageUrl,
    },
  ]);
  if (insertErr) {
    console.error('[external-notify] message insert failed:', insertErr);
    return NextResponse.json(
      { error: 'message insert failed', detail: insertErr.message },
      { status: 500 }
    );
  }

  if (Array.isArray(image_urls) && image_urls.length > 1) {
    for (let i = 1; i < image_urls.length; i++) {
      await supabase.from('messages').insert([
        {
          user_id: 'mochi',
          text: '',
          image_url: image_urls[i],
        },
      ]);
    }
  }

  try {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('id, endpoint, p256dh, auth');

    if (subs && subs.length > 0) {
      const notifBody = mochiText.length > 100 ? mochiText.slice(0, 100) + '...' : mochiText;
      const payload = JSON.stringify({
        title: 'もち ⚪️',
        body: notifBody,
        icon: '/mochi.png',
        tag: task_id ? `mochi-${task_id}` : undefined,
      });

      for (const sub of subs) {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            { urgency: 'high', TTL: 60 * 60 }
          );
        } catch (pushErr: any) {
          if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
            await supabase.from('subscriptions').delete().eq('id', sub.id);
          } else {
            console.warn('[external-notify] push failed:', pushErr?.message ?? pushErr);
          }
        }
      }
    }
  } catch (e) {
    console.error('[external-notify] push dispatch error:', e);
  }

  return NextResponse.json({ ok: true });
}

// Hub からの応答を、 もちが「外部の Agent Hub に頼んで返事をもらった」 体験として
// 引用形式で包む。 LLM 呼び出しなし (= API コスト 0、 改変リスク 0、 即時保存)。
// Agent Hub の本文は丁寧語のままで OK (= 引用なので口調が違って当然)。
function formatHubReply(rawText: string): string {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) return 'お返事きたもち！';
  return `お返事きたもち！\n---\n${trimmed}`;
}

