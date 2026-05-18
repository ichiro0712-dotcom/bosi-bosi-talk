#!/usr/bin/env node
// memos テーブルに position カラムを追加し、既存メモに updated_at 降順で初期値を振る
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

// 1) カラム追加
await execSql(`
  ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS position DOUBLE PRECISION;
`)
console.log('  ✓ position カラムを追加 (または既存)')

// 2) NULL のものに updated_at 降順で連番を振る (1000 刻み: 並び替え時の挿入余地確保)
await execSql(`
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY updated_at DESC) AS rn
    FROM public.memos
    WHERE position IS NULL
  )
  UPDATE public.memos m
  SET position = ranked.rn * 1000
  FROM ranked
  WHERE m.id = ranked.id;
`)
console.log('  ✓ 既存メモに position 初期値を設定')

// 3) インデックス
await execSql(`
  CREATE INDEX IF NOT EXISTS memos_position_idx ON public.memos(position);
`)
console.log('  ✓ position インデックス作成')

// 4) 確認
const rows = await execSql('SELECT id, title, position FROM public.memos ORDER BY position ASC LIMIT 10')
console.log('\n現在のメモ (先頭10件):')
console.table(rows)

console.log('\n✓ Done')
