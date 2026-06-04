const https = require('https');
const { researchMediaThemes } = require('./onboardingAgent');
const loggerService = require('./loggerService');


const callOpenAI = (messages, responseFormat = null) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return reject(new Error("Missing OPENAI_API_KEY"));

    const payload = {
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.4, // increased from 0.2 to 0.4 for diverse recommendations
    };
    
    if (responseFormat) {
      payload.response_format = responseFormat;
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
          resolve(json.choices[0].message.content);
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

const normalizeMediaType = (type) => {
  if (!type) return 'anime';
  const t = type.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (t === 'anime') return 'anime';
  if (t === 'movie' || t === 'movies') return 'movie';
  if (t === 'tv' || t === 'tvshow' || t === 'tvshows' || t === 'tv show' || t === 'tv shows') return 'tv';
  if (t === 'visualnovel' || t === 'visual novel' || t === 'visualnovels' || t === 'visual novels') return 'visual novel';
  if (t === 'manga') return 'manga';
  if (t === 'book' || t === 'books') return 'book';
  if (t === 'game' || t === 'games') return 'game';
  if (t === 'youtube') return 'youtube';
  if (t === 'music') return 'music';
  return type;
};

const synthesizeAndRoute = async (payload) => {
  const requestedMediaType = normalizeMediaType(payload.requested_media_type);

  const systemPrompt = `
You are the Coda Recommendation Router. 
You will be given a user's Taste Profile (core identity, recent context, and guardrails) and local context (time, weather).
Your job is to:
1. Synthesize this into a highly specific Master Directive.
2. Determine the "media_type" (which MUST be EXACTLY "${requestedMediaType}").
3. Generate an array of 2-3 web search queries to find human-vetted recommendations.
4. If the media_type is "anime", extract up to 2 specific favorite anime titles that they love from their profile in "mal_anime_titles" ONLY if they directly align with the user's current request/craving in "recent_context". If no specific favorite anime titles in their profile are relevant to the current request, set "mal_anime_titles" to an empty array [].

**CRITICAL MEDIA FORMAT ALIGNMENT:**
- The requested media format is strictly: "${requestedMediaType}".
- You MUST force the output "media_type" to be EXACTLY "${requestedMediaType}".
- You MUST ignore any active cravings, references, or context in "recent_context" that pertain to other media formats. If the requested format is "${requestedMediaType}", do not generate queries or recommendations for other types. If the user was recently looking for something else (e.g. visual novels) but the current requested format is "${requestedMediaType}" (e.g. anime), ignore the visual novel context completely.

**SCENARIO A / SCENARIO B LOGIC:**
Read the "core_identity" field, which contains general temperament and a section like "Specific Tastes in <Media Format Label>: <tastes>".
- **Scenario A (Active Category is Empty)**: If the Specific Tastes section for the requested media type is "None" or empty, this is Scenario A. You MUST map the user's global identity traits (personality, age group, emotional triggers, preferred vibes/themes) to project recommendations onto the requested format "${requestedMediaType}". Make queries that would fit their temperament in "${requestedMediaType}".
- **Scenario B (Active Category is Populated)**: If the Specific Tastes section for the requested media type has actual preferences (not "None"), this is Scenario B. You must combine their global profile, specific category tastes, and any cross-media thematic connections to generate highly specific search queries.

**UNRESTRICTED MATURE CONTENT CURATION:**
- Coda does NOT censor, filter, or restrict mature content (eroge, 18+ romance, gore, psychological horror, etc.).
- If the user's profile, request, or history indicates interest in mature, adult, or extreme content (e.g., "eroge", "gore", "R18 visual novels", "mature romance"), you MUST fully embrace and respect this.
- Generate search queries using the exact mature keywords requested/implied (e.g., "eroge site:vndb.org slow-burn romance", "psychological gore anime site:reddit.com/r/animesuggest") to ensure we find accurate and appropriate mature titles rather than generic safe-for-work alternatives.

**CRITICAL SEARCH GUIDELINES:**
- **RECENT CONTEXT IS THE ACTIVE SEARCH TARGET:** If the user's "recent_context" has a craving matching the requested media type, it must guide the search.
- **DYNAMIC SEARCH ROTATION:** Search queries must target the specific vibe/themes requested. Avoid using generic search queries or the same queries every time.
- **SITE-SPECIFIC CONSTRAINTS ARE MANDATORY:** All generated search queries MUST use site-specific constraints:
  - For "visual novel": use site constraints like \`site:vndb.org\` or \`site:reddit.com/r/visualnovels\`.
  - For "anime": use \`site:reddit.com/r/animesuggest\` or \`site:reddit.com/r/anime\`.
  - For "movie": use \`site:reddit.com/r/MovieSuggestions\` or \`site:letterboxd.com\`.
  - For "book": use \`site:reddit.com/r/suggestmeabook\` or \`site:goodreads.com\`.
  - For other formats, use their respective community sites.
- **NO BRAND POLLUTION:** The standalone word "deep" is strictly forbidden in all queries. Use terms like "profound", "existential", "intricate", or "emotional depth".

Respond ONLY with a JSON object:
{
  "media_type": "${requestedMediaType}",
  "search_queries": ["query1", "query2"],
  "master_directive": "A 2-sentence summary of exactly what to look for and why.",
  "mal_anime_titles": ["title1", "title2"]
}
`;

  const userPrompt = JSON.stringify(payload, null, 2);

  const responseJson = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { type: 'json_object' });

  return JSON.parse(responseJson);
};

