import pkg from 'pg';
const { Client } = pkg;
const connectionString = "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE public.couple_settings 
      ADD COLUMN IF NOT EXISTS other_anniversaries JSONB DEFAULT '[]'::jsonb;
    `);
    console.log("Success altering couple_settings");
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
