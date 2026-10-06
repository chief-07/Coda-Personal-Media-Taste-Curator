const express = require('express');
const axios = require('axios');
const router = express.Router();

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/transcribe', upload.single('file'), async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  console.log(`[STT Proxy] Transcribing audio with length ${req.file.size} bytes via Groq Whisper`);

  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Build the multipart payload buffer
    const chunks = [];
    
    // 1. Model parameter
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from('Content-Disposition: form-data; name="model"\r\n\r\n'));
    chunks.push(Buffer.from('whisper-large-v3\r\n'));
    
    // 2. File parameter
    const filename = req.file.originalname || 'audio.m4a';
    const mimetype = req.file.mimetype || 'audio/m4a';
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${mimetype}\r\n\r\n`));
    chunks.push(req.file.buffer);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const bodyBuffer = Buffer.concat(chunks);
    
    const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', bodyBuffer, {
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

const { callGeminiChat } = require('../services/geminiClient');

router.post('/', async (req, res) => {
  console.log(`[Chat Proxy] Routing request to Gemini 3.1 Flash`);

  try {
    const { messages, tools, response_format, temperature } = req.body;
    const response = await callGeminiChat({
      messages,
      tools,
      responseFormat: response_format,
      temperature: temperature !== undefined ? temperature : 0.2,
      model: 'gemini-3.1-flash-lite',
    });

const walrus = require('../services/walrusMemoryService');

    if (response && response.choices && response.choices[0] && response.choices[0].message) {
      let content = (response.choices[0].message.content || '').trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        response.choices[0].message.content = content;
      }
      try {
        const parsed = JSON.parse(content);
        const userId = req.body.userId;
        if (parsed && parsed.memory_updates && userId) {
          try {
            const walrusWrites = await Promise.race([
              walrus.routeAndSaveLivingMemory(userId, parsed.memory_updates),
              new Promise((resolve) => setTimeout(() => resolve([]), 3000)),
            ]);
            parsed.memory_updates.walrus_writes = walrusWrites || [];
            parsed.memory_updates.user_id = walrus.sanitizeUserId(userId);
            response.choices[0].message.content = JSON.stringify(parsed);
          } catch (err) {
            console.error('[Walrus Auto-Save Error]:', err.message);
          }
        }
      } catch (_) {}
    }
    res.json(response);
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
