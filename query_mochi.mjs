import pkg from 'pg';
const { Client } = pkg;
const connectionString = "postgresql://postgres:f8%23mK9%21zP2%40q5vR_9x@db.pxvqxcbqfxpeashgnvjx.supabase.co:5432/postgres";

async function query() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query("SELECT id, text, length(text) FROM messages WHERE user_id = 'mochi' AND text LIKE '%先週もみんな%' ORDER BY created_at DESC LIMIT 5;");
  console.log(res.rows);
  await client.end();
}
query();
