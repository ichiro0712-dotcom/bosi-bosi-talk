import pkg from 'pg';
const { Client } = pkg;
const connectionString = "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.couple_settings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        anniversary_date DATE,
        top_image_url TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
      
      -- Ensure there's exactly one default row if it doesn't exist
      INSERT INTO public.couple_settings (id) 
      SELECT gen_random_uuid() WHERE NOT EXISTS (SELECT 1 FROM public.couple_settings LIMIT 1);
      
      ALTER TABLE public.couple_settings ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "誰でも読み書き" ON public.couple_settings;
      CREATE POLICY "誰でも読み書き" ON public.couple_settings FOR ALL USING (true);
    `);
    console.log("Success creating couple_settings");
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
