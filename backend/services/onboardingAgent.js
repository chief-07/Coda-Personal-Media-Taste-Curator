const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WIKI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CodaApp/2.0 (contact@mycodaapp.net; personal project)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

// Helper to call OpenAI with tools
const callOpenAI = (messages, tools) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return reject(new Error("Missing OPENAI_API_KEY"));

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

    const bodyData = JSON.stringify(payload);

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(bodyData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`OpenAI Error: ${data}`));
        try {
          const json = JSON.parse(data);
          resolve(json.choices[0].message);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(bodyData);
    req.end();
  });
};

const researchMediaThemes = async (query) => {
  let wikiSummary = "";
  let communityThemes = "";

  // 1. Wikipedia: Search for the right page first, then fetch the extract
  try {
    // Step 1a: Use the search API to find the correct page title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`;
    const searchRes = await axios.get(searchUrl, {
      headers: WIKI_HEADERS,
      timeout: 8000
    });
    const searchResults = searchRes.data?.query?.search;

    if (searchResults && searchResults.length > 0) {
      const pageTitle = searchResults[0].title;
      console.log(`[Research] Wikipedia found page: "${pageTitle}" for query: "${query}"`);

      // Step 1b: Fetch the intro extract for that page
      const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&redirects=1&format=json`;
      const extractRes = await axios.get(extractUrl, {
        headers: WIKI_HEADERS,
        timeout: 8000
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

  // 2. Community themes: Try DuckDuckGo, fallback to Bing
  const communityQuery = `${query} themes analysis reddit`;
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(communityQuery)}`;
    const ddgRes = await axios.get(ddgUrl, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      timeout: 15000
    });
    const $ = cheerio.load(ddgRes.data);
    const snippets = [];
    $('.result__snippet').slice(0, 4).each((i, el) => {
      snippets.push($(el).text().trim());
    });
    if (snippets.length > 0) {
      communityThemes = snippets.join('\n');
      console.log(`[Research] DDG returned ${snippets.length} community snippets for: "${query}"`);
    } else {
      console.warn(`[Research] DDG returned 0 snippets for: "${communityQuery}". Trying Bing fallback...`);
      throw new Error('DDG returned no snippets');
    }
  } catch (e) {
    // Bing fallback
    try {
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(communityQuery)}`;
      const bingRes = await axios.get(bingUrl, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        timeout: 15000
      });
      const $ = cheerio.load(bingRes.data);
      const snippets = [];
      $('.b_algo').slice(0, 4).each((i, el) => {
        const text = $(el).find('.b_caption p').text().trim() || $(el).find('.b_algoSlug').text().trim();
        if (text) snippets.push(text);
      });
      communityThemes = snippets.join('\n');
      console.log(`[Research] Bing fallback returned ${snippets.length} community snippets for: "${query}"`);
    } catch (e2) {
      console.error(`[Research] Both DDG and Bing failed for community themes of "${query}":`, e2.message);
    }
  }

  return `Wikipedia Summary:\n${wikiSummary || '(not found)'}\n\nCommunity Themes:\n${communityThemes || '(not found)'}`;
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

const runOnboardingAgent = async (messagesPayload) => {
  // Extract user message (the last one)
  const userMessage = messagesPayload[messagesPayload.length - 1].content;
  
  // 1. Aggressive Entity Extraction
  const titles = await runTitleExtractor(userMessage);
  
  if (titles.length > 0) {
    console.log(`[Agent] Aggressive Search Triggered for:`, titles);
    // 2. Search Wikipedia and DDG for the titles
    const searchPromises = titles.map(title => researchMediaThemes(title));
    const searchResults = await Promise.all(searchPromises);
    
    // 3. Inject the context silently before Coda replies
    const combinedContext = searchResults.join('\n\n---\n\n');
    messagesPayload.splice(messagesPayload.length - 1, 0, {
      role: 'system',
      content: `[BACKGROUND RESEARCH]: The user just mentioned these titles: ${titles.join(', ')}. Here is the thematic analysis from the web (IMDb, MAL, Reddit, Wikipedia):\n${combinedContext}\n\nUse this context secretly to understand WHY the user likes these titles and finding the common psychological thread.`
    });
  }

  // 4. Main AI Call (no tools needed since we pre-searched)
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
