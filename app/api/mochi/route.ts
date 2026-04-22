import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const maxDuration = 60;
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import webPush from 'web-push';
import { readFileSync } from 'fs';
import { join } from 'path';

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

// Layer 0: アプリ仕様書をビルド時に読み込み
let APP_SPEC = '';
try {
  APP_SPEC = readFileSync(join(process.cwd(), 'APP_SPEC.md'), 'utf-8');
} catch {
  APP_SPEC = 'アプリ仕様書が見つかりません。';
}

// Function Calling用ツール定義
const mochiTools: FunctionDeclaration[] = [
  {
    name: "update_user_profile",
    description: "ユーザーについて新しくわかった事実を記憶する。すでに知っていることは記憶しない。適切なカテゴリを選んで追記する。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        user_id: { type: Type.STRING, enum: ["user_a", "user_b"], description: "ミルク=user_a, メリー=user_b" },
        category: { type: Type.STRING, enum: ["basic", "personality", "business", "health", "finance", "hobbies", "other"], description: "basic=基本情報, personality=性格・価値観, business=事業・仕事, health=健康・生活, finance=お金, hobbies=趣味・興味, other=その他" },
        fact: { type: Type.STRING, description: "新しくわかった事実（例: 最近ジムに通い始めた）" }
      },
      required: ["user_id", "category", "fact"]
    }
  },
  {
    name: "update_relationship_vibe",
    description: "2人の現在の関係性や雰囲気が変わったと感じたときに更新する。普段通りの会話では呼ばない。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        vibe: { type: Type.STRING, enum: ["lovey_dovey", "normal", "tense", "excited", "tired"], description: "lovey_dovey=ラブラブ, normal=普通, tense=ちょっとピリピリ, excited=ワクワク, tired=お疲れ気味" },
        reason: { type: Type.STRING, description: "なぜそう判断したか（例: 記念日の話で盛り上がっている）" }
      },
      required: ["vibe", "reason"]
    }
  },
  {
    name: "add_todo",
    description: "2人のTODOリストに新しいタスクを追加する。ユーザーが「○○やらなきゃ」「○○を予定に入れて」と言ったときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "タスクのタイトル（例: 引っ越しの荷造り）" },
        assignee: { type: Type.STRING, enum: ["user_a", "user_b", "both"], description: "担当: ミルク=user_a, メリー=user_b, 2人=both" },
        due_date: { type: Type.STRING, description: "期限（YYYY-MM-DD形式、なければ空文字）" }
      },
      required: ["title"]
    }
  },
  {
    name: "list_todos",
    description: "現在のTODOリストを確認する。ユーザーが「今のタスク教えて」「やること何がある？」と聞いたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  },
  {
    name: "update_todo_status",
    description: "タスクのステータスを変更する。「○○終わった」「○○完了」「○○が遅れてる」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title_keyword: { type: Type.STRING, description: "タスクを特定するためのキーワード（タイトルの一部でOK）" },
        status: { type: Type.STRING, enum: ["not_started", "on_track", "trouble", "delayed", "blocked", "done"], description: "まだ=not_started, 順調=on_track, トラブル=trouble, 遅れてる=delayed, 止まってる=blocked, 完了=done" }
      },
      required: ["title_keyword", "status"]
    }
  },
  {
    name: "delete_todo",
    description: "タスクを削除する。「○○は要らなくなった」「○○を消して」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title_keyword: { type: Type.STRING, description: "タスクを特定するためのキーワード（タイトルの一部でOK）" }
      },
      required: ["title_keyword"]
    }
  },
  {
    name: "add_reminder",
    description: "リマインダーを追加する。「毎朝○時にリマインドして」「○日に通知して」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING, description: "リマインダーのメッセージ" },
        schedule_type: { type: Type.STRING, enum: ["once", "daily", "weekly"], description: "once=1回, daily=毎日, weekly=毎週" },
        time: { type: Type.STRING, description: "時間（HH:MM形式、例: 09:00）" },
        date: { type: Type.STRING, description: "onceの場合の日付（YYYY-MM-DD形式）。daily/weeklyなら空文字" },
        day_of_week: { type: Type.STRING, description: "weeklyの場合の曜日番号（1=月〜7=日）。weekly以外なら空文字" }
      },
      required: ["message", "schedule_type", "time"]
    }
  },
  {
    name: "toggle_reminder",
    description: "リマインダーのON/OFFを切り替える。「○○のリマインダーを止めて」「○○を再開して」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message_keyword: { type: Type.STRING, description: "リマインダーを特定するためのキーワード（メッセージの一部でOK）" },
        active: { type: Type.BOOLEAN, description: "ONにする=true, OFFにする=false" }
      },
      required: ["message_keyword", "active"]
    }
  },
  {
    name: "delete_reminder",
    description: "リマインダーを削除する。「○○のリマインダーを消して」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message_keyword: { type: Type.STRING, description: "リマインダーを特定するためのキーワード（メッセージの一部でOK）" }
      },
      required: ["message_keyword"]
    }
  },
  {
    name: "list_memos",
    description: "共有メモの一覧を確認する。「メモに何がある？」「メモ教えて」と聞かれたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  },
  {
    name: "create_memo",
    description: "新しい共有メモを作成する。「○○をメモして」「メモに書いておいて」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "メモのタイトル" },
        content: { type: Type.STRING, description: "メモの本文" }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "update_memo",
    description: "既存のメモを更新する。「○○のメモに追記して」「○○のメモを更新して」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title_keyword: { type: Type.STRING, description: "メモを特定するためのキーワード（タイトルの一部でOK）" },
        content: { type: Type.STRING, description: "追記または上書きする内容" },
        mode: { type: Type.STRING, enum: ["append", "replace"], description: "append=末尾に追記, replace=内容を上書き" }
      },
      required: ["title_keyword", "content"]
    }
  },
  {
    name: "delete_memo",
    description: "メモを削除する。「○○のメモを消して」「○○のメモを削除して」と言われたときに使う。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title_keyword: { type: Type.STRING, description: "メモを特定するためのキーワード（タイトルの一部でOK）" }
      },
      required: ["title_keyword"]
    }
  }
];

