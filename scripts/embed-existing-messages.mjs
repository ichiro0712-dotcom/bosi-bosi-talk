#!/usr/bin/env node
// 既存メッセージを Gemini gemini-embedding-001 (768次元) で埋め込み、messages.embedding を埋める。
// 何度実行しても安全: embedding が NULL のものだけ処理する。

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// .env.local を簡易ロード
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const geminiKey = process.env.GEMINI_API_KEY

if (!supabaseUrl || !supabaseKey || !geminiKey) {
  console.error('環境変数が不足: SUPABASE_URL / SERVICE_ROLE_KEY / GEMINI_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const BATCH_SIZE = 100   // 1回のDB取得件数
const EMBED_BATCH = 5    // Gemini API への並列リクエスト数 (レート制限保護)
const MODEL = 'gemini-embedding-001'
const DIMS = 768

async function embedText(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: DIMS,
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini embed failed (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data?.embedding?.values
}

async function processBatch(messages) {
  // 並列で埋め込み
  const results = []
  for (let i = 0; i < messages.length; i += EMBED_BATCH) {
    const chunk = messages.slice(i, i + EMBED_BATCH)
    const chunkResults = await Promise.all(
      chunk.map(async (m) => {
        try {
          const vec = await embedText(m.text)
          return { id: m.id, embedding: vec }
        } catch (e) {
          console.error(`  ✗ id=${m.id} 埋め込み失敗: ${e.message}`)
          return null
        }
      }),
    )
    results.push(...chunkResults.filter(Boolean))
  }

  // DB に書き戻し (並列でも、id 別なので安全)
  await Promise.all(
    results.map((r) =>
      supabase
        .from('messages')
        .update({ embedding: r.embedding })
        .eq('id', r.id),
    ),
  )
  return results.length
}

let totalProcessed = 0
let totalErrors = 0
let round = 0

while (true) {
  round++
  // text が空でない (= 埋め込み対象あり) かつ embedding がまだ NULL のメッセージを取得
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, text')
    .is('embedding', null)
    .not('text', 'is', null)
    .neq('text', '')
    .order('id', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('取得失敗:', error)
    process.exit(1)
  }
  if (!messages || messages.length === 0) {
    console.log('\n✓ 全件埋め込み完了')
    break
  }

  console.log(`[round ${round}] ${messages.length} 件を埋め込み中...`)
  const processed = await processBatch(messages)
  totalProcessed += processed
  totalErrors += messages.length - processed
  console.log(`  → ${processed} 件成功 (累計: ${totalProcessed})`)

  // レート制限保護: 1秒スリープ
  await new Promise((r) => setTimeout(r, 500))
}

console.log(`\n結果: 成功 ${totalProcessed} / 失敗 ${totalErrors}`)
