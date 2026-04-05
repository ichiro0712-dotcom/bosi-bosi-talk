const { Client } = require('pg');
const client = new Client({ connectionString: "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres" });
async function check() {
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='messages';");
  console.log(res.rows);
  await client.end();
}
check();