const scoreAndPitch = async (directive, scrapedSnippets, guardrails) => {
  const systemPrompt = `
You are Coda, an expert curator.
You have the Master Directive for this user: "${directive}"
And their strict guardrails: "${JSON.stringify(guardrails)}"

Here are raw snippets scraped from the web:
${JSON.stringify(scrapedSnippets)}

Your job:
1. Instantly disqualify any candidate that violates the guardrails.
2. From the remaining candidates, pick the #1 absolute best match for the user's current vibe.
3. Write a short, highly personalized "coda_blurb" (1 sentence) that acts as a hero text (e.g. "This is the one", "You'll definitely like this one", "I thought of you when...").
4. Write a longer, highly personalized "pitch_paragraphs" array (2-3 paragraphs) explaining why you picked it, referencing what real people said about it online. Talk like a normal friend.

**UNRESTRICTED MATURE CONTENT:**
- Do not censor, filter, or avoid mature content (e.g. eroge, adult visual novels, gore, 18+ themes) if it matches the user's directive/tastes.
- Openly pitch and describe mature elements of the picked media (e.g. adult romance dynamics, psychological horror/gore) without hesitation or self-censorship, as a mature companion would.

CRITICAL RULE: The "title" MUST be the exact name of the specific individual work (e.g., "Never Let Me Go", "Inception", "Katawa Shoujo"). 
- NEVER use compilation titles, article titles, listicle titles (e.g., "10 Deep Character Studies...", "Top 5 Sci-fi Movies", "Best anime to watch"), or forum thread titles as the title. 
- If a snippet represents a listicle or discussion thread, you MUST look INSIDE the text content of that snippet, identify the specific individual works recommended/discussed within it, and pick ONE of those specific works as your recommendation.
- Disqualify any title containing list numbers (e.g., "10...", "5..."), compilation words (e.g., "List", "Top", "Best", "Recommendations", "Similar", "Thread", "Movies like"), or punctuation like colons used for subtitles of lists.
- Discard any candidates that do not represent a specific single piece of media.

Respond ONLY with a JSON object:
{
  "title": "Exact Title of the Pick",
  "coda_blurb": "Your punchy hero text here.",
  "pitch_paragraphs": [
    "First paragraph explaining the pick like a friend.",
    "Second paragraph referencing community thoughts or why it fits perfectly."
  ]
}
`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt }
  ], { type: "json_object" });

  return JSON.parse(response);
};