// ===== メモリ層の取得 =====

async function getLayer1(): Promise<string> {
  try {
    const [profilesRes, vibeRes] = await Promise.all([
      supabase.from('mochi_user_profiles').select('*'),
      supabase.from('mochi_relationship').select('*').limit(1).single()
    ]);

    let result = '';

    const categoryLabels: Record<string, string> = {
      basic: '基本情報', personality: '性格・価値観', business: '事業・仕事',
      health: '健康・生活', finance: 'お金', hobbies: '趣味・興味', other: 'その他'
    };

    if (profilesRes.data && profilesRes.data.length > 0) {
      for (const p of profilesRes.data) {
        result += `【${p.display_name}（${p.user_id}）】\n`;
        const facts = p.facts || {};
        if (typeof facts === 'object' && !Array.isArray(facts)) {
          for (const [key, label] of Object.entries(categoryLabels)) {
            const text = (facts as any)[key];
            if (text && typeof text === 'string' && text.trim()) {
              result += `[${label}]\n${text.trim()}\n\n`;
            }
          }
        } else if (Array.isArray(facts) && facts.length > 0) {
          // 旧形式フォールバック
          result += `  情報: ${facts.join('、')}\n`;
        }
        if (p.personality) result += `[性格メモ（旧）] ${p.personality}\n`;
      }
    }

    if (vibeRes.data) {
      const vibeLabels: Record<string, string> = {
        lovey_dovey: 'ラブラブ',
        normal: '普通',
        tense: 'ちょっとピリピリ',
        excited: 'ワクワク',
        tired: 'お疲れ気味'
      };
      result += `\n【2人の今の雰囲気】${vibeLabels[vibeRes.data.vibe] || vibeRes.data.vibe}`;
      if (vibeRes.data.vibe_reason) result += `（${vibeRes.data.vibe_reason}）`;
      result += '\n';
    }

    return result || '（ユーザー情報はまだありません）';
  } catch {
    return '（ユーザー情報の取得に失敗）';
  }
}

async function getLayer2(): Promise<string> {
  try {
    const { data } = await supabase
      .from('mochi_conversation_summaries')
      .select('summary, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    if (data && data.length > 0) {
      return data.map(s => s.summary).join('\n\n');
    }
    return '（過去の会話サマリーはまだありません）';
  } catch {
    return '（サマリー取得に失敗）';
  }
}

async function getLayer3(): Promise<any[]> {
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!messages || messages.length === 0) return [];
  return messages.reverse();
}

// ===== Function Call実行 =====

