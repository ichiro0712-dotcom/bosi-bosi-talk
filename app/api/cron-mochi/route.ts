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

async function postMochiMessage(text: string) {
  await supabase.from('messages').insert([{ text, user_id: 'mochi' }]);

  try {
    const { data: subs } = await supabase.from('subscriptions').select('*');
    if (subs && subs.length > 0) {
      const payload = JSON.stringify({ title: 'もち 🍡', body: text, icon: '/mochi.png' });
      for (const sub of subs) {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload, { urgency: 'high', TTL: 3600 }
          );
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            await supabase.from('subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }
  } catch {}
}

export async function GET() {
  try {
    const now = new Date();
    const jstHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getHours();
    const jstDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getDay(); // 0=Sun, 1=Mon
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD

    const messages: string[] = [];

    // ===== 毎朝9:00〜9:59: 今日期限のタスクがあれば通知 =====
    if (jstHour === 9) {
      const { data: todayTodos } = await supabase
        .from('todos')
        .select('title')
        .eq('due_date', todayStr)
        .neq('status', 'done');

      if (todayTodos && todayTodos.length > 0) {
        const list = todayTodos.map(t => `・${t.title}`).join('\n');

        if (process.env.GEMINI_API_KEY) {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const { data: settings } = await supabase.from('couple_settings').select('mochi_prompt').limit(1).single();
          const prompt = settings?.mochi_prompt || 'あなたは「もち」です。';

          const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: `今日期限のタスクがあるよ。キャラを崩さず「今日はこれやる予定だけど大丈夫？」的な感じで声をかけて。タスク一覧:\n${list}` }] }],
            config: { systemInstruction: prompt, temperature: 0.8, maxOutputTokens: 300 }
          });
          const reply = res.text?.trim();
          if (reply) messages.push(reply);
        } else {
          messages.push(`今日期限のタスクがあるよ！\n${list}\n大丈夫かな？🍡`);
        }
      }
    }

    // ===== 毎週月曜10:00〜10:59: 今週のタスク一覧 =====
    if (jstDay === 1 && jstHour === 10) {
      const endOfWeek = new Date(now);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      const endStr = endOfWeek.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });

      const { data: weekTodos } = await supabase
        .from('todos')
        .select('title, due_date, assignee')
        .neq('status', 'done')
        .or(`due_date.is.null,due_date.lte.${endStr}`)
        .is('parent_id', null);

      if (weekTodos && weekTodos.length > 0) {
        const list = weekTodos.map(t => {
          const who = t.assignee === 'user_a' ? 'ミルク' : t.assignee === 'user_b' ? 'メリー' : '2人';
          const due = t.due_date ? `(${new Date(t.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })})` : '';
          return `・${t.title} ${due} [${who}]`;
        }).join('\n');

        if (process.env.GEMINI_API_KEY) {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const { data: settings } = await supabase.from('couple_settings').select('mochi_prompt').limit(1).single();
          const prompt = settings?.mochi_prompt || 'あなたは「もち」です。';

          const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: `月曜日だよ！今週のタスク一覧をキャラを崩さず伝えてね。タスク:\n${list}` }] }],
            config: { systemInstruction: prompt, temperature: 0.8, maxOutputTokens: 400 }
          });
          const reply = res.text?.trim();
          if (reply) messages.push(reply);
        } else {
          messages.push(`月曜日だもち！今週はこれをやるんだね！\n${list}\nがんばろう🍡`);
        }
      }
    }

    // メッセージ送信
    for (const msg of messages) {
      await postMochiMessage(msg);
    }

    return NextResponse.json({
      success: true,
      jstHour,
      jstDay,
      messagesPosted: messages.length
    });

  } catch (err: any) {
    console.error('cron-mochi error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
