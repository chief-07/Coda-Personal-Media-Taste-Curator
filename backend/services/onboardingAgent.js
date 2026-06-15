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

// Helper to call OpenAI with tools
const callOpenAI = async (messages, tools, retries = 2) => {
  const executeCall = async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const payload = {
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.0,
    };
    
    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    } else {
      payload.response_format = { type: 'json_object' };
    }

    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 60000
    });

    return response.data.choices[0].message;
  };

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await executeCall();
    } catch (e) {
      const errorCode = e.code || (e.response && e.response.status) || 'unknown';
      const isNetworkError = 
        e.code === 'ENOTFOUND' || 
        e.code === 'ETIMEDOUT' || 
        e.code === 'ECONNRESET' || 
        e.code === 'EPIPE' || 
        e.message?.includes('timeout') || 
        (e.response && e.response.status >= 500);

      if (attempt > retries || !isNetworkError) {
        throw e;
      }
      console.warn(`[OpenAI Chat] Attempt ${attempt} failed with error ${errorCode}. Retrying in 1s...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
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
          if (!themeResearchCache.has(normalizedTitle)) {
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

  // Ensure JSON formatting
  try {
    JSON.parse(responseMessage.content);
  } catch (e) {
    messagesPayload.push(responseMessage);
    messagesPayload.push({
      role: "user",
      content: "Format your previous response as a JSON object according to the instructions."
    });
    responseMessage = await callOpenAI(messagesPayload, null);
  }

  return responseMessage.content;
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
