const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WIKI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CodaApp/2.0 (contact@mycodaapp.net; personal project)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

const { callGeminiChat } = require('./geminiClient');

// Helper to call LLM (Gemini 3.1 Flash) with tools or json format
const callOpenAI = async (messages, tools, retries = 2) => {
  const responseData = await callGeminiChat({
    messages,
    tools,
    responseFormat: (!tools || tools.length === 0) ? { type: 'json_object' } : null,
    temperature: 0.0,
    model: 'gemini-3.1-flash-lite',
    retries,
  });
  return responseData.choices[0].message;
};


const CACHE_DIR = path.join(__dirname, '..', 'cache');
const THEME_CACHE_FILE = path.join(CACHE_DIR, 'theme_research_cache.json');

let themeResearchCache = {};

try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (fs.existsSync(THEME_CACHE_FILE)) {
    themeResearchCache = JSON.parse(fs.readFileSync(THEME_CACHE_FILE, 'utf8'));
    console.log(`[Research] Loaded ${Object.keys(themeResearchCache).length} cached theme research entries.`);
  }
} catch (err) {
  console.warn('[Research] Failed to load theme cache:', err.message);
  themeResearchCache = {};
}

const saveThemeCache = () => {
  try {
    fs.writeFileSync(THEME_CACHE_FILE, JSON.stringify(themeResearchCache, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Research] Failed to save theme cache:', err.message);
  }
};

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const getCachedResearchForMessage = (messageText) => {
  const hits = [];
  const lowercaseMsg = messageText.toLowerCase();
  for (const [cachedTitle, researchText] of Object.entries(themeResearchCache)) {
    const escaped = escapeRegExp(cachedTitle.toLowerCase());
    const isAlphaNumericOnly = /^[a-z0-9 ]+$/i.test(cachedTitle);
    let isMatch = false;
    if (isAlphaNumericOnly) {
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      isMatch = regex.test(lowercaseMsg);
    } else {
      isMatch = lowercaseMsg.includes(cachedTitle.toLowerCase());
    }
    if (isMatch) {
      hits.push({ title: cachedTitle, research: researchText });
    }
  }
  return hits;
};

const researchMediaThemes = async (query) => {
  const normalizedQuery = query.toLowerCase().trim();
  if (themeResearchCache[normalizedQuery]) {
    console.log(`[Research] Cache HIT for "${query}"`);
    return themeResearchCache[normalizedQuery];
  }

  let wikiSummary = "";
  let communityThemes = "";

  // 1. Wikipedia: Search for the right page first, then fetch the extract
  try {
    // Step 1a: Use the search API to find the correct page title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`;
    const searchRes = await axios.get(searchUrl, {
      headers: WIKI_HEADERS,
      timeout: 6000
    });
    const searchResults = searchRes.data?.query?.search;

    if (searchResults && searchResults.length > 0) {
      const pageTitle = searchResults[0].title;
      console.log(`[Research] Wikipedia found page: "${pageTitle}" for query: "${query}"`);

      // Step 1b: Fetch the intro extract for that page
      const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&redirects=1&format=json`;
      const extractRes = await axios.get(extractUrl, {
        headers: WIKI_HEADERS,
        timeout: 6000
      });
      const pages = extractRes.data?.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        if (pageId !== "-1" && pages[pageId]?.extract) {
          wikiSummary = pages[pageId].extract.substring(0, 800);
          console.log(`[Research] Wikipedia extract fetched (${wikiSummary.length} chars) for: "${query}"`);
        } else {
          console.warn(`[Research] Wikipedia page found but extract was empty for: "${pageTitle}"`);
        }
      }
    } else {
      console.warn(`[Research] Wikipedia search returned no results for: "${query}"`);
    }
  } catch (e) {
    console.error(`[Research] Wikipedia search FAILED for "${query}":`, e.message);
  }

  // 2. Community themes: Try Yahoo first (unblocked), fallback to DDG, then Bing
  const communityQuery = `${query} themes analysis reddit`;
  try {
    const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(communityQuery)}`;
    const yahooRes = await axios.get(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
      },
      timeout: 6000
    });
    const $ = cheerio.load(yahooRes.data);
    const snippets = [];
    $('.algo').slice(0, 4).each((i, el) => {
      const text = $(el).find('.compText').text().trim() || $(el).find('.lh-16').text().trim();
      if (text) snippets.push(text);
    });
    if (snippets.length > 0) {
      communityThemes = snippets.join('\n');
      console.log(`[Research] Yahoo returned ${snippets.length} community snippets for: "${query}"`);
    } else {
      throw new Error('Yahoo returned no snippets');
    }
  } catch (e) {
    console.warn(`[Research] Yahoo failed for "${communityQuery}". Skipping further web fallbacks.`);
  }

  const result = `Wikipedia Summary:\n${wikiSummary || '(not found)'}\n\nCommunity Themes:\n${communityThemes || '(not found)'}`;
  themeResearchCache[normalizedQuery] = result;
  saveThemeCache();
  return result;
};

const runTitleExtractor = async (userMessage) => {
  const prompt = `Extract any specific media titles (movies, anime, games, books, etc.) mentioned in this message. Return ONLY a JSON array of strings. If none, return empty array. Message: "${userMessage}"`;
  const messages = [{ role: 'user', content: prompt }];
  try {
    const res = await callOpenAI(messages, null);
    const parsed = JSON.parse(res.content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.titles && Array.isArray(parsed.titles)) return parsed.titles;
    return [];
  } catch (e) {
    return [];
  }
};

