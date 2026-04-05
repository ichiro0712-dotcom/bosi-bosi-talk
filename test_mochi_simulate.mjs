import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = "https://pxvqxcbqfxpeashgnvjx.supabase.co"; // wait, the url is needed
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // I can just check the env vars loaded!
// Let's just create a next.js script and run it using tsx or node with envs 
