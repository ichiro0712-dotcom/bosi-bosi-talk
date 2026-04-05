const { Client } = require('pg');
const client = new Client({ connectionString: "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres" });
async function updateDB() {
  await client.connect();
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log("DB Updated");
  await client.end();
}
updateDB();
