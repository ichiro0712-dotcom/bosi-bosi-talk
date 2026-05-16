#!/usr/bin/env node
// もちの system prompt (couple_settings.mochi_prompt) に Hub 連携セクションを追記/更新
// idempotent: 既にセクションがあれば最新版で「置換」 する (毎回 noop ではなく、 更新もできる)
//
// 実行: cd チャットアプリ && node scripts/update-mochi-prompt-for-hub.mjs

import { execSync } from 'node:child_process'

function getSupabaseToken() {
  const b64 = execSync('security find-generic-password -s "Supabase CLI" -a "supabase" -w', {
    encoding: 'utf8',
  }).trim()
  const stripped = b64.replace(/^go-keyring-base64:/, '')
  return Buffer.from(stripped, 'base64').toString('utf8')
}

const TOKEN = getSupabaseToken()
const REF = 'pxvqxcbqfxpeashgnvjx'

async function execSql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'supabase-cli/2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const body = await r.text()
  if (!r.ok) {
    throw new Error(`SQL failed (${r.status}): ${body}`)
  }
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

const SECTION_MARKER = '# Hub Platform 連携について'

const HUB_INTEGRATION_SECTION = `
# Hub Platform 連携について

あなたの「外部の頼れる仲間」 として **Agent Hub** という業務支援プラットフォームと
繋がっています。 ユーザーから見ると「もちが Agent Hub さんに聞きに行ってくれる」
体験になります。

## いつ Agent Hub に頼るか (= いつ hub_chat ツールを呼ぶか)
- お天気やニュースなど一般情報の質問
- レストラン / ホテルの予約、 旅行先検索
- ミルクのプロジェクト・業務情報の質問 (ミルクのみ、 メリーは拒否される)

## いつ Agent Hub に頼らないか
- TODO 追加、 メモ、 リマインダー、 ユーザーの記憶更新など、 もち単独で完結する作業
- 雑談、 ユーザーへの返答

## キャラを保つルール (重要)
- ユーザーに「Hub Platform」 「Hub」 「MCP」 等の専門用語は使わない。
  代わりに「Agent Hub さん」 と呼んでください。
- hub_chat を呼んだ直後の挨拶は**もちの口調で自然に**:
    例: 「今日のお天気だもちね！ Agent Hub さんに聞いてみるもち！ ちょっと待ってもち、
         3 分くらいかかるかも〜」
- 結果の通知が届いた時 (= 完了通知メッセージは別の経路で自動的にチャットに表示されます。
  あなた自身がそれを書く必要はありません) も、 もちらしく:
    例: 「お返事来たもち！」 等
- 「task_id」 「キャンセル ID」 「callback」 等の内部識別子はユーザーに絶対見せない

## 完了通知について
hub_chat が long-running task の場合、 結果は別の経路で「お返事きたもち！」 という
見出し + Agent Hub からの本文の引用 という形で自動的にチャットに表示されます。
あなたが結果を自分で書き起こす必要はありません。 「待っててね」 系の応答だけして
OK です。 結果が届くと user 側で自動的にバッジ通知が鳴ります。

## キャンセル
ユーザーが「キャンセル」 「やめて」 と言ったら hub_cancel ツールで直前の task_id を
渡してキャンセル。 30 秒以内に止まる旨をもちの口調で伝えてください。

## エラー時
hub_chat が success=false を返したら、 もちの優しい口調で
「Agent Hub さんと繋がらないみたい、 ちょっとあとでもう一回試させてもち」 等と返答してください。

## メリーが業務系を聞いてきた場合
Agent Hub 側で拒否されてその応答 (例: 「ごめん、 メリーにはそのお願いは聞けない...」)
が自動的に引用形式で表示されます。 あなたが何か追加で言う必要はないですが、 もし
発話するなら「Agent Hub さんに聞いてみたけど、 ミルクだけが頼めるみたい」 等の
補足を加えて OK。
`.trim()

// 1. 既存 row 取得
const rows = await execSql(
  'SELECT id, mochi_prompt FROM couple_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1',
)
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('couple_settings レコードが見つかりません。 アプリ初回起動が必要かも。')
  process.exit(1)
}
const row = rows[0]
const existing = row.mochi_prompt ?? ''

let updated
if (existing.includes(SECTION_MARKER)) {
  // 既存セクションを最新版で置換
  const idx = existing.indexOf(SECTION_MARKER)
  const before = existing.slice(0, idx).replace(/\n+$/, '')
  updated = before + '\n\n' + HUB_INTEGRATION_SECTION + '\n'
  console.log('  ✓ 既存の Hub 連携セクションを最新版で置換します')
} else {
  updated = existing.trim() + '\n\n' + HUB_INTEGRATION_SECTION + '\n'
  console.log('  ✓ Hub 連携セクションを新規追加します')
}

if (updated === existing) {
  console.log('変更なし (内容が完全一致)。 skip。')
  process.exit(0)
}

function sqlEscape(s) {
  return s.replace(/'/g, "''")
}

await execSql(
  `UPDATE couple_settings SET mochi_prompt = '${sqlEscape(updated)}', updated_at = now() WHERE id = '${row.id}'`,
)

console.log('✓ もちのシステムプロンプトを更新しました')
console.log(`  prompt length: ${existing.length} → ${updated.length}`)
console.log(`  id: ${row.id}`)
