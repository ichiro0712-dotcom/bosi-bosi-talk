import pkg from 'pg';
const { Client } = pkg;

const connectionString = "postgresql://postgres:f8%23mK9%21zP2%40q5vR_9x@db.pxvqxcbqfxpeashgnvjx.supabase.co:5432/postgres";

async function setup() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");

    const query = `
      -- message_reactions テーブルの作成
      CREATE TABLE IF NOT EXISTS public.message_reactions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        message_id BIGINT REFERENCES public.messages(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        reaction_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        UNIQUE(message_id, user_id)
      );

      -- RLS の有効化
      ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
      
      -- 既存のポリシーをクリアして再作成
      DROP POLICY IF EXISTS "誰でも読み書き可能" ON public.message_reactions;
      CREATE POLICY "誰でも読み書き可能" ON public.message_reactions FOR ALL USING (true);
      
      -- message_reactions を Realtime に追加 (まだ含まれていない場合)
      -- 警告を避けるため、事前に publication をチェックすることはできないので単純に追加やリカバリをする方法をとる
    `;

    await client.query(query);
    console.log("message_reactions table and policies created successfully!");

    // Realtimeのpublicationにテーブルを追加する
    const enableRealtimeQuery = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 
          FROM pg_publication_tables 
          WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          -- publicationが存在しないなどのエラーは無視（セットアップスクリプトに依存）
      END $$;
    `;
    await client.query(enableRealtimeQuery);
    console.log("message_reactions table added to realtime publication.");

  } catch (err) {
    console.error("Error setting up database:", err);
  } finally {
    await client.end();
  }
}

setup();
