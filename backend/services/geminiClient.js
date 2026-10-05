const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
const axios = require('axios');

const https = require('https');
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 20,
  keepAliveMsecs: 5000,
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JwqKZnuRfZ4Kfu1VP0PbdF9qCfvg8IfvH6nd0m4l_zPQ';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

async function callGroqFallback({ messages, tools, responseFormat = null, temperature = 0.2 }) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured for failover');
  }
  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  
  const groqPayload = {
    model: 'llama-3.3-70b-versatile',
    messages: messages,
    temperature: temperature,
  };
  if (responseFormat) {
    groqPayload.response_format = responseFormat;
  }
  if (tools && tools.length > 0) {
    groqPayload.tools = tools;
    groqPayload.tool_choice = 'auto';
  }
  
  console.log('[GeminiClient -> Groq Failover] Calling Groq with model llama-3.3-70b-versatile...');
  const res = await groq.chat.completions.create(groqPayload);
  return res;
}

async function callGeminiChat({ messages, tools, responseFormat = null, temperature = 0.2, model = DEFAULT_MODEL, retries = 2 }) {
  const payload = {
    model: model,
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
      const isRateLimit = status === 429;
      const isRetryable = e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || (e.response && (status === 429 || status >= 500));

      // Instant failover to Groq if Gemini hits 429 (rate limit) or 5xx server error
      if ((isRateLimit || (status && status >= 500)) && process.env.GROQ_API_KEY) {
        console.warn(`[GeminiClient] Gemini returned HTTP ${status}. Triggering instant failover to Groq...`);
        try {
          const fallbackData = await callGroqFallback({ messages, tools, responseFormat, temperature });
          console.log('[GeminiClient] ✅ Groq failover succeeded!');
          return fallbackData;
        } catch (groqErr) {
          console.error('[GeminiClient] Groq failover failed:', groqErr.message);
        }
      }

      if (attempt > retries || !isRetryable) {
        throw e;
      }
      const delayMs = status === 429 ? (1500 * attempt) : 300;
      console.warn(`[GeminiClient] Request attempt ${attempt} failed (${status || e.code}). Retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

module.exports = {
  callGeminiChat,
  GEMINI_API_KEY,
  DEFAULT_MODEL,
};