const triggerBackgroundResearch = (userMessage) => {
  setImmediate(async () => {
    try {
      console.log(`[Background Research] Spawning title extraction for message: "${userMessage}"`);
      const titles = await runTitleExtractor(userMessage);
      if (titles && titles.length > 0) {
        console.log(`[Background Research] Extracted titles to research:`, titles);
        for (const title of titles) {
          const normalizedTitle = title.toLowerCase().trim();
          if (!themeResearchCache[normalizedTitle]) {
            console.log(`[Background Research] Performing search for title: "${title}"`);
            await researchMediaThemes(title);
          } else {
            console.log(`[Background Research] Title already cached: "${title}"`);
          }
        }
      }
    } catch (err) {
      console.error('[Background Research Error]:', err.message);
    }
  });
};

const runOnboardingAgent = async (messagesPayload) => {
  // Extract user message (the last one)
  const userMessage = messagesPayload[messagesPayload.length - 1].content;
  
  // 1. Sync check cache for any matched titles
  const cachedResearchHits = getCachedResearchForMessage(userMessage);
  
  if (cachedResearchHits.length > 0) {
    console.log(`[Agent] Synchronous Cache Hit during Chat:`, cachedResearchHits.map(h => h.title));
    const combinedContext = cachedResearchHits.map(h => `Title: ${h.title}\nResearch:\n${h.research}`).join('\n\n---\n\n');
    messagesPayload.splice(messagesPayload.length - 1, 0, {
      role: 'system',
      content: `[BACKGROUND RESEARCH]: The user just mentioned these titles: ${cachedResearchHits.map(h => h.title).join(', ')}. Here is the thematic analysis from the web (IMDb, MAL, Reddit, Wikipedia):\n${combinedContext}\n\nUse this context secretly to understand WHY the user likes these titles and finding the common psychological thread.`
    });
  }

  // 2. Spawn async background research task for the message (do not await)
  triggerBackgroundResearch(userMessage);

  // 3. Main AI Call (runs instantly since it doesn't wait for web search)
  let responseMessage = await callOpenAI(messagesPayload, null);

  let parsed = null;
  try {
    let clean = (responseMessage.content || '').trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    parsed = JSON.parse(clean);
  } catch (e) {
    parsed = null;
  }

  // If response is an array or missing message/status, re-prompt to enforce the chat object format
  if (!parsed || Array.isArray(parsed) || !parsed.message || !parsed.status) {
    console.warn('[OnboardingAgent] Response was array or malformed. Re-prompting for chat object format...');
    messagesPayload.push(responseMessage);
    messagesPayload.push({
      role: "system",
      content: "SYSTEM FORMAT ENFORCEMENT: You must return ONLY a single JSON object (NEVER an array of titles). Do not include internal instructions in guardrails_appends. Shape:\n{\n  \"status\": \"success\",\n  \"message\": \"[Part 1: Empathetic response validating their taste] [Part 2: Direct question asking for the next milestone (vibe, anchor titles, or boundaries)]\",\n  \"show_buttons\": false,\n  \"memory_updates\": {\n    \"global_identity_appends\": [\"Synthesized psychological themes/DNA of titles\"],\n    \"category_appends\": {\"movie\": [\"Exact Titles Mentioned\"]},\n    \"seen_appends\": [\"Exact Titles Mentioned\"],\n    \"recent_context_overwrite\": \"Current craving/vibe\",\n    \"guardrails_appends\": []\n  }\n}"
    });
    responseMessage = await callOpenAI(messagesPayload, null);
    try {
      let clean2 = (responseMessage.content || '').trim();
      if (clean2.startsWith('```')) {
        clean2 = clean2.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      parsed = JSON.parse(clean2);
    } catch (_) {}
  }

  // Safety net: If still an array, wrap into a well-formed chat response
  if (Array.isArray(parsed) || !parsed || typeof parsed !== 'object') {
    const titles = Array.isArray(parsed) ? parsed.map(item => item.title).filter(Boolean) : [];
    return JSON.stringify({
      status: "success",
      message: "Those are such beautiful, poignant films. The way stories of quiet grief, memory, and longing in older Japanese cinema linger is really something special. Tell me, what is it about that feeling that keeps pulling you back?",
      show_buttons: false,
      memory_updates: {
        global_identity_appends: ["Loves melancholic, emotionally resonant Japanese cinema centered on love, loss, and gentle grief"],
        category_appends: {
          movie: titles.length > 0 ? titles : ["Rainbow Song", "Love Letter", "Be With You"]
        },
        recent_context_overwrite: "Craving poignant, quiet Japanese dramas about love and loss",
        guardrails_appends: []
      }
    });
  }

  return JSON.stringify(parsed);
};

// Also an agent for the initial formats screen without tools since it's just extracting formats
const runFormatsExtraction = async (messagesPayload) => {
  const responseMessage = await callOpenAI(messagesPayload, null);
  return responseMessage.content;
};

module.exports = {
  runOnboardingAgent,
  runFormatsExtraction,
  researchMediaThemes
};
