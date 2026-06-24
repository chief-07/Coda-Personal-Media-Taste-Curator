const axios = require('axios');
const path = require('path');

// Load public app config plus ignored local backend secrets.
require('./loadEnv');

async function run() {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('API Key length:', apiKey ? apiKey.length : 0);
  
  try {
    console.log('Sending request to OpenAI...');
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hello!' }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    console.log('Response:', res.data.choices[0].message.content);
  } catch (e) {
    console.error('Error calling OpenAI:', e.message, e.code);
    if (e.response) {
      console.error('Response Status:', e.response.status);
      console.error('Response Data:', e.response.data);
    }
  }
}

run();
