import OpenAI from 'openai';
import { config } from 'dotenv';
config({ path: '.env.local' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function test() {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 10
    });
    console.log("Success:", res.choices[0].message.content);
  } catch(e) {
    console.error("OpenAI Error:", e.message);
  }
}
test();
