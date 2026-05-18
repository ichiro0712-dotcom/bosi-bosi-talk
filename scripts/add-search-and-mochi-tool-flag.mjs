#!/usr/bin/env node
// ハイブリッド検索基盤 (pgvector + 全文検索) と memos.is_mochi_tool を追加する。
// idempotent: 何度実行しても安全。

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

// 1) pgvector 拡張を有効化
await execSql(`CREATE EXTENSION IF NOT EXISTS vector;`)
console.log('  ✓ vector 拡張を有効化')

// 2) pg_trgm 拡張を有効化 (全文検索の補助、日本語の部分一致でも効く)
await execSql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
console.log('  ✓ pg_trgm 拡張を有効化')

// 3) messages.embedding カラム追加 (768次元: Gemini gemini-embedding-001)
await execSql(`
  ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS embedding vector(768);
`)
console.log('  ✓ messages.embedding カラムを追加')

// 4) ベクトル検索インデックス (ivfflat, cosine 距離)
//    既存件数が少なくてもivfflatは作れる。listsはデフォルト100。
await execSql(`
  CREATE INDEX IF NOT EXISTS messages_embedding_idx
  ON public.messages USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
`)
console.log('  ✓ embedding インデックス (ivfflat) 作成')

// 5) 全文検索用 trigram インデックス
//    日本語混じりでも部分一致が高速になる。tsvector + GINも候補だが、日本語の形態素解析は別途
//    必要なので、pg_trgm の方が手軽で実用的。
await execSql(`
  CREATE INDEX IF NOT EXISTS messages_text_trgm_idx
  ON public.messages USING GIN (text gin_trgm_ops);
`)
console.log('  ✓ messages.text 用 trigram GIN インデックス作成')

// 6) memos.is_mochi_tool カラム追加
await execSql(`
  ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS is_mochi_tool BOOLEAN NOT NULL DEFAULT FALSE;
`)
console.log('  ✓ memos.is_mochi_tool カラムを追加')

// 7) 確認
const counts = await execSql(`
  SELECT
    (SELECT COUNT(*) FROM public.messages) AS total_messages,
    (SELECT COUNT(*) FROM public.messages WHERE embedding IS NOT NULL) AS embedded_messages,
    (SELECT COUNT(*) FROM public.memos) AS total_memos,
    (SELECT COUNT(*) FROM public.memos WHERE is_mochi_tool = TRUE) AS mochi_tool_memos;
`)
console.log('\n現状:')
console.table(counts)

console.log('\n✓ Done')
