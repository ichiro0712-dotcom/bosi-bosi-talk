import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import webPush from 'web-push';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Initialize Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Web Push (if possible)
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:vibe@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ユーザーが持っている「もち」の性格設定や文脈（システムプロンプト）。
// この後提供されるドキュメントを反映予定。
const SYSTEM_PROMPT = `あなたは「もち」という名前のサポートボットです。
ユーザーである「ミルク」と「メリー」のチャット空間に同居しており、二人をサポートする存在です。
過去の会話や設定文脈を参考に、キャラクターになりきって短く、親しみやすい言葉で返答してください。
過度にAIっぽくならないよう、人間のサポーターのように振る舞ってください。`;

export async function POST(req: Request) {
  try {
    const { text, userId, userName } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set.");
      // 仮の返答を返す
      await insertMochiMessage("APIキーが未設定のため、AIとしてお返事できませんでした🍡");
      return NextResponse.json({ success: true, fake: true });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 直近20件のチャット履歴を取得して文脈として渡す
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    let historyText = "";
    if (messages && messages.length > 0) {
      const sortedMessages = messages.reverse();
      historyText = sortedMessages.map(m => {
        const speaker = m.user_id === 'mochi' ? 'もち' : 
                        m.user_id === 'user_a' ? 'ミルク' : 'メリー';
        // 画像送信などの場合はテキストがないこともある
        const content = m.text || '(画像スタンプ)';
        return `${speaker}: ${content}`;
      }).join("\n");
    }

    const prompt = `
【システム設定】
${SYSTEM_PROMPT}

【最近の会話履歴】
${historyText}

【今回の発言】
${userName}: ${text}

もちとしての返答を生成してください（挨拶などは省き、続くメッセージとして送信する想定で書いてください）：
`;

    // モデル呼び出し（gemini-2.5-flashをデフォルトに使用）
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const aiReply = response.text;

    if (aiReply) {
      await insertMochiMessage(aiReply);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Mochi AI Error:", err);
    await insertMochiMessage("（考え中にお餅が詰まってしまいました…🍡エラーが発生しました）");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function insertMochiMessage(text: string) {
  // 1. DBに保存
  const { error } = await supabase.from('messages').insert([{
    text,
    user_id: 'mochi',
    is_read: false
  }]);
  
  if (error) {
    console.error("Failed to insert mochi message:", error);
    return;
  }

  // 2. プッシュ通知の送信（ミルク・メリー双方へ）
  //    ※送信者（もち）は除外設定不要なので全員に送る
  try {
    const { data: subs } = await supabase.from('subscriptions').select('*');
    if (subs && subs.length > 0) {
      const payload = JSON.stringify({
        title: "もち 🍡",
        body: text,
        icon: '/mochi.png'
      });
      for (const sub of subs) {
        try {
          await webPush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          }, payload, { urgency: 'high', TTL: 60 * 60 });
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            await supabase.from('subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }
  } catch (notifyErr) {
    console.error("Mochi push notify error:", notifyErr);
  }
}