const getCategoryKey = (tab) => {
  const t = tab.toLowerCase();
  if (t === 'you') return null;
  if (t === 'anime') return 'anime';
  if (t === 'movies') return 'movies';
  if (t === 'tv shows') return 'tv_shows';
  if (t === 'visual novels') return 'visual_novels';
  if (t === 'books') return 'books';
  if (t === 'games') return 'games';
  return t.replace(' ', '_');
};

const harmonizeMemory = async (chatHistory, currentMemory, tabName) => {
  const categoryKey = getCategoryKey(tabName);
  const categoryInstruction = categoryKey
    ? `5. In "category_profiles_overwrite", output a completely cleaned, compressed, and deduplicated list of tastes ONLY for the category "${categoryKey}". Combine similar statements (e.g. merge "Loves Steins;Gate" and "Loves Steins;Gate for romance" into "Loves Steins;Gate for its romance and psychological depth") and remove all redundancy.`
    : `5. Do NOT output a "category_profiles_overwrite" object since this is the global "You" tab.`;

  const categoryExample = categoryKey
    ? `"category_profiles_overwrite": { "${categoryKey}": ["Clean, compressed preference statement 1", "Clean, compressed preference statement 2"] },`
    : ``;

  const systemPrompt = `
You are the Coda Memory Synthesizer.
Your job is to read the user's latest conversation in the "${tabName}" category and their current 'Living Memory', then produce a CLEAN, OVERWRITTEN, deduplicated profile.

CURRENT MEMORY (may be bloated/repetitive):
${JSON.stringify(currentMemory)}

RULES — CRITICALLY IMPORTANT:
1. OUTPUT is an OVERWRITE, not an append. You are REPLACING the old profile with a better one.
2. Consolidate ALL repetitive points. If a favorite title or preference appears multiple times, write it ONCE in a clean, precise form. Do this for BOTH the global identity list and the category-specific profiles.
3. Connect the dots. From the media they love, deduce:
   - What type of person are they? (e.g. "An introspective thinker seeking cathartic resolution through character-driven dramas.")
   - What do they value? (e.g. "Values narrative stakes, deep characters with trauma, and stories that leave a lasting emotional impact.")
   - Cross-media connections: "Bridges their love of Steins;Gate and Interstellar through a fascination with emotional sci-fi where characters bend time/space for love."
4. The "global_identity_overwrite" should be 2-4 clean, deeply insightful sentences — no bullet soup.
${categoryInstruction}
6. Keep "recent_context_overwrite" tightly focused on what they want RIGHT NOW.

Respond ONLY with a JSON object:
{
  "global_identity_overwrite": ["Clean unified 2-4 sentence portrait of who this person is."],
  ${categoryExample}
  "recent_context_overwrite": "What they are actively looking for right now.",
  "guardrails_appends": ["Only new guardrails not already listed."],
  "thematic_connections_appends": ["Only new cross-media connections discovered this session."]
}
  `;

  const messagesPayload = [
    { role: 'system', content: systemPrompt }
  ];

  if (chatHistory && Array.isArray(chatHistory)) {
    chatHistory.forEach(msg => {
      messagesPayload.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      });
    });
  }

  const response = await callOpenAI(messagesPayload, { type: "json_object" });
  return JSON.parse(response);
};

const extractTitlesFromMemory = async (currentMemory) => {
  const prompt = `You are a parser. Analyze this user taste profile:
${JSON.stringify(currentMemory)}

Extract all specific titles of media works (movies, TV shows, anime, games, books, manga, visual novels) mentioned as likes, favorites, or watched. Do NOT include broad genres, platforms, or adjectives.
Return ONLY a JSON array of strings containing the titles. If none are found, return an empty array.

Example output:
["Steins;Gate", "Monster", "Naruto"]`;

  try {
    const response = await callOpenAI([
      { role: 'user', content: prompt }
    ], { type: "json_object" });
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.titles && Array.isArray(parsed.titles)) return parsed.titles;
    return [];
  } catch (e) {
    console.error("Failed to extract titles from memory:", e);
    return [];
  }
};