async function executeFunctionCall(name: string, args: any): Promise<string | null> {
  try {
    if (name === 'update_user_profile') {
      const category = args.category || 'other';
      const { data: profile } = await supabase
        .from('mochi_user_profiles')
        .select('facts')
        .eq('user_id', args.user_id)
        .single();

      const currentFacts = (profile?.facts && typeof profile.facts === 'object' && !Array.isArray(profile.facts))
        ? { ...profile.facts }
        : { basic: '', personality: '', business: '', health: '', finance: '', hobbies: '', other: '' };

      const existing = (currentFacts as any)[category] || '';
      // 重複チェック（既に同じテキストが含まれていればスキップ）
      if (!existing.includes(args.fact)) {
        (currentFacts as any)[category] = existing ? `${existing}\n${args.fact}` : args.fact;
        await supabase
          .from('mochi_user_profiles')
          .update({ facts: currentFacts, updated_at: new Date().toISOString() })
          .eq('user_id', args.user_id);
      }

      await supabase.from('mochi_memory_log').insert([{
        action: 'update_user_profile',
        detail: { user_id: args.user_id, category, fact: args.fact }
      }]);
      return null; // プロフィール更新は黙って行う

    } else if (name === 'update_relationship_vibe') {
      await supabase
        .from('mochi_relationship')
        .update({
          vibe: args.vibe,
          vibe_reason: args.reason,
          updated_at: new Date().toISOString()
        })
        .neq('id', 0); // update all rows

      await supabase.from('mochi_memory_log').insert([{
        action: 'update_relationship_vibe',
        detail: { vibe: args.vibe, reason: args.reason }
      }]);
      return null; // Vibe更新は黙って行う

    } else if (name === 'add_todo') {
      await supabase.from('todos').insert([{
        title: args.title,
        assignee: args.assignee || 'both',
        due_date: args.due_date || null,
        created_by: 'mochi',
      }]);
      await supabase.from('mochi_memory_log').insert([{
        action: 'add_todo',
        detail: { title: args.title, assignee: args.assignee, due_date: args.due_date }
      }]);
      const assigneeLabel = args.assignee === 'user_a' ? 'ミルク' : args.assignee === 'user_b' ? 'メリー' : '2人';
      return `📝 TODOに追加したもち！\n・${args.title}　担当: ${assigneeLabel}${args.due_date ? '　期限: ' + args.due_date : ''}`;

    } else if (name === 'list_todos') {
      // システムプロンプトに含まれたTODO情報で対応

    } else if (name === 'update_todo_status') {
      const statusLabels: Record<string, string> = { not_started: 'まだ', on_track: '順調', trouble: 'トラブル', delayed: '遅れてる', blocked: '止まってる', done: '完了' };
      const { data: todos } = await supabase.from('todos').select('id, title').neq('status', 'done');
      const match = todos?.find(t => t.title.includes(args.title_keyword));
      if (match) {
        await supabase.from('todos').update({ status: args.status, updated_at: new Date().toISOString() }).eq('id', match.id);
        await supabase.from('mochi_memory_log').insert([{ action: 'update_todo_status', detail: { title: match.title, status: args.status } }]);
        return `✏️ TODOを更新したもち！\n・${match.title} → ${statusLabels[args.status] || args.status}`;
      }

    } else if (name === 'delete_todo') {
      const { data: todos } = await supabase.from('todos').select('id, title');
      const match = todos?.find(t => t.title.includes(args.title_keyword));
      if (match) {
        await supabase.from('todos').delete().eq('id', match.id);
        await supabase.from('mochi_memory_log').insert([{ action: 'delete_todo', detail: { title: match.title } }]);
        return `🗑️ TODOから削除したもち！\n・${match.title}`;
      }

    } else if (name === 'add_reminder') {
      const [h, m] = (args.time || '09:00').split(':').map(Number);
      let nextRun = new Date();

      if (args.schedule_type === 'once' && args.date) {
        nextRun = new Date(`${args.date}T${args.time}:00`);
      } else {
        nextRun.setHours(h, m, 0, 0);
        if (nextRun <= new Date()) nextRun.setDate(nextRun.getDate() + 1);

        if (args.schedule_type === 'weekly' && args.day_of_week) {
          const jsDay = Number(args.day_of_week) === 7 ? 0 : Number(args.day_of_week);
          while (nextRun.getDay() !== jsDay) nextRun.setDate(nextRun.getDate() + 1);
        }
      }

      const detail: any = { time: args.time };
      if (args.schedule_type === 'weekly' && args.day_of_week) detail.dayOfWeek = Number(args.day_of_week);

      await supabase.from('scheduled_reminders').insert([{
        message: args.message,
        schedule_type: args.schedule_type,
        schedule_detail: detail,
        next_run_at: nextRun.toISOString(),
        is_active: true,
        created_by: 'mochi'
      }]);
      await supabase.from('mochi_memory_log').insert([{ action: 'add_reminder', detail: { message: args.message, type: args.schedule_type } }]);
      const schedLabel = args.schedule_type === 'once' ? '1回' : args.schedule_type === 'daily' ? '毎日' : args.schedule_type === 'weekly' ? '毎週' : args.schedule_type;
      return `⏰ リマインダーを追加したもち！\n・${args.message}（${schedLabel} ${args.time}）`;

    } else if (name === 'toggle_reminder') {
      const { data: reminders } = await supabase.from('scheduled_reminders').select('id, message');
      const match = reminders?.find(r => r.message.includes(args.message_keyword));
      if (match) {
        await supabase.from('scheduled_reminders').update({ is_active: args.active }).eq('id', match.id);
        await supabase.from('mochi_memory_log').insert([{ action: 'toggle_reminder', detail: { message: match.message, active: args.active } }]);
        return args.active ? `🔔 リマインダーを再開したもち！\n・${match.message}` : `🔕 リマインダーを停止したもち！\n・${match.message}`;
      }

    } else if (name === 'delete_reminder') {
      const { data: reminders } = await supabase.from('scheduled_reminders').select('id, message');
      const match = reminders?.find(r => r.message.includes(args.message_keyword));
      if (match) {
        await supabase.from('scheduled_reminders').delete().eq('id', match.id);
        await supabase.from('mochi_memory_log').insert([{ action: 'delete_reminder', detail: { message: match.message } }]);
        return `🗑️ リマインダーを削除したもち！\n・${match.message}`;
      }

    } else if (name === 'list_memos') {
      return null; // LLMの返答で対応

    } else if (name === 'create_memo') {
      const { error: memoErr } = await supabase.from('memos').insert([{
        title: args.title,
        content: args.content || '',
        updated_at: new Date().toISOString()
      }]);
      if (memoErr) {
        console.error('Memo create error:', memoErr);
        return null;
      }
      await supabase.from('mochi_memory_log').insert([{ action: 'create_memo', detail: { title: args.title } }]);
      return `📋 メモを作成したもち！\n・「${args.title}」`;

    } else if (name === 'update_memo') {
      const { data: memos } = await supabase.from('memos').select('id, title, content');
      const match = memos?.find(m => m.title.includes(args.title_keyword));
      if (match) {
        const newContent = args.mode === 'replace' ? args.content : (match.content ? match.content + '\n' + args.content : args.content);
        await supabase.from('memos').update({ content: newContent, updated_at: new Date().toISOString() }).eq('id', match.id);
        await supabase.from('mochi_memory_log').insert([{ action: 'update_memo', detail: { title: match.title, mode: args.mode } }]);
        return args.mode === 'replace' ? `📋 メモを更新したもち！\n・「${match.title}」` : `📋 メモに追記したもち！\n・「${match.title}」`;
      }

    } else if (name === 'delete_memo') {
      const { data: memos } = await supabase.from('memos').select('id, title');
      const match = memos?.find(m => m.title.includes(args.title_keyword));
      if (match) {
        await supabase.from('memos').delete().eq('id', match.id);
        await supabase.from('mochi_memory_log').insert([{ action: 'delete_memo', detail: { title: match.title } }]);
        return `🗑️ メモを削除したもち！\n・「${match.title}」`;
      }
    }
    return null;
  } catch (err) {
    console.error(`Function call ${name} failed:`, err);
    return null;
  }
}

