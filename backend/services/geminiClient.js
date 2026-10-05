const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
const axios = require('axios');

const https = require('https');
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 20,
  keepAliveMsecs: 5000,
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = 'gemini-2.5-flash';

// Track if the configured GEMINI_API_KEY is missing, an unsupported AQ.* token, or returned 401/403
let geminiKeyInvalid = !GEMINI_API_KEY || GEMINI_API_KEY.startsWith('AQ.');

async function callGroqFallback({ messages, tools, responseFormat = null, temperature = 0.2 }) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error('GROQ_API_KEY not configured for failover');
  }
  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey: groqKey });

  const modelsToTry = ['qwen/qwen3.8-27b'];
  let lastErr = null;

  for (const groqModel of modelsToTry) {
    try {
      const safeMessages = Array.isArray(messages) ? messages.map(m => ({ ...m })) : [];
      if (responseFormat && safeMessages.length > 0) {
        const hasJsonWord = safeMessages.some(m => typeof m.content === 'string' && /json/i.test(m.content));
        if (!hasJsonWord) {
          const lastIdx = safeMessages.length - 1;
          safeMessages[lastIdx].content = `${safeMessages[lastIdx].content || ''}\nRespond in valid JSON format.`;
        }
      }

      const groqPayload = {
        model: groqModel,
        messages: safeMessages,
        temperature: temperature,
      };
      if (responseFormat) {
        groqPayload.response_format = responseFormat.type === 'json_schema'
          ? { type: 'json_object' }
          : responseFormat;
      }
      if (tools && tools.length > 0) {
        groqPayload.tools = tools;
        groqPayload.tool_choice = 'auto';
      }

      const res = await groq.chat.completions.create(groqPayload);
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`[Groq Engine] Model ${groqModel} warning (${err.status || err.message}), trying next model...`);
    }
  }

  throw lastErr;
}

async function callGeminiChat({ messages, tools, responseFormat = null, temperature = 0.2, model = DEFAULT_MODEL, retries = 2 }) {
  // If GEMINI_API_KEY is not a valid AIza* key or previously returned 401/403, route directly to Groq
  if (geminiKeyInvalid) {
    return await callGroqFallback({ messages, tools, responseFormat, temperature });
  }

  const payload = {
    model: model === 'gemini-3.1-flash-lite' ? 'gemini-2.5-flash' : model,
    messages: messages,
    temperature: temperature,
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const response = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${GEMINI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          httpsAgent: httpsAgent,
          timeout: 30000,
        }
      );
      return response.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 401 || status === 403 || status === 400) {
        geminiKeyInvalid = true;
      }

      // Failover to Groq on ANY Gemini HTTP or network error (401, 403, 404, 429, 5xx, timeout)
      console.warn(`[GeminiClient] Gemini returned HTTP ${status || e.code}. Failing over to Groq...`);
      try {
        const fallbackData = await callGroqFallback({ messages, tools, responseFormat, temperature });
        return fallbackData;
      } catch (groqErr) {
        console.error('[GeminiClient] Groq failover failed:', groqErr.message);
        if (attempt > retries) {
          throw groqErr;
        }
      }
    }
  }
}

module.exports = {
  callGeminiChat,
  GEMINI_API_KEY,
  DEFAULT_MODEL,
};
