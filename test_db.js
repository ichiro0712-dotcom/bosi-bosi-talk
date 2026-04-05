const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL || "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres" });
async function updateDB() {
  await client.connect();
  await client.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS target_user text;");
  console.log("DB Updated");
  await client.end();
}
updateDB();