// ===== サマリー圧縮チェック =====

async function checkAndCompactSummary(ai: any): Promise<void> {
  try {
    // 最後にサマリー化したメッセージIDを取得
    const { data: lastSummary } = await supabase
      .from('mochi_conversation_summaries')
      .select('messages_to')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastSummarizedId = lastSummary?.[0]?.messages_to || 0;

    // 未サマリーのメッセージ数を確認
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gt('id', lastSummarizedId);

    if (!count || count < 50) return; // 50件未満なら何もしない

    // 古い50件を取得して要約
    const { data: oldMessages } = await supabase
      .from('messages')
      .select('*')
      .gt('id', lastSummarizedId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!oldMessages || oldMessages.length < 50) return;

    const chatLog = oldMessages.map(m => {
      const speaker = m.user_id === 'user_a' ? 'ミルク' : m.user_id === 'user_b' ? 'メリー' : 'もち';
      return `${speaker}: ${m.text || '(画像)'}`;
    }).join('\n');

    const summaryResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `以下の会話を300字以内で要約してください。重要な出来事、約束、感情の変化を優先して残してください。\n\n${chatLog}` }] }],
      config: { temperature: 0.3, maxOutputTokens: 500 }
    });

    const summary = summaryResponse.text?.trim();
    if (summary) {
      await supabase.from('mochi_conversation_summaries').insert([{
        summary,
        messages_from: oldMessages[0].id,
        messages_to: oldMessages[oldMessages.length - 1].id
      }]);

      await supabase.from('mochi_memory_log').insert([{
        action: 'compact_summary',
        detail: { from: oldMessages[0].id, to: oldMessages[oldMessages.length - 1].id, length: summary.length }
      }]);
    }
  } catch (err) {
    console.error('Summary compaction failed:', err);
  }
}

