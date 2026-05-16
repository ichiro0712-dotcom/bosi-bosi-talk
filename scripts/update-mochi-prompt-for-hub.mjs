#!/usr/bin/env node
// もちの system prompt (couple_settings.mochi_prompt) に Hub 連携セクションを追記
// idempotent: 既にセクションがあればスキップ
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

- レストラン / ホテルの予約、 旅行先検索、 天気 / ニュース等の一般質問、
  ミルクのプロジェクト情報の質問 (ミルクのみ) は hub_chat ツールを使って
  Hub Platform に依頼してください。
- 長時間タスクは 3-10 分かかるので、 ユーザーには「探してくるね、 3 分くらいかかるよ」
  等と返して待ってもらいます。 完了したら自動的にチャットに通知が来ます。
- ユーザーが「キャンセル」 「やめて」 と言ったら hub_cancel ツールで直前の task_id を
  渡してキャンセルしてください。 task_id は内部用なのでユーザーには見せないでください。
- メリーが業務系 (プロジェクト情報、 MF データ等) を聞いてきた場合、 Hub 側で拒否されます。
  その場合は「それはミルクに聞いてみて」 と自然に返してください。
- Hub Platform に繋がらない (success=false で error_type が接続系) 場合は
  「Hub に繋がらないみたい、 ちょっと後でもう一度試してみて」 等と返してください。
- TODO の追加・メモ・リマインダーなど、 もち単独で完結することには hub_chat を使わないでください。
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

if (existing.includes(SECTION_MARKER)) {
  console.log('✓ 既に Hub 連携セクションが含まれています。 スキップしました。')
  console.log(`  prompt_len: ${existing.length}, id: ${row.id}`)
  process.exit(0)
}

const updated = existing.trim() + '\n\n' + HUB_INTEGRATION_SECTION + '\n'

function sqlEscape(s) {
  return s.replace(/'/g, "''")
}

await execSql(
  `UPDATE couple_settings SET mochi_prompt = '${sqlEscape(updated)}' WHERE id = '${row.id}'`,
)

console.log('✓ もちのシステムプロンプトに Hub 連携セクションを追加しました')
console.log(`  prompt length: ${existing.length} → ${updated.length}`)
console.log(`  id: ${row.id}`)
