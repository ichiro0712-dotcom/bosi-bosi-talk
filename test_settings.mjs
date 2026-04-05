import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL || "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='couple_settings'`);
    if(rows.length === 0) {
      console.log("NO_TABLE_COUPLE_SETTINGS");
    } else {
      console.log("TABLE_EXISTS");
      const data = await client.query(`SELECT * FROM couple_settings`);
      console.log("DATA:", data.rows);
    }
  } catch(e) {
    console.log("Error:", e);
  } finally {
    await client.end();
  }
}
run();
