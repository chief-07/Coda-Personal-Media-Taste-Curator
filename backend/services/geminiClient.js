const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
const axios = require('axios');

const https = require('https');
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 20,
  keepAliveMsecs: 5000,
});

const activeGeminiKey = process.env.GEMINI_API_KEY || '';

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

function stripThinkingTags(content) {
  if (typeof content !== 'string') return content;
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function callGroqFallback({ messages, tools, responseFormat = null, temperature = 0.2 }) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error('GROQ_API_KEY not configured for failover');
  }
  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey: groqKey });

  const groqModel = 'qwen/qwen3.8-27b';
  const safeMessages = Array.isArray(messages) ? messages.map(m => ({ ...m })) : [];
  if (responseFormat && safeMessages.length > 0) {
    const hasJsonWord = safeMessages.some(m => typeof m.content === 'string' && /json/i.test(m.content));
    if (!hasJsonWord) {
      const lastIdx = safeMessages.length - 1;
      safeMessages[lastIdx].content = `${safeMessages[lastIdx].content || ''}\nRespond in valid JSON format.`;
    }
  }

  const buildPayload = (includeResponseFormat) => {
    const groqPayload = {
      model: groqModel,
      messages: safeMessages,
      temperature: temperature,
      max_tokens: 700,
    };
    if (includeResponseFormat && responseFormat) {
      groqPayload.response_format = responseFormat.type === 'json_schema'
        ? { type: 'json_object' }
        : responseFormat;
    }
    if (tools && tools.length > 0) {
      groqPayload.tools = tools;
      groqPayload.tool_choice = 'auto';
    }
    return groqPayload;
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await groq.chat.completions.create(buildPayload(attempt === 1));
      if (res?.choices?.[0]?.message?.content) {
        res.choices[0].message.content = stripThinkingTags(res.choices[0].message.content);
      }
      return res;
    } catch (err) {
      const status = err.status || err.response?.status;
      // If 400 on json_object validation (e.g. due to Qwen <think> blocks), immediately retry without response_format
      if (status === 400 && attempt === 1) {
        console.warn(`[Groq Engine] Retrying ${groqModel} without strict response_format...`);
        continue;
      }
      if (status === 429 && attempt === 1) {
        console.warn(`[Groq Engine] Rate limited (429) on ${groqModel}, waiting 3s before retry...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
}

async function callGeminiChat({ messages, tools, responseFormat = null, temperature = 0.2, model = DEFAULT_MODEL, retries = 2 }) {
  const targetModel = (!model || model === 'gemini-2.5-flash') ? DEFAULT_MODEL : model;

  const payload = {
    model: targetModel,
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
            'Authorization': `Bearer ${activeGeminiKey}`,
            'Content-Type': 'application/json',
          },
          httpsAgent: httpsAgent,
          timeout: 25000,
        }
      );
      return response.data;
    } catch (e) {
      const status = e.response?.status;

      // Failover to Groq backup if Gemini fails or times out
      console.warn(`[GeminiClient] Gemini returned HTTP ${status || e.code}. Failing over to Groq backup...`);
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
  GEMINI_API_KEY: activeGeminiKey,
  DEFAULT_MODEL,
};
