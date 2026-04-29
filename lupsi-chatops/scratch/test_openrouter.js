const axios = require('axios');
require('dotenv').config();

async function test() {
  const models = [
    'openrouter/free',
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free'
  ];

  const apiKey = process.env.OPENROUTER_API_KEY;

  for (const model of models) {
    try {
      console.log(`\nTesting ${model}...`);
      const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages: [
          { role: 'system', content: 'You are an assistant. ALWAYS wrap your answer in <respuesta> ... </respuesta>. Example: <respuesta>Hola</respuesta>' },
          { role: 'user', content: 'Como vamos con el proyecto?' }
        ]
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      console.log('Result:', res.data.choices[0].message.content);
    } catch (e) {
      console.error('Error:', e.response?.data || e.message);
    }
  }
}

test();
