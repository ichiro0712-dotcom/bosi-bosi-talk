#!/usr/bin/env node
// subscriptions に「通知が届いているか」 を追跡する列を追加する
//   last_seen_at     : 端末がアプリを開いて購読を更新した時刻
//   last_sent_at     : サーバが FCM 等に送信した時刻
//   last_send_status : そのときの送信結果 (HTTP ステータス or エラー)
//   last_received_at : 端末の Service Worker が push を受け取った時刻 (/api/push-ack)
// last_sent_at が新しいのに last_received_at が古い → 端末まで届いていない
// idempotent: 何度実行しても安全

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

await execSql(`
  ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_send_status text,
    ADD COLUMN IF NOT EXISTS last_received_at timestamptz;
`)
console.log('  ✓ 診断用カラムを追加 (または既存)')

const rows = await execSql(`
  SELECT id, user_id, last_seen_at, last_sent_at, last_send_status, last_received_at
  FROM public.subscriptions ORDER BY id
`)
console.table(rows)

console.log('\n✓ Done')