// ===== メイン処理 =====

export async function POST(req: Request) {
  try {
    const { text, userId, userName, currentScreen } = await req.json();

    // 入力検証
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Invalid text' }, { status: 400 });
    }
    if (!['user_a', 'user_b'].includes(userId)) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      await insertMochiMessage("APIキーが未設定のため、お返事できませんでした⚪️");
      return NextResponse.json({ success: true, fake: true });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 全メモリ層を並行取得
    const [settings, layer1, layer2, layer3, remindersRes, todosRes, memosRes] = await Promise.all([
      supabase.from('couple_settings').select('*').limit(1).single(),
      getLayer1(),
      getLayer2(),
      getLayer3(),
      supabase.from('scheduled_reminders').select('*').eq('is_active', true).order('next_run_at', { ascending: true }),
      supabase.from('todos').select('*').neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('memos').select('id, title, content').order('updated_at', { ascending: false }).limit(10)
    ]);

    const characterPrompt = settings.data?.mochi_prompt || 'あなたはミルクとメリーというラブラブカップルをサポート・応援するAI「もち」です。2人の幸せを願い、丁寧語を使わずに親しみやすく話してください。';

    // 記念日情報の組み立て
    let anniversaryInfo = '';
    if (settings.data?.anniversary_date) {
      anniversaryInfo += `メインの記念日: ${settings.data.anniversary_date}\n`;
    }
    if (settings.data?.other_anniversaries && Array.isArray(settings.data.other_anniversaries)) {
      for (const a of settings.data.other_anniversaries) {
        anniversaryInfo += `${a.title}: ${a.date}\n`;
      }
    }
    if (!anniversaryInfo) anniversaryInfo = '（まだ登録されていません）';

    // リマインダー情報の組み立て
    let reminderInfo = '';
    if (remindersRes.data && remindersRes.data.length > 0) {
      for (const r of remindersRes.data) {
        const typeLabel = r.schedule_type === 'once' ? '1回' : r.schedule_type === 'daily' ? '毎日' : r.schedule_type === 'weekly' ? '毎週' : '毎月';
        const nextRun = r.next_run_at ? new Date(r.next_run_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未定';
        reminderInfo += `- [${typeLabel}] ${r.message}（次回: ${nextRun}）\n`;
      }
    } else {
      reminderInfo = '（登録されているリマインダーはありません）';
    }

    // System Prompt組み立て
    const systemPrompt = [
      characterPrompt,
      '',
      '=== アプリの仕様書（使い方を聞かれたらこの情報をもとに、キャラを崩さず教えてね） ===',
      APP_SPEC,
      '',
      '=== ミルクとメリーについて知っていること ===',
      layer1,
      '',
      '=== 登録されている記念日 ===',
      anniversaryInfo,
      '',
      '=== 有効なリマインダー ===',
      reminderInfo,
      '',
      '=== 進行中のTODOリスト ===',
      todosRes.data && todosRes.data.length > 0
        ? todosRes.data.map((t: any) => {
            const assigneeLabel = t.assignee === 'user_a' ? 'ミルク' : t.assignee === 'user_b' ? 'メリー' : '2人';
            const statusLabel: Record<string, string> = { not_started: 'まだ', on_track: '順調', trouble: 'トラブル', delayed: '遅れてる', blocked: '止まってる' };
            const parent = t.parent_id ? '  (小タスク)' : '';
            return `- ${t.title}${parent} [${statusLabel[t.status] || t.status}] 担当:${assigneeLabel}${t.due_date ? ' 期限:' + t.due_date : ''}`;
          }).join('\n')
        : '（進行中のタスクはありません）',
      '',
      '=== 共有メモ ===',
      memosRes.data && memosRes.data.length > 0
        ? memosRes.data.map((m: any) => `- 「${m.title}」: ${(m.content || '').substring(0, 100)}${(m.content || '').length > 100 ? '...' : ''}`).join('\n')
        : '（メモはありません）',
      '',
      '=== 過去の会話のまとめ ===',
      layer2,
      '',
      currentScreen ? `[システム情報: 現在${userName}は「${currentScreen}」画面を開いています]` : '',
      '',
      '=== 重要なルール ===',
      '- 新しい事実を知ったら update_user_profile で記憶。すでに知っていることは不要。',
      '- 2人の雰囲気が変わったら update_relationship_vibe で更新。普段通りなら不要。',
      '- 「○○やらなきゃ」→ add_todo でTODOに追加。追加したことは伝えてOK。',
      '- 「○○終わった」「○○完了」→ update_todo_status で status を done に。',
      '- 「○○が遅れてる」→ update_todo_status で status を delayed に。',
      '- 「○○を消して」「○○いらない」→ delete_todo でタスク削除。',
      '- 「毎朝○時にリマインドして」→ add_reminder で追加。',
      '- 「○○のリマインダー止めて」→ toggle_reminder で OFF。',
      '- 「○○のリマインダー消して」→ delete_reminder で削除。',
      '- 「やること教えて」→ 上のTODOリスト・リマインダー情報をもとに教える。',
      '- 「○○をメモして」「メモ作って」→ 必ず create_memo ツールを呼ぶ。テキストだけで「作った」と言うのは禁止。',
      '- 「○○のメモに追記して」→ 必ず update_memo ツールを呼ぶ。',
      '- 「○○のメモを消して」→ 必ず delete_memo ツールを呼ぶ。',
      '- 「メモに何がある？」→ 上の共有メモ情報をもとに教える。',
      '- 重要: TODO追加、メモ作成、リマインダー追加などのアクションは、必ず対応するツールを呼んで実行してね。テキストだけで「やった」と言うのは絶対ダメ。',
      '- ツール名やDB操作の詳細はユーザーに言わないでね。自然に会話して。',
    ].join('\n');

    // 会話履歴をGemini形式に変換
    const apiMessages: any[] = [];
    for (const m of layer3) {
      const role = m.user_id === 'mochi' ? 'model' : 'user';
      const speaker = m.user_id === 'user_a' ? 'ミルク' : m.user_id === 'user_b' ? 'メリー' : '誰か';
      const content = m.text || '(画像スタンプ)';

      if (role === 'model') {
        apiMessages.push({ role, parts: [{ text: content }] });
      } else {
        apiMessages.push({ role, parts: [{ text: `${speaker}: ${content}` }] });
      }
    }

    // 最新メッセージ
    apiMessages.push({ role: 'user', parts: [{ text: `${userName}: ${text}` }] });

    // Gemini API呼び出し（Function Calling付き）
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: apiMessages,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 4000,
        tools: [{ functionDeclarations: mochiTools }],
      }
    });

    // Function Callの処理
    const candidate = response.candidates?.[0];
    let aiReply = '';

    const actionReports: string[] = [];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall && part.functionCall.name) {
          const report = await executeFunctionCall(part.functionCall.name, part.functionCall.args || {});
          if (report) actionReports.push(report);
        }
        if (part.text) {
          aiReply += part.text;
        }
      }
    }

    // テキスト応答がない場合（Function Callのみの場合）、再度テキスト生成
    if (!aiReply.trim() && candidate?.content?.parts?.some((p: any) => p.functionCall)) {
      const followUp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [...apiMessages, { role: 'model', parts: candidate.content.parts }],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
          maxOutputTokens: 4000,
        }
      });
      aiReply = followUp.text?.trim() || '';
    }

    // LLMの返答を先に投稿
    if (aiReply.trim()) {
      const insertError = await insertMochiMessage(aiReply.trim());
      if (insertError) {
        return NextResponse.json({ error: `Supabase Insert Error: ${JSON.stringify(insertError)}` }, { status: 500 });
      }
    }

    // アクション報告をLLM返答の後に投稿（定型メッセージ）
    for (const report of actionReports) {
      await insertMochiMessage(report);
    }

    // バックグラウンド: サマリー圧縮チェック（エラーは無視）
    checkAndCompactSummary(ai).catch(err => console.error('Background compaction error:', err));

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Mochi AI Error:", err);
    await insertMochiMessage("（考え中にお餅が詰まってしまいました…⚪️）");
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
        title: "もち ⚪️",
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
