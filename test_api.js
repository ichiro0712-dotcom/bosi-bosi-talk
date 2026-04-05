const OpenAI = require('openai');
require('dotenv').config({ path: '.env.local' });
async function run() {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{role: 'user', content: 'hello'}],
      temperature: 0.7,
      max_tokens: 50
    });
    console.log(completion.choices[0].message);
  } catch(e) {
    console.error(e);
  }
}
run();
