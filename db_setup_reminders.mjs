import pkg from 'pg';
const { Client } = pkg;

const connectionString = "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

async function setup() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");

    const query = `
      -- scheduled_reminders テーブルの作成
      CREATE TABLE IF NOT EXISTS public.scheduled_reminders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        message TEXT NOT NULL,
        schedule_type TEXT NOT NULL, -- 'once', 'daily', 'weekly', 'monthly'
        schedule_detail JSONB, -- Example: { "dayOfWeek": 2 } (Tuesday), { "time": "15:00" }
        next_run_at TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );

      -- 誰でも読み書きできるようにする設定 (RLS disable or enable policy)
      ALTER TABLE public.scheduled_reminders ENABLE ROW LEVEL SECURITY;
      
      -- 既存ポリシーがあれば削除し、新しいものを設定
      DROP POLICY IF EXISTS "誰でも読み書き可能" ON public.scheduled_reminders;
      CREATE POLICY "誰でも読み書き可能" ON public.scheduled_reminders FOR ALL USING (true);
    `;

    await client.query(query);
    console.log("Database tables and policies created successfully!");
  } catch (err) {
    console.error("Error setting up database:", err);
  } finally {
    await client.end();
  }
}

setup();
