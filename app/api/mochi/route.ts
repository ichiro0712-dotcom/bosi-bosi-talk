import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import webPush from 'web-push';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:vibe@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function POST(req: Request) {
  try {
    const { text, userId, userName } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set.");
      await insertMochiMessage("APIキーが未設定のため、お返事できませんでした🍡");
      return NextResponse.json({ success: true, fake: true });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 1. システムプロンプトをDBから取得
    const { data: settings } = await supabase.from('couple_settings').select('mochi_prompt').limit(1).single();
    const systemPrompt = settings?.mochi_prompt || `あなたは「もち」というサポーターボットです。丁寧語を使わずに親しみやすく話してください。`;

    // 2. 過去のチャット履歴を20件取得
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    const apiMessages: any[] = [];

    if (messages && messages.length > 0) {
      const sortedMessages = messages.reverse();
      for (const m of sortedMessages) {
        const role = m.user_id === 'mochi' ? 'model' : 'user';
        const speaker = m.user_id === 'user_a' ? 'ミルク' : m.user_id === 'user_b' ? 'メリー' : '誰か';
        const content = m.text || '(画像スタンプ)';
        
        if (role === 'model') {
          apiMessages.push({ role, parts: [{ text: content }] });
        } else {
          apiMessages.push({ role, parts: [{ text: `${speaker}: ${content}` }] });
        }
      }
    }

    // 最新のメッセージを末尾に追加
    apiMessages.push({ role: 'user', parts: [{ text: `${userName}: ${text}` }] });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: apiMessages,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 500,
      }
    });

    const aiReply = response.text?.trim();

    if (aiReply) {
      const insertError = await insertMochiMessage(aiReply);
      if (insertError) {
        return NextResponse.json({ error: `Supabase Insert Error: ${JSON.stringify(insertError)}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Mochi AI Error:", err);
    await insertMochiMessage("（考え中にお餅が詰まってしまいました…🍡通信状況やAPIキーを確認してください）");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function insertMochiMessage(text: string) {
  const { error } = await supabase.from('messages').insert([{
    text,
    user_id: 'mochi'
  }]);
  
  if (error) {
    console.error("Failed to insert mochi message:", error);
    return error;
  }

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
