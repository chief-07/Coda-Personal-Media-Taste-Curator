const express = require('express');
const axios = require('axios');
const router = express.Router();

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/transcribe', upload.single('file'), async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || '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';
  
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key not configured on proxy server' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  console.log(`[STT Proxy] Transcribing audio with length ${req.file.size} bytes`);

  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Build the multipart payload buffer
    const chunks = [];
    
    // 1. Model parameter
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from('Content-Disposition: form-data; name="model"\r\n\r\n'));
    chunks.push(Buffer.from('whisper-1\r\n'));
    
    // 2. File parameter
    const filename = req.file.originalname || 'audio.m4a';
    const mimetype = req.file.mimetype || 'audio/m4a';
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${mimetype}\r\n\r\n`));
    chunks.push(req.file.buffer);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const bodyBuffer = Buffer.concat(chunks);
    
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', bodyBuffer, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 30000
    });
    
    res.json(response.data);
  } catch (e) {
    console.error('[STT Proxy Error]:', e.message);
    if (e.response) {
      console.error('[STT Proxy Response Error]:', JSON.stringify(e.response.data));
      res.status(e.response.status).send(e.response.data);
    } else {
      res.status(500).json({ error: 'STT Proxy request failed', details: e.message });
    }
  }
});

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
