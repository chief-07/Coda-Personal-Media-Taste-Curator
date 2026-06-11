const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || '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';
  
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key not configured on proxy server' });
  }

  console.log(`[Chat Proxy] Routing request to OpenAI`);

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', req.body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 60000
    });
    res.json(response.data);
  } catch (e) {
    console.error('[Chat Proxy Error]:', e.message);
    if (e.response) {
      res.status(e.response.status).send(e.response.data);
    } else {
      res.status(500).json({ error: 'Proxy request failed', details: e.message });
    }
  }
});

module.exports = router;