const harmonizeAllMemory = async (currentMemory) => {
  console.log("Starting global harmonization pass...");
  
  // 1. Extract specific media titles user likes
  const titles = await extractTitlesFromMemory(currentMemory);
  console.log("Extracted media titles for harmonization research:", titles);
  
  // Limit to top 5 titles to avoid API / search rate limits
  const titlesToResearch = titles.slice(0, 5);
  let researchContext = "";
  
  if (titlesToResearch.length > 0) {
    console.log(`Researching themes and community feedback for: ${titlesToResearch.join(', ')}`);
    try {
      const researchPromises = titlesToResearch.map(title => researchMediaThemes(title));
      const researchResults = await Promise.all(researchPromises);
      titlesToResearch.forEach((title, idx) => {
        researchContext += `Title: ${title}\nResearch:\n${researchResults[idx]}\n\n---\n\n`;
      });
    } catch (e) {
      console.error("Error researching media themes during harmonization:", e);
    }
  } else {
    researchContext = "No specific favorite titles mentioned yet.";
  }

  const systemPrompt = `
You are the Coda Profile Harmonizer.
Your job is to read the user's entire 'Living Memory' containing their global identity preferences and category-specific taste profiles, along with the background research on the specific media titles they enjoy.
You will perform a global harmonization pass:
1. Decode the person: Who are they as a person? What are the common threads across all the media categories they enjoy? Deduce their likely age group/demographic (e.g. late teens, mid-20s, 30s) and temperament based on their choices and how they talk about them.
2. Connect the dots: Look at the themes, emotional cores, and style of the specific works they love. Find the unifying threads (e.g. drawn to existential questions, complex romantic dynamics, slow-paced character growth, high stakes).
3. Synthesize a clean, 2-paragraph core identity. 
   - First paragraph: Describe who they are, their general temperament, likely age/demographic context, and the psychological needs their media satisfies.
   - Second paragraph: Describe the specific unifying themes, motifs, and narrative styles they seek across different formats. Make it beautiful, cohesive prose (no bullet points or lists).
4. Clean and consolidate the category-specific profiles, outputting them in "category_profiles_overwrite". 
   CRITICAL: Remove all redundancies, word soup, and exact duplicates. Cleanly rewrite each category's list to compress and merge similar-meaning points (e.g., if there are multiple entries like "Loves Steins;Gate" and "Loves Steins;Gate for romance", consolidate them into a single clean statement like "Loves Steins;Gate for its romance and psychological depth").


BACKGROUND RESEARCH ON USER'S FAVORITE MEDIA WORKS:
${researchContext}

INPUT MEMORY:
${JSON.stringify(currentMemory)}

Respond ONLY with a JSON object in this format:
{
  "global_identity_overwrite": [
    "First paragraph describing who they are, their general vibe, personality, likely age group, and underlying psychological traits extracted from their interests.",
    "Second paragraph describing the unifying threads in what they look for in stories, art, and experiences, connecting their various interests."
  ],
  "category_profiles_overwrite": {
    "category_name_1": ["Clean, refined preference statement 1", "Clean, refined preference statement 2"],
    "category_name_2": ["Clean, refined preference statement 1"]
  }
}
`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt }
  ], { type: "json_object" });

  const parsedResponse = JSON.parse(response);

  // Log the global harmonization pass
  loggerService.logHarmonization({
    type: 'Global',
    tabName: null,
    inputMemory: currentMemory || {},
    researchContext: researchContext,
    outputMemory: parsedResponse
  });

  return parsedResponse;
};

module.exports = {
  synthesizeAndRoute,
  scoreAndPitch,
  harmonizeMemory,
  harmonizeAllMemory
};
