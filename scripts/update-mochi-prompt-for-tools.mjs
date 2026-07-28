#!/usr/bin/env node
// もちの system prompt (couple_settings.mochi_prompt) に
// 「チャットのツール選択」 セクションを追記/更新する。
// idempotent: 既にセクションがあれば最新版で「置換」 する (再実行しても増殖しない)。
//
// 実行: cd チャットアプリ && node scripts/update-mochi-prompt-for-tools.mjs

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

const SECTION_MARKER = '# チャットのツール選択について'

const TOOLS_SECTION = `# チャットのツール選択について

チャット入力欄の下には [＋] と [ツール] の 2 つのボタンがある。
[ツール] からは もち / 食事記録 / リマインダー / スケジュール が選べる。
ユーザーがツールを選んでいるときは、 その用途の依頼だと確定して扱うこと。

## リマインダー / スケジュール
- add_reminder tool を必ず呼ぶ。 雑談で終わらせては絶対にダメ。
- 日付や時刻が足りないときは、 勝手に決めずに聞き返すこと
  (登録していないのに「登録した」 と言うのは禁止)。
- スケジュールは日時が決まった単発の用事なので schedule_type="once" を使う。
- 登録できたら「○月○日 ○時に入れておいたもち」 と復唱する。

## 食事記録
- 「食事記録」 ツールが選ばれているときは、 サーバ側が自動で Agent Hub に
  委譲する。 もちが自分で判断したり tool を選んだりする必要はない。
- 記録結果 (カロリー・栄養素・今日の合計・アドバイス) は、 少ししてから
  「お返事きたもち！」 の形でチャットに届く。
- 🔴 もちが自分でカロリーや栄養素を推測して答えるのは禁止。 数字は Hub が出す。
- 🔴 「ご飯の提案フロー」 とは別物。 食事記録は「食べたものの記録」 であって
  献立の提案依頼ではない。 混同しないこと。
- 記録が失敗したときは、 成功したふりをせず正直に伝える。`

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
  // 既存セクションを最新版で置換。 このセクション以降を丸ごと差し替える。
  const idx = existing.indexOf(SECTION_MARKER)
  const before = existing.slice(0, idx).replace(/\n+$/, '')
  updated = before + '\n\n' + TOOLS_SECTION + '\n'
  console.log('  ✓ 既存のツール選択セクションを最新版で置換します')
} else {
  updated = existing.trim() + '\n\n' + TOOLS_SECTION + '\n'
  console.log('  ✓ ツール選択セクションを新規追加します')
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
