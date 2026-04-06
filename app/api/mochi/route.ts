import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
    description: "ユーザーについて新しくわかった事実を記憶する。性格、好み、仕事、趣味、最近ハマっていることなど。すでに知っている情報は記憶しない。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        user_id: { type: Type.STRING, enum: ["user_a", "user_b"], description: "ミルク=user_a, メリー=user_b" },
        fact: { type: Type.STRING, description: "新しくわかった事実（例: 最近プログラミングを勉強し始めた）" }
      },
      required: ["user_id", "fact"]
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

    if (profilesRes.data && profilesRes.data.length > 0) {
      for (const p of profilesRes.data) {
        const facts = (p.facts && Array.isArray(p.facts) && p.facts.length > 0)
          ? p.facts.join('、')
          : 'まだ情報なし';
        const personality = p.personality || 'まだ把握していない';
        result += `【${p.display_name}（${p.user_id}）】\n`;
        result += `  わかっていること: ${facts}\n`;
        result += `  性格メモ: ${personality}\n`;
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

async function executeFunctionCall(name: string, args: any): Promise<void> {
  try {
    if (name === 'update_user_profile') {
      const { data: profile } = await supabase
        .from('mochi_user_profiles')
        .select('facts')
        .eq('user_id', args.user_id)
        .single();

      const currentFacts: string[] = (profile?.facts && Array.isArray(profile.facts)) ? profile.facts : [];

      if (!currentFacts.includes(args.fact)) {
        currentFacts.push(args.fact);
        await supabase
          .from('mochi_user_profiles')
          .update({ facts: currentFacts, updated_at: new Date().toISOString() })
          .eq('user_id', args.user_id);
      }

      await supabase.from('mochi_memory_log').insert([{
        action: 'update_user_profile',
        detail: { user_id: args.user_id, fact: args.fact }
      }]);

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
    }
  } catch (err) {
    console.error(`Function call ${name} failed:`, err);
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

    if (!process.env.GEMINI_API_KEY) {
      await insertMochiMessage("APIキーが未設定のため、お返事できませんでした🍡");
      return NextResponse.json({ success: true, fake: true });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 全メモリ層を並行取得
    const [settings, layer1, layer2, layer3] = await Promise.all([
      supabase.from('couple_settings').select('mochi_prompt').limit(1).single(),
      getLayer1(),
      getLayer2(),
      getLayer3()
    ]);

    const characterPrompt = settings.data?.mochi_prompt || 'あなたは「もち」というサポーターボットです。丁寧語を使わずに親しみやすく話してください。';

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
      '=== 過去の会話のまとめ ===',
      layer2,
      '',
      currentScreen ? `[システム情報: 現在${userName}は「${currentScreen}」画面を開いています]` : '',
      '',
      '=== 重要なルール ===',
      '- 新しい事実を知ったら update_user_profile ツールで記憶してね。すでに知っていることは記憶しなくていい。',
      '- 2人の雰囲気が変わったと感じたら update_relationship_vibe ツールで更新してね。普段通りなら不要。',
      '- ツールを使ったことはユーザーに言わないでね。自然に会話して。',
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
        maxOutputTokens: 500,
        tools: [{ functionDeclarations: mochiTools }],
      }
    });

    // Function Callの処理
    const candidate = response.candidates?.[0];
    let aiReply = '';

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall && part.functionCall.name) {
          await executeFunctionCall(part.functionCall.name, part.functionCall.args || {});
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
          maxOutputTokens: 500,
        }
      });
      aiReply = followUp.text?.trim() || '';
    }

    if (aiReply.trim()) {
      const insertError = await insertMochiMessage(aiReply.trim());
      if (insertError) {
        return NextResponse.json({ error: `Supabase Insert Error: ${JSON.stringify(insertError)}` }, { status: 500 });
      }
    }

    // バックグラウンド: サマリー圧縮チェック（エラーは無視）
    checkAndCompactSummary(ai).catch(err => console.error('Background compaction error:', err));

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Mochi AI Error:", err);
    await insertMochiMessage("（考え中にお餅が詰まってしまいました…🍡）");
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
