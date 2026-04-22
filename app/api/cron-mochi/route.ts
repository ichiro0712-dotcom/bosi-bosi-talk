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
      const payload = JSON.stringify({ title: 'もち ⚪️', body: text, icon: '/mochi.png' });
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

export async function GET(request: Request) {
  // Vercel Cron認証チェック
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;
    const jstDayOffset = now.getUTCHours() + 9 >= 24 ? 1 : 0;
    const jstDate = new Date(now.getTime() + jstDayOffset * 86400000);
    const jstDay = jstDate.getUTCDay(); // 0=Sun, 1=Mon
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = jstNow.toISOString().split('T')[0]; // YYYY-MM-DD in JST

    const messages: string[] = [];

    // ===== 毎朝9:00〜9:59: 今日期限 & もちリマインド該当タスクの通知 =====
    if (jstHour >= 9 && jstHour < 10) {
      const { data: activeTodos } = await supabase
        .from('todos')
        .select('title, due_date, mochi_reminders')
        .neq('status', 'done')
        .not('due_date', 'is', null);

      if (activeTodos && activeTodos.length > 0) {
        const todayStrLocal = jstNow.toISOString().split('T')[0];
        const dueTodayList: string[] = [];
        const remindList: { title: string, daysLeft: number }[] = [];

        for (const t of activeTodos) {
          if (t.due_date === todayStrLocal) {
            dueTodayList.push(`・${t.title}`);
          } else if (t.mochi_reminders && Array.isArray(t.mochi_reminders) && t.mochi_reminders.length > 0) {
            const due = new Date(t.due_date);
            due.setHours(0, 0, 0, 0);
            const todayDate = new Date(jstNow);
            todayDate.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((due.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays > 0 && t.mochi_reminders.includes(diffDays)) {
              remindList.push({ title: t.title, daysLeft: diffDays });
            }
          }
        }

        // 今日期限のプロンプト
        if (dueTodayList.length > 0) {
          const listStr = dueTodayList.join('\n');
          if (process.env.GEMINI_API_KEY) {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const { data: settings } = await supabase.from('couple_settings').select('mochi_prompt').limit(1).single();
            const prompt = settings?.mochi_prompt || 'あなたはミルクとメリーというラブラブカップルをサポート・応援するAI「もち」です。2人の幸せを願い、丁寧語を使わずに親しみやすく話してください。';

            const res = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [{ role: 'user', parts: [{ text: `今日期限のタスクがあるよ。キャラを崩さず「今日はこれやる予定だけど大丈夫？」的な感じで声をかけて。タスク一覧:\n${listStr}` }] }],
              config: { systemInstruction: prompt, temperature: 0.8, maxOutputTokens: 300 }
            });
            const reply = res.text?.trim();
            if (reply) messages.push(reply);
          } else {
            messages.push(`今日期限のタスクがあるよ！\n${listStr}\n大丈夫かな？⚪️`);
          }
        }

        // もちリマインドのプロンプト
        if (remindList.length > 0) {
          const rListStr = remindList.map(r => `・${r.title} (完了まであと${r.daysLeft}日)`).join('\n');
          if (process.env.GEMINI_API_KEY) {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const { data: settings } = await supabase.from('couple_settings').select('mochi_prompt').limit(1).single();
            const prompt = settings?.mochi_prompt || 'あなたはミルクとメリーというラブラブカップルをサポート・応援するAI「もち」です。2人の幸せを願い、丁寧語を使わずに親しみやすく話してください。';

            const res = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [{ role: 'user', parts: [{ text: `以下のタスクが期限に近づいているよ（もちリマインド設定）。キャラを崩さず「完了まであと●日だけど順調だもちか？」的に声をかけて。タスク一覧:\n${rListStr}` }] }],
              config: { systemInstruction: prompt, temperature: 0.8, maxOutputTokens: 300 }
            });
            const reply = res.text?.trim();
            if (reply) messages.push(reply);
          } else {
            messages.push(`タスクの期限が近づいてるもち！\n${rListStr}\n順調だもちか？⚪️`);
          }
        }
      }
    }

    // ===== 毎週月曜10:00〜10:59: 先週の振り返り & 今週のタスク一覧 =====
    if (jstDay === 1 && jstHour >= 10 && jstHour < 11) {
      const endOfWeek = new Date(now);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      const endJst = new Date(endOfWeek.getTime() + 9 * 60 * 60 * 1000);
      const endStr = endJst.toISOString().split('T')[0];

      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 今週のタスク
      const { data: weekTodos } = await supabase
        .from('todos')
        .select('title, due_date, assignee')
        .neq('status', 'done')
        .or(`due_date.is.null,due_date.lte.${endStr}`)
        .is('parent_id', null);

      // 先週完了したタスク
      const { data: doneTodos } = await supabase.from('todos').select('title').eq('status', 'done').gte('updated_at', weekAgo);
      
      // 先週追加されたリマインダー
      const { data: newReminders } = await supabase.from('scheduled_reminders').select('message').gte('created_at', weekAgo);
      
      // 直近のチャット（文脈用、最大30件）
      const { data: recentMsgs } = await supabase.from('messages').select('text, user_id').neq('user_id', 'mochi').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(30);

      const list = weekTodos && weekTodos.length > 0 ? weekTodos.map(t => {
        const who = t.assignee === 'user_a' ? 'ミルク' : t.assignee === 'user_b' ? 'メリー' : '2人';
        const due = t.due_date ? `(${new Date(t.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })})` : '';
        return `・${t.title} ${due} [${who}]`;
      }).join('\n') : '（今週のタスクは特に登録されてないもち！）';

      const doneList = doneTodos && doneTodos.length > 0 ? doneTodos.map(t => `・${t.title}`).join('\n') : '（特になし）';
      const remindList = newReminders && newReminders.length > 0 ? newReminders.map(r => `・${r.message}`).join('\n') : '（特になし）';
      const chatLog = recentMsgs && recentMsgs.length > 0 ? recentMsgs.reverse().map(m => `${m.user_id === 'user_a' ? 'ミルク' : 'メリー'}: ${m.text || '(スタンプ/画像)'}`).join('\n') : '（特になし）';

      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const { data: settings } = await supabase.from('couple_settings').select('mochi_prompt').limit(1).single();
        const prompt = settings?.mochi_prompt || 'あなたはミルクとメリーというラブラブカップルをサポート・応援するAI「もち」です。2人の幸せを願い、丁寧語を使わずに親しみやすく話してください。';

        const textPrompt = `今日は月曜日だよ！以下の「先週の振り返り」データを読んで、ミルクとメリーのラブラブな2人をねぎらい、楽しかったエピソードなどに触れつつ、今週のタスク一覧を提示して元気に挨拶してね。

【先週完了したタスク】
${doneList}

【先週新しく追加されたリマインダー】
${remindList}

【先週の2人のチャットの様子 (抜粋)】
${chatLog}

【今週のタスク一覧】
${list}`;

        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: textPrompt }] }],
          config: { systemInstruction: prompt, temperature: 0.8, maxOutputTokens: 600 }
        });
        const reply = res.text?.trim();
        if (reply) messages.push(reply);
      } else {
        messages.push(`月曜日だもち！今週はこれをやるんだね！\n${list}\nがんばろう⚪️`);
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
