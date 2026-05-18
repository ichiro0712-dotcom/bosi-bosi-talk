#!/usr/bin/env node
// ハイブリッド検索 RPC 関数 match_messages_hybrid を作成。
// ベクトル類似度 (cosine) と全文検索 (ILIKE) を Reciprocal Rank Fusion でマージ。

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

// 関数の引数: query_text, query_embedding, match_limit, vec_weight, full_weight
// 返値: id, text, user_id, created_at, score
//
// 仕組み:
//   1. ベクトル類似度トップ N*3 を取得
//   2. ILIKE で部分一致するメッセージトップ N*3 を取得
//   3. 各リストの順位を Reciprocal Rank で合成 (rank=i+1 として 1/(60+rank))
//   4. ベクトル側は vec_weight、全文側は full_weight で重み付け
//   5. 合成スコア降順で上位 match_limit を返す
const sql = `
CREATE OR REPLACE FUNCTION match_messages_hybrid(
  query_text TEXT,
  query_embedding vector(768),
  match_limit INT DEFAULT 15,
  vec_weight DOUBLE PRECISION DEFAULT 0.7,
  full_weight DOUBLE PRECISION DEFAULT 0.3
)
RETURNS TABLE (
  id BIGINT,
  text TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ,
  score DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  fetch_limit INT := match_limit * 5;
BEGIN
  RETURN QUERY
  WITH vec_ranked AS (
    SELECT
      m.id,
      ROW_NUMBER() OVER (ORDER BY m.embedding <=> query_embedding ASC) AS rnk
    FROM public.messages m
    WHERE m.embedding IS NOT NULL
      AND m.text IS NOT NULL
      AND m.text <> ''
    ORDER BY m.embedding <=> query_embedding ASC
    LIMIT fetch_limit
  ),
  full_ranked AS (
    SELECT
      m.id,
      ROW_NUMBER() OVER (ORDER BY m.created_at DESC) AS rnk
    FROM public.messages m
    WHERE m.text ILIKE '%' || query_text || '%'
    ORDER BY m.created_at DESC
    LIMIT fetch_limit
  ),
  combined AS (
    SELECT
      COALESCE(v.id, f.id) AS id,
      COALESCE(vec_weight / (60 + v.rnk), 0) +
      COALESCE(full_weight / (60 + f.rnk), 0) AS sc
    FROM vec_ranked v
    FULL OUTER JOIN full_ranked f ON v.id = f.id
  )
  SELECT
    m.id,
    m.text,
    m.user_id,
    m.created_at,
    c.sc AS score
  FROM combined c
  JOIN public.messages m ON m.id = c.id
  WHERE c.sc > 0
  ORDER BY c.sc DESC
  LIMIT match_limit;
END;
$$;
`

await execSql(sql)
console.log('  ✓ match_messages_hybrid RPC 関数を作成 (または更新)')

// 確認
const test = await execSql(`
  SELECT proname, pronargs
  FROM pg_proc
  WHERE proname = 'match_messages_hybrid';
`)
console.log('\n関数情報:')
console.table(test)

console.log('\n✓ Done')
