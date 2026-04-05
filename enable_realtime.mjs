import pkg from 'pg';
const { Client } = pkg;

const connectionString = "postgresql://postgres.pxvqxcbqfxpeashgnvjx:f8%23mK9%21zP2%40q5vR_9x@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

async function setupRealtime() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");
    
    // Enable realtime specifically for messages
    await client.query("alter publication supabase_realtime add table public.messages;");
    console.log("✅ SUCCESSFULLY ENABLED REALTIME for 'messages' table!");
    
  } catch (err) {
    if (err.message.includes('already in publication')) {
      console.log("✅ Realtime is ALREADY ENABLED for this table!");
    } else {
      console.error("❌ Failed to alter publication:", err);
    }
  } finally {
    await client.end();
  }
}

setupRealtime();
