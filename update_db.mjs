import pkg from 'pg';
const { Client } = pkg;
const connectionString = "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(`ALTER TABLE public.scheduled_reminders ADD COLUMN IF NOT EXISTS created_by TEXT;`);
    console.log("Success adding created_by");
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
