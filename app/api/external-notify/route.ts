import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';
import { GoogleGenAI } from '@google/genai';

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

  // Hub からの素の応答を「もちキャラ」 で言い換える。
  // 失敗時は元のテキストにそのままフォールバック (通知が消えるよりはマシ)。
  const mochiText = await rewriteInMochiVoice(text, origin_user_hint).catch((e) => {
    console.warn('[external-notify] rewriteInMochiVoice failed, fallback to raw text:', e);
    return text;
  });

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

// Hub から届いた素の応答を、 もちのキャラ (DB の couple_settings.mochi_prompt) で
// 言い換える。 「ねえねえ、 Agent Hub さんに聞いてみたもち！」 → 「答えはこうだったもち：◯◯」
// の 2 段構えで、 ユーザーから見て自然な体験にする。
async function rewriteInMochiVoice(rawText: string, userHint?: string | null): Promise<string> {
  if (!process.env.GEMINI_API_KEY) return rawText;
  if (!rawText || rawText.trim().length === 0) return rawText;

  // couple_settings からキャラ設定を取得 (Hub 連携セクションは除いて、 純粋なキャラ口調だけ抽出)
  let characterPrompt = '';
  try {
    const { data: settings } = await supabase
      .from('couple_settings')
      .select('mochi_prompt')
      .limit(1)
      .single();
    const full = settings?.mochi_prompt ?? '';
    // 「# Hub Platform 連携について」 セクション以降はキャラ口調と無関係なので削る
    const marker = '# Hub Platform 連携について';
    const idx = full.indexOf(marker);
    characterPrompt = idx >= 0 ? full.slice(0, idx).trim() : full.trim();
  } catch {
    // fallback: 既定キャラ
    characterPrompt =
      'あなたはミルクとメリーというカップルをサポートするAI「もち」です。 語尾に「もち」 をつける丁寧でない口調。';
  }

  const userLabel = userHint === 'milk' ? 'ミルク' : userHint === 'merry' ? 'メリー' : null;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = [
    characterPrompt,
    '',
    '=== あなたの今のタスク ===',
    'あなたは Agent Hub (= 業務支援プラットフォーム) に依頼を投げて、 返事を受け取った直後です。',
    'Agent Hub の応答は「素っ気ない丁寧語」 で書かれているので、 そのまま流すとあなたのキャラが壊れます。',
    'これを「もち」 のキャラと口調で言い換えて、 自然なチャット 1 メッセージとして返してください。',
    '',
    '構成の例:',
    '- 冒頭: 「お待たせ、 戻ってきたもち！」 や 「Agent Hub さんからお返事きたもち！」 等の短い挨拶',
    '- 本体: 受け取った内容を、 もちの口調 (語尾「もち」 を必要に応じて、 親しい話し言葉) で言い換え',
    '  - 長すぎる場合は要点を残して短くしても OK',
    '  - 内容は正しく伝える (数字・店名・固有名詞などは変えない)',
    '- 末尾: 短く感想や問いかけ (任意、 不要なら省略)',
    '',
    '注意:',
    '- 「task_id」 「キャンセル ID」 などの内部識別子は絶対にユーザーに見せない',
    '- 1 メッセージで完結する自然な日本語チャットにする (見出しや箇条書きを過剰に使わない)',
    userLabel ? `- 今このメッセージを受け取るのは ${userLabel} です` : '',
    '- もち本人を 3 人称で呼ばない (「もちが」 等は避け、 「うち」 「あたし」 などキャラに合わせる)',
    '- Agent Hub から「分かりません」 「権限がありません」 等の否定的応答だった場合も、 もちの優しい言い方で伝える',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    '=== Agent Hub からの素の応答 (これを言い換える) ===',
    rawText,
    '',
    '=== 出力 ===',
    '上記をもちのキャラで自然なチャット 1 メッセージにしてください。 出力はメッセージ本文のみ (前置きや「以下のように...」 等の説明は不要)。',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
  });

  const out = response.text?.trim();
  if (!out) return rawText;
  return out;
}

