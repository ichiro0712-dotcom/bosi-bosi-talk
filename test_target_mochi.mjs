import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL || "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query(`SELECT * FROM messages WHERE target_user = 'mochi' ORDER BY created_at DESC LIMIT 5;`);
    console.log("Messages TO mochi:", rows);
  } catch(e) {
    console.log("Error:", e);
  } finally {
    await client.end();
  }
}
run();
