const express = require('express');
const https = require('https');
const router = express.Router();

router.post('/', (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || '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';
  
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key not configured on proxy server' });
  }

  const bodyData = JSON.stringify(req.body);
  console.log(`[Chat Proxy] Routing request to OpenAI`);

  const openaiReqOptions = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(bodyData)
    }
  };

  const openaiReq = https.request(openaiReqOptions, (openaiRes) => {
    res.status(openaiRes.statusCode);
    
    let responseBody = '';
    openaiRes.on('data', chunk => {
      responseBody += chunk;
    });
    
    openaiRes.on('end', () => {
      try {
        const jsonResponse = JSON.parse(responseBody);
        res.json(jsonResponse);
      } catch (e) {
        res.send(responseBody);
      }
    });
  });

  openaiReq.on('error', (e) => {
    console.error('[Chat Proxy Error]:', e);
    res.status(500).json({ error: 'Proxy request failed', details: e.message });
  });

  openaiReq.write(bodyData);
  openaiReq.end();
});

module.exports = router;
