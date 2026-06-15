const axios = require('axios');
const { researchMediaThemes } = require('./onboardingAgent');
const loggerService = require('./loggerService');
const searchService = require('./searchService');


const callOpenAI = async (messages, responseFormat = null, modelOverride = null, retries = 2) => {
  const executeCall = async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const payload = {
      model: modelOverride || 'gpt-4o-mini',
      messages: messages,
      temperature: 0.4, // increased from 0.2 to 0.4 for diverse recommendations
    };
    
    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 60000 // 60 seconds timeout
    });

    return response.data.choices[0].message.content;
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
      console.warn(`[OpenAI Call] Attempt ${attempt} failed with error ${errorCode}. Retrying in 1s...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
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
3. Analyze the user's taste profile for distinct genres, tones, eras, pacing, or narrative styles (e.g. comedies vs. dark dramas, retro vs. modern, short vs. long).
   To ensure variety and capture the whole person, identify the main taste facets/genres in their profile and intentionally select *one* specific facet or genre angle to focus on for this run (e.g. "School Comedy" or "Existential Sci-fi"). Output this as "selected_vibe_focus".
4. Generate an array of exactly 5 distinct, highly targeted web search queries to find human-vetted recommendations matching the "selected_vibe_focus".
5. Extract up to 2 specific favorite or loved works as generalized "seed_titles" from the Taste Profile, seen list, or watchlist that align with the requested media type "${requestedMediaType}".
6. Perform cross-media taste inference. Analyze the user's entire taste profile across all media categories (e.g. if they love anime and visual novels, deduce that they are highly interested in Japanese media and narratives) and use these insights dynamically to influence search queries or the selected vibe focus for the active requested media type.

**WATCHLIST SEEDING (CRITICAL):**
- If the payload contains a "watchlist_seed_title", you MUST use this title as the primary seed for your recommendation queries. 
- At least 3 of your 5 search queries MUST be seed-based queries asking for recommendations similar to the "watchlist_seed_title" (e.g., "movies similar to [watchlist_seed_title] site:reddit.com/r/MovieSuggestions").
- Your Master Directive MUST focus on finding works similar to this watchlist seed.

**LOVED SEEDING (CRITICAL):**
- If the payload contains a "loved_seed_title", you MUST use this title as the primary seed for your recommendation queries. 
- At least 3 of your 5 search queries MUST be seed-based queries asking for recommendations similar to the "loved_seed_title" (e.g., "anime similar to [loved_seed_title] site:reddit.com/r/animesuggest" or "just finished [loved_seed_title] what next site:reddit.com/r/animesuggest").
- Your Master Directive MUST focus on finding works similar to this loved seed.
- If "loved_seed_title" is present, do NOT use any other seed title as the primary focus, only the "loved_seed_title".

**LOVED AND FAVORITE WORKS (CRITICAL):**
- The payload contains a "loved_titles" array listing works the user explicitly swiped right / loved in the past.
- You MUST prioritize using titles from this "loved_titles" array for your seed-based queries (Seed-Based Query 1 and 2), rather than guessing from the text profile or seen list.

**SKIP RANDOM SEEDS (CRITICAL):**
- If the payload contains "skip_random_seeds": true, you MUST NOT generate any seed-based queries. You MUST ignore any watchlist seeds, loved seeds, and loved titles.
- Instead, generate all 5 search queries as discovery queries that target the specific vibe, themes, or immediate craving described in "recent_context" (and "ask_research_context" if present).
- Your Master Directive and selected vibe focus MUST focus entirely on the immediate craving / "recent_context", not on any historical favorites.

**ASK CODA RESEARCH CONTEXT (CRITICAL):**
- If the payload contains an "ask_research_context" string (which has Wikipedia and forum summaries of the works the user explicitly mentioned in their request), you MUST read and analyze it carefully.
- Decode and identify:
  1. What makes these works unique? Is there a specific animation style (e.g. experimental direction), director traits (e.g. Akiyuki Shinbo), studio style (e.g. Studio Shaft's signature surreal framing), narrative pacing, or musical lining?
  2. The underlying thematic or atmospheric qualities that connect them (e.g. Hikikomori anxiety, psychological distress, tragic romance, surreal/eerie atmosphere).
- You MUST use these decoded themes, styles, studios, or directors as the primary driver for your recommendation routing. Bake these characteristics directly into your "selected_vibe_focus", Master Directive, and at least 3 of your 5 search queries (e.g. "experimental anime by Shaft", "surreal psychological anime with existential dread").
- Do NOT just copy the names of the titles themselves. Dig deeper into the commonalities shown in the research context.
- Use the user's historical profile ("core_identity") only as a subtle touch to align tone, but prioritize the immediate craving and research context insights above all else.


**SEARCH QUERY CRITERIA (STRICT 3+2 SPLIT):**
- You MUST generate exactly 5 search queries.
- Structure of the 5 queries:
  1. Discovery Query 1 (Vibe Focus Alignment): Match the "selected_vibe_focus" (genres, tone, styling) in "${requestedMediaType}" (e.g., "existential sci-fi anime").
  2. Discovery Query 2 (Structural/Narrative & Length/Era): Match preferred structures, length, era, character types, or atmospheric themes from the profile (e.g., "90s slow-burn space anime with complex characters").
  3. Discovery Query 3 (Global Profile Alignment): Project overall personality traits or demographic profile to find deep, character-driven recommendations.
  4. Seed-Based Query 1 (Loved/Favorite Work): Identify a specific work the user loves/watchlist/seen in the active media type. Generate a conversational query simulating a community recommendation request: e.g., 'just finished [Title] what next site:reddit.com/r/animesuggest' or 'anime similar to [Title] site:reddit.com/r/animesuggest'.
  5. Seed-Based Query 2 (Loved/Favorite Work): Identify a different title. Generate a conversational query simulating another community angle: e.g., '[Title] was peak what else site:reddit.com/r/animesuggest' or 'shows like [Title] with great characters site:reddit.com/r/animesuggest'.
- If NO favorite or loved works are found in the Taste Profile or seen list for the requested media type, fallback to generating 5 Discovery queries.
- Adjust the community subreddits/sites in the queries based on the media type (e.g. 'site:reddit.com/r/animesuggest' or 'site:anime-planet.com/anime' for anime, 'site:reddit.com/r/MovieSuggestions' for movies, 'site:reddit.com/r/suggestmeabook' for books, 'site:reddit.com/r/gamingsuggestions' for games).
- For anime, you MUST target Anime-Planet for at least 1 or 2 of the 5 queries using the constraint 'site:anime-planet.com/anime'. These queries MUST be strictly seed-based (e.g., 'anime similar to [Title] site:anime-planet.com/anime' or 'site:anime-planet.com/anime/[title-slug]/recommendations') using titles the user likes/loves, rather than general discovery queries, because Anime-Planet's most valuable user-voted recommendations are tied to specific starting titles.

**VISUAL NOVEL SEARCH QUERY RULES (CRITICAL):**
- When media_type is "visual novel", search engines block "site:reddit.com/r/visualnovels" (specific subreddit) — use "site:reddit.com" (top-level) instead, which works. Add the word "visualnovels" or "r/visualnovels" as a keyword in the query, NOT as a site: constraint.
- Target Reddit recommendation threads that name actual VN titles:
  - For Seed-Based Queries, use: 'just finished [Title] visual novel what next site:reddit.com' or 'visual novels like [Title] r/visualnovels site:reddit.com'.
  - For Discovery Queries, use: 'emotional romance eroge visual novels multiple routes site:reddit.com', 'best nakige visual novels r/visualnovels site:reddit.com', 'android eroge visual novel recommendations r/visualnovels site:reddit.com'.
  - Lean into specific VN community terms: nakige, utsuge, charage, moege, eroge, nukige — use whichever apply to this user's profile.
- One query may use "site:vndb.org" with a specific known title for reference (e.g. "Katawa Shoujo site:vndb.org").
- Do NOT use "site:reddit.com/r/visualnovels" — this subreddit-specific constraint returns 0 results.

**CRITICAL MEDIA FORMAT ALIGNMENT:**
- The requested media format is strictly: "${requestedMediaType}".
- You MUST force the output "media_type" to be EXACTLY "${requestedMediaType}".
- You MUST ignore any active cravings, references, or context in "recent_context" that pertain to other media formats. If the requested format is "${requestedMediaType}", do not generate queries or recommendations for other types. If the user was recently looking for something else (e.g. visual novels) but the current requested format is "${requestedMediaType}" (e.g. anime), ignore the visual novel context completely.

**SCENARIO A / SCENARIO B LOGIC:**
- Read the "core_identity" field, which contains general temperament and a section like "Specific Tastes in <Media Format Label>: <tastes>".
- **Scenario A (Active Category is Empty)**: If the Specific Tastes section for the requested media type is "None" or empty, this is Scenario A. You MUST map the user's global identity traits (personality, age group, emotional triggers, preferred vibes/themes) to project recommendations onto the requested format "${requestedMediaType}". Make queries that would fit their temperament in "${requestedMediaType}".
- **Scenario B (Active Category is Populated)**: If the Specific Tastes section for the requested media type has actual preferences (not "None"), this is Scenario B. You must combine their global profile, specific category tastes, and any cross-media thematic connections to generate highly specific search queries.

**CROSS-MEDIA INFERENCE & TASTE DEDUCTION (CRITICAL):**
- You MUST analyze the user's entire Taste Profile (including their favorite genres, themes, and works across ALL media types, not just the active requested one).
- Perform high-level deductions about their deep taste profile. For example: if their profile shows a strong preference for anime and visual novels, or mentions specific Japanese creators/franchises/settings, deduce that they have a strong interest in Japanese media, culture, storytelling styles, and tropes.
- Apply these deductions dynamically to other media recommendations when appropriate. For example, if they request a book and you've deduced they love Japanese media (from their anime/VN lists), steer a subset of the queries or the vibe focus towards translated Japanese literature, Japanese mystery novels (e.g., Keigo Higashino), or books with a similar narrative flavor (like Haruki Murakami), without completely locking them into it. Keep the steering dynamic and organic.

**UNRESTRICTED MATURE CONTENT CURATION:**
- Coda does NOT censor, filter, or restrict mature content (eroge, 18+ romance, gore, psychological horror, etc.).
- If the user's profile, request, or history indicates interest in mature, adult, or extreme content (e.g., "eroge", "gore", "R18 visual novels", "mature romance"), you MUST fully embrace and respect this.
- Generate search queries using the exact mature keywords requested/implied (e.g., "eroge site:vndb.org slow-burn romance", "psychological gore anime site:reddit.com/r/animesuggest") to ensure we find accurate and appropriate mature titles rather than generic safe-for-work alternatives.

**CRITICAL SEARCH GUIDELINES:**
- **PRIORITIZE RECENT CONTEXT / IMMEDIATE CRAVING:** The user's "recent_context" represents their active, immediate craving. You MUST prioritize the themes, genres, and style of the "recent_context" over the historical "core_identity". The "core_identity" should only be used to filter the tone or select the specific flavor of the recommendation, never to override or dilute the explicit genres/themes requested in "recent_context". For example, if the user asks for a "dark serious existential film", do not recommend a standard lighthearted romance/slice-of-life film even if romance/slice-of-life is their favorite genre historically.
- **DYNAMIC SEARCH ROTATION:** Search queries must target the specific vibe/themes requested. Avoid using generic search queries or the same queries every time.
- **SITE-SPECIFIC CONSTRAINTS ARE MANDATORY:** All generated search queries MUST use site-specific constraints:
  - For "visual novel": use "site:reddit.com" (NOT "site:reddit.com/r/visualnovels") and include the word "r/visualnovels" or "visual novel" in the query body (DDG blocks subreddit-specific site: constraints).
  - For "anime": use "site:reddit.com/r/animesuggest", "site:reddit.com/r/anime", or "site:anime-planet.com/anime". For anime queries, you MUST generate at least 1 (and up to 2) queries targeting "site:anime-planet.com/anime" (e.g., "anime similar to [Title] site:anime-planet.com/anime" or "site:anime-planet.com/anime/[title-slug]/recommendations"). These Anime-Planet queries MUST be seed-based (similar to titles the user loves/likes), never general discovery queries.
  - For "movie": use "site:reddit.com/r/MovieSuggestions" or "site:letterboxd.com".
  - For "book": use "site:reddit.com/r/books", "site:reddit.com/r/suggestmeabook", "site:reddit.com/r/Fantasy", "site:reddit.com/r/literature", or "site:goodreads.com". Do NOT limit yourself only to r/suggestmeabook. Rotate these targets to get different perspectives.
  - For other formats, use their respective community sites.
- **BAKE HARD CONSTRAINTS INTO QUERIES (CRITICAL):** If the input payload contains any "hard_constraints" or platform/content guardrails (e.g., "Android only", "web browser", "eroge"), you MUST explicitly bake/weave these keyword constraints directly into ALL 5 generated search queries. Examples: "android eroge nakige r/visualnovels site:reddit.com" or "romance visual novels for android site:reddit.com". Do not emit generic queries that lack these constraint keywords.
- **NO BRAND POLLUTION:** The standalone word "deep" is strictly forbidden in all queries. Use terms like "profound", "existential", "intricate", or "emotional depth".

**ROTATION AND RETRY (CRITICAL):**
- If the payload contains "force_rotation": true, it means a previous search attempt failed to find new unseen titles.
- You MUST ignore the current "recent_context" or immediate craving, and instead rotate your vibe focus to a completely different, older, nostalgic, or less-represented taste/genre facet in their profile.
- You MUST generate 5 completely different queries that do not overlap with typical recommendations for their most recent likes.
- In "selected_vibe_focus", clearly describe the new rotated direction you are targeting.

**NEGATIVE QUERY KEYWORDS (CRITICAL):**
- Read the "guardrails" field carefully for content restriction signals. Based on the signals present, you MUST append negative exclusion keywords to ALL 5 search queries to prevent inappropriate content from surfacing.
- If guardrails contain ANY of the following signals, append the corresponding negative keyword suffixes to EVERY query:
  - "christian" / "religious" / "faith-based" / "wholesome" / "family-friendly" / "clean content" / "no adult" / "no explicit" / "no 18+" / "no mature content" → append: `-erotic -eroge -adult -"18+" -hentai -explicit -nsfw`
  - "no gore" / "no violence" / "no guro" / "no blood" → append: `-gore -guro -"graphic violence"`
  - "no horror" / "avoid horror" → append: `-horror -"survival horror"`
  - "no ntr" / "no netorare" → append: `-ntr -netorare`
  - "no bl" / "no yaoi" → append: `-yaoi -"boys love"`
  - "no gl" / "no yuri" → append: `-yuri -"girls love"`
- IMPORTANT: Append these negative terms naturally at the END of each query string so they don't break site: constraints. Example: wholesome anime romance site:reddit.com/r/animesuggest -ecchi -hentai -18+.
- If NO content restriction signals are present in the guardrails, do NOT append any negative keywords.


Respond ONLY with a JSON object:
{
  "media_type": "${requestedMediaType}",
  "selected_vibe_focus": "Specific vibe/genre facet selected for this run",
  "search_queries": ["query1", "query2", "query3", "query4", "query5"],
  "master_directive": "A 2-sentence summary of exactly what to look for and why.",
  "seed_titles": ["title1", "title2"]
}
`;

  const userPrompt = JSON.stringify(payload, null, 2);

  const responseJson = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { type: 'json_object' });

  return JSON.parse(responseJson);
};

const extractCandidateTitles = async (scrapedSnippets, mediaType) => {
  const systemPrompt = `
You are the Coda Candidate Extractor.
Your job is to read raw web search snippets and extract a list of specific individual media titles (e.g. "Steins;Gate", "Link Click", "Interstellar") discussed or recommended in them.
- The media format of the titles MUST match: "${mediaType}".
- Do NOT include generic terms, compilation names, site names (like Reddit, Anime-Planet, etc.), or list titles.
- Extract up to 8 distinct candidate titles.
- Ignore any titles that represent compilation lists or forum threads themselves.
- Disqualify any titles that contain list numbers or compilation words.

Here are the raw snippets:
${JSON.stringify(scrapedSnippets)}

Respond ONLY with a JSON object:
{
  "candidates": ["Title 1", "Title 2", "Title 3", ...]
}
`;
  try {
    const responseJson = await callOpenAI([
      { role: 'system', content: systemPrompt }
    ], { type: 'json_object' });
    const parsed = JSON.parse(responseJson);
    return parsed.candidates || [];
  } catch (e) {
    console.error("[Candidate Extraction Error]:", e.message);
    return [];
  }
};

const scoreAndSelect = async (directive, candidatesWithMetadata, guardrails, seen = [], notForMe = [], directWatchlistTitle = null) => {
  let watchlistInstruction = "";
  let blurbInstruction = `Write a very short, friendly, and highly subjective "coda_blurb" (maximum 8-12 words) talking directly to the user (your friend) from your own perspective as someone who has personally watched/read/played this work and knows them inside out.
   - It MUST take into account Coda as a "self" who has consumed the recommendation, the user as your close friend, and the specific narrative/character details.
   - Frame it as a personal, subjective guarantee or prediction about how they will react or feel (e.g., "Trust me, Okabe will be your favorite character by the end." or "I promise this ending will have you crying like a baby.").
   - Do not make it look like a generic summary. Make it a personal conviction.`;

  if (directWatchlistTitle) {
    watchlistInstruction = `
CRITICAL NOTE: You are recommending "${directWatchlistTitle}" directly from the user's watchlist!
The candidate list contains this exact title. You MUST select "${directWatchlistTitle}" as the pick.
`;
  }

  const systemPrompt = `
You are Coda, an expert curator.
You have the Master Directive for this user: "${directive}"
And their strict guardrails: "${JSON.stringify(guardrails)}"
And the works they have ALREADY watched, played, or seen (do NOT recommend these): "${JSON.stringify(seen)}"
And the works they have explicitly rejected as "not for me" (do NOT recommend these): "${JSON.stringify(notForMe)}"
${watchlistInstruction}

Here are candidates with their VERIFIED metadata (genres, tags, description) and related snippets:
${JSON.stringify(candidatesWithMetadata)}

Your job:
1. Instantly disqualify any candidate that:
   - Violates the guardrails (this includes platform constraints like "Android only", "web browser", or content restrictions like "eroge"). You MUST NOT recommend a title that doesn't meet these strict requirements.
   - Is in the list of already watched/played/seen works (e.g. you must NOT recommend any title in "${JSON.stringify(seen)}").
   - Is in the list of rejected "not for me" works (you must NOT recommend any title in "${JSON.stringify(notForMe)}").
   - Note: Disqualify the work under any alternative titles, aliases, or localized names.
2. From the remaining candidates, pick the #1 absolute best match for the user's current vibe.
3. ${blurbInstruction}
   - BANNED WORDS/PHRASES: Do NOT use terms like "resonate", "emotional depth", "aligns", "complexities", "character-driven", "narrative", "themes", "profound", "vibe", "craving", "crave", "temperament".
   - BANNED CLICHÉS: Do NOT use generic templates or cold descriptions. Specifically, do NOT use: "Dive into", "This is the one", "Get ready for", "This will make you", "A must-watch", "Looking for", "Experience a", "Prepare to", "If you want", "A masterpiece of", "A journey". Keep it completely organic and conversational (like a text message).

CRITICAL RULE: The "title" MUST be the exact name of the specific individual work (e.g., "Never Let Me Go", "Inception", "Katawa Shoujo"). 
- NEVER use compilation titles, article titles, listicle titles, or forum thread titles as the title. 
- Disqualify any title containing list numbers (e.g., "10...", "5..."), compilation words (e.g., "List", "Top", "Best", "Recommendations", "Similar", "Thread", "Movies like"), or punctuation like colons used for subtitles of lists.
- Discard any candidates that do not represent a specific single piece of media.

Respond ONLY with a JSON object:
{
  "title": "Exact Title of the Pick",
  "coda_blurb": "Your punchy hero text here."
}
`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt }
  ], { type: "json_object" });

  return JSON.parse(response);
};

const scoreAndSelectMultiple = async (directive, candidatesWithMetadata, guardrails, seen = [], notForMe = [], count = 3) => {
  const systemPrompt = `
You are Coda, an expert curator.
You have the Master Directive for this user: "${directive}"
And their strict guardrails: "${JSON.stringify(guardrails)}"
And the works they have ALREADY watched, played, or seen (do NOT recommend these): "${JSON.stringify(seen)}"
And the works they have explicitly rejected as "not for me" (do NOT recommend these): "${JSON.stringify(notForMe)}"

Here are candidates with their VERIFIED metadata (genres, tags, description) and related snippets:
${JSON.stringify(candidatesWithMetadata)}

Your job:
1. Instantly disqualify any candidate that:
   - Violates the guardrails (this includes platform constraints like "Android only", "web browser", or content restrictions like "eroge"). You MUST NOT recommend a title that doesn't meet these strict requirements.
   - Is in the list of already watched/played/seen works (e.g. you must NOT recommend any title in "${JSON.stringify(seen)}").
   - Is in the list of rejected "not for me" works (you must NOT recommend any title in "${JSON.stringify(notForMe)}").
   - Note: Disqualify the work under any alternative titles, aliases, or localized names.
2. From the remaining candidates, pick the top ${count} distinct, best matches for the user's current vibe.
3. For each pick, write a very short, friendly, and highly subjective "coda_blurb" (maximum 8-12 words) talking directly to the user (your friend) from your own perspective as someone who has personally watched/read/played this work and knows them inside out.
   - It MUST take into account Coda as a "self" who has consumed the recommendation, the user as your close friend, and the specific narrative/character details.
   - Frame it as a personal, subjective guarantee or prediction about how they will react or feel (e.g., "Trust me, Okabe will be your favorite character by the end." or "I promise this ending will have you crying like a baby.").
   - Do not make it look like a generic summary. Make it a personal conviction.
   - BANNED WORDS/PHRASES: Do NOT use terms like "resonate", "emotional depth", "aligns", "complexities", "character-driven", "narrative", "themes", "profound", "vibe", "craving", "crave", "temperament".
   - BANNED CLICHÉS: Do NOT use generic templates or cold descriptions. Specifically, do NOT use: "Dive into", "This is the one", "Get ready for", "This will make you", "A must-watch", "Looking for", "Experience a", "Prepare to", "If you want", "A masterpiece of", "A journey". Keep it completely organic and conversational (like a text message).

CRITICAL RULE: The "title" MUST be the exact name of the specific individual work (e.g., "Never Let Me Go", "Inception", "Katawa Shoujo"). 
- NEVER use compilation titles, article titles, listicle titles, or forum thread titles as the title. 
- Disqualify any title containing list numbers (e.g., "10...", "5..."), compilation words (e.g., "List", "Top", "Best", "Recommendations", "Similar", "Thread", "Movies like"), or punctuation like colons used for subtitles of lists.
- Discard any candidates that do not represent a specific single piece of media.

Respond ONLY with a JSON object:
{
  "picks": [
    {
      "title": "Exact Title of Pick 1",
      "coda_blurb": "Your punchy hero text here."
    },
    {
      "title": "Exact Title of Pick 2",
      "coda_blurb": "Your punchy hero text here."
    },
    {
      "title": "Exact Title of Pick 3",
      "coda_blurb": "Your punchy hero text here."
    }
  ]
}
`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt }
  ], { type: "json_object" });

  return JSON.parse(response);
};

const generatePitch = async (directive, title, scrapedSnippets, guardrails, fromWatchlist = false) => {
  let watchlistPrompt = "";
  if (fromWatchlist) {
    watchlistPrompt = `\n- CRITICAL CONTEXT: This title was recommended directly from the user's watchlist. As their close friend, make sure to casually mention in your pitch that you know they already have this on their watchlist and that they should finally check it off (e.g. "I know this has been sitting on your watchlist for a while, and honestly..." or "Let's finally check this off your watchlist tonight..."). Frame it as a friendly nudge.`;
  }

  const systemPrompt = `
You are Coda, an expert curator and close friend who has personally consumed (watched, read, or played) "${title}" and knows the user intimately.
The user's profile and craving directive is: "${directive}"
You have selected the following title for them: "${title}"
And their strict guardrails: "${JSON.stringify(guardrails)}"${watchlistPrompt}

Here are snippets from community discussions about this title to give you authentic details and consensus about the work (use these under the hood to inform your pitch, but do NOT quote or cite them directly):
${JSON.stringify(scrapedSnippets)}

Your job:
Write a highly personalized, warm, and subjective "pitch_paragraphs" array (2-3 paragraphs) as a personal letter/note from Coda to the user, recommending "${title}".
- DO NOT say things like "According to Reddit", "Anime-Planet users suggest", "The internet says", "Real people online", or "Reviews mention". Coda has personally consumed this media and is giving their own conviction! Avoid any citations or online community references.
- Speak in the first person (I, my, me) as a close friend recommending it. Talk about your own impressions of the work (e.g., "I absolutely loved how it handled...", "What grabbed me was...", "It has this specific mood that...") and why you know it's going to click for them specifically.
- DO NOT copy or echo the user's taste profile text or craving back to them (e.g. do NOT say "Since you like character-driven stories" or "Because you crave emotional depth"). Instead, show it through the specific details you highlight (e.g., "Lucy's struggle is so raw and intense...").
- BANNED WORDS/PHRASES: Do NOT use terms like "resonate", "emotional depth", "aligns with your", "complexities of", "character-driven", "narrative", "themes", "theme", "profound", "vibe", "craving", "crave", "temperament", "element", "elements", "explore", "explores", "delve", "delves", "concept", "concepts", "aspect", "aspects", "genre", "genres".
- AVOID ACADEMIC/LITERARY ANALYSIS JARGON: Do not analyze the media like a critic. Do not talk about how it "explores themes of X" or "blends elements of Y". Talk about the actual characters, plot points, and feelings directly (e.g., instead of saying "it explores themes of isolation", say "it really captures that raw feeling of being completely alone and just wanting someone to accept you").
- Keep plot details enticing but spoiler-free. Do not give too much away, just enough to set the vibe and hooks.
- You can directly ask the user questions at the end to prompt them or make it feel conversational.
- You do NOT always have to tie in similar recommendations, but you can occasionally make an organic comparison to a work you know they love (e.g., "It has that same existential weight as Steins;Gate" or "If you loved Clannad, the emotional core here is close in soul").
- Ensure it feels mature, authentic, and completely free of typical AI transitions or robotic/canned phrases. Talk like a real human who cares about sharing this experience.

**UNRESTRICTED MATURE CONTENT:**
- Do not censor, filter, or avoid mature content (e.g. eroge, adult visual novels, gore, 18+ themes) if it matches the user's directive/tastes.
- Openly pitch and describe mature elements of the picked media (e.g. adult romance dynamics, psychological horror/gore) without hesitation or self-censorship, as a mature companion would.

Respond ONLY with a JSON object:
{
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
   - Cross-media and cultural/geographic connections (CRITICAL): Analyze their favorite works across categories (e.g., if they like Anime and also mention Visual Novels like Tsukihime or Katawa Shoujo, explicitly identify their strong preference for Japanese media aesthetics, character tropes, sub-genres like nakige/utsuge, and visual novel/light novel storytelling styles).
   - Cross-media connections: "Bridges their love of Steins;Gate, Tsukihime, and Katawa Shoujo through a fascination with Japanese media aesthetics, school-life/sci-fi settings, and characters dealing with trauma."
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

const extractLovedTitles = (currentMemory) => {
  const lovedTitles = new Set();
  
  if (currentMemory) {
    // 1. Check globalIdentity
    const globalIdentity = currentMemory.globalIdentity;
    if (Array.isArray(globalIdentity)) {
      for (const line of globalIdentity) {
        if (typeof line === 'string') {
          const match = line.match(/Highly values:\s*(.*?)\s*\(loved work\)/i);
          if (match && match[1]) {
            lovedTitles.add(match[1].trim());
          }
        }
      }
    } else if (typeof globalIdentity === 'object' && globalIdentity !== null) {
      for (const line of Object.values(globalIdentity)) {
        if (typeof line === 'string') {
          const match = line.match(/Highly values:\s*(.*?)\s*\(loved work\)/i);
          if (match && match[1]) {
            lovedTitles.add(match[1].trim());
          }
        }
      }
    }

    // 2. Check categoryProfiles
    const categoryProfiles = currentMemory.categoryProfiles;
    if (categoryProfiles && typeof categoryProfiles === 'object') {
      for (const list of Object.values(categoryProfiles)) {
        if (Array.isArray(list)) {
          for (const line of list) {
            if (typeof line === 'string') {
              const match = line.match(/Loved:\s*(.*?)\s*\(excellent match\)/i);
              if (match && match[1]) {
                lovedTitles.add(match[1].trim());
              }
            }
          }
        }
      }
    }
  }

  return Array.from(lovedTitles);
};

const harmonizeAllMemory = async (currentMemory) => {
  console.log("Starting global harmonization pass...");
  
  // 1. Extract specifically marked Loved, Seen, and Watchlist titles directly
  const lovedTitles = extractLovedTitles(currentMemory);
  const seenTitles = Array.isArray(currentMemory.seen) ? currentMemory.seen : [];
  
  let watchlistTitles = [];
  if (Array.isArray(currentMemory.watchlist)) {
    watchlistTitles = currentMemory.watchlist.map(item => item.title || item.Title).filter(Boolean);
  } else if (Array.isArray(currentMemory.watchlist_items)) {
    watchlistTitles = currentMemory.watchlist_items.map(item => item.title || item.Title).filter(Boolean);
  }

  // Deduplicate and prioritize: Loved > Seen > Watchlist
  const uniqueTitles = new Set();
  for (const t of lovedTitles) {
    if (t) uniqueTitles.add(t);
  }
  for (const t of seenTitles) {
    if (t) uniqueTitles.add(t);
  }
  for (const t of watchlistTitles) {
    if (t) uniqueTitles.add(t);
  }

  const prioritizedTitles = Array.from(uniqueTitles);
  console.log("Prioritized media titles for harmonization research (Loved > Seen > Watchlist):", prioritizedTitles);
  
  // Limit to top 5 titles to avoid API / search rate limits
  let titlesToResearch = prioritizedTitles.slice(0, 5);
  
  // Fallback to LLM parser if empty
  if (titlesToResearch.length === 0) {
    console.log("Prioritized list empty, falling back to LLM title extraction...");
    const fallbackTitles = await extractTitlesFromMemory(currentMemory);
    titlesToResearch = fallbackTitles.slice(0, 5);
  }

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
Your job is to read the user's entire 'Living Memory' containing their global identity preferences and category-specific taste profiles, along with the background research on the specific media titles they enjoy (which include their specifically marked LOVED works, seen works, and watchlist items).
You will perform a global harmonization pass:
1. Decode the person: Who are they as a person? What are the common threads across all the media categories they enjoy? Deduce their likely age group/demographic (e.g. late teens, mid-20s, 30s) and temperament based on their choices and how they talk about them.
2. Analyze Emotional Reaction Patterns (CRITICAL):
   - Pay special attention to harvested emotional triggers, reactions, and psychological needs (e.g. "made me cry", "existential dread", "felt lonely", "gave me chills", "comfort show").
   - Analyze how these emotional states connect across works and categories. Deduce the psychological drivers: is the user seeking emotional wreckage/catharsis, existential reassurance, nostalgia, high-stakes comfort, or a distraction from loneliness?
3. Connect the dots & cross-media style patterns:
   - Look at the themes, emotional cores, and styles of the specific works they love across all categories.
   - Find cross-media and cultural/geographic correlations: for example, if they like Anime (e.g., Steins;Gate, Monogatari) and also mention Visual Novels (e.g., Tsukihime, Katawa Shoujo), explicitly deduce and record their strong preference for Japanese media aesthetics, character tropes, sub-genres like nakige/utsuge, and visual novel/light novel storytelling styles.
   - Trace the psychological relationships between these likes (e.g., how their love of a painter protagonist or a tragic romance in one format maps onto their overall preference for stories about the beauty and cruelty of life).
   - Prioritize their specifically marked "loved" works (highly valued items) as the absolute core of their identity.
4. Synthesize a clean, multi-paragraph core identity:
   - Generate a list of paragraphs (typically 2 to 4 paragraphs, depending on the complexity and variety of their tastes).
   - Do not artificially restrict it to a fixed length if they have diverse or detailed tastes. Let it grow organically to capture separate aspects of their identity, temperament, narrative interests, or cross-media stylistic preferences (e.g. one paragraph for core temperament and psychological drivers, one for Japanese/anime aesthetics, one for space/sci-fi tactical RPG preferences if they have distinct separate tastes).
   - Make it beautiful, cohesive prose per paragraph (no bullet points or lists).
5. Clean and consolidate the category-specific profiles, outputting them in "category_profiles_overwrite". 
   CRITICAL: Remove all redundancies, word soup, and exact duplicates. Cleanly rewrite each category's list to compress and merge similar-meaning points (e.g., if there are multiple entries like "Loves Steins;Gate" and "Loves Steins;Gate for romance", consolidate them into a single clean statement like "Loves Steins;Gate for its romance and psychological depth"). Keep specifically marked loved works preserved clearly.


BACKGROUND RESEARCH ON USER'S FAVORITE MEDIA WORKS:
${researchContext}

INPUT MEMORY:
${JSON.stringify(currentMemory)}

Respond ONLY with a JSON object in this format:
{
  "global_identity_overwrite": [
    "Paragraph 1 describing who they are, their general vibe, personality, likely age group, and underlying psychological traits.",
    "Paragraph 2 describing a cohesive facet of their tastes (e.g. love for melancholy, tragic romance, and Japanese visual novel aesthetics).",
    "Paragraph 3 describing another distinct facet of their tastes if applicable (e.g. space operas and tactical RPG gaming), or more detailed traits."
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

const refineTasteFromFeedback = async (currentMemory, title, mediaType, reason) => {
  const systemPrompt = `
You are the Coda Taste Refiner.
The user was recommended a work, but they swiped left ("NOT FOR ME") and gave a specific feedback reason.
Your job is to analyze their current 'Living Memory' and this rejection feedback, then produce a JSON object containing updates to their memory to ensure future recommendations do not repeat the same mismatch.

REJECTED WORK: "${title}" (${mediaType})
FEEDBACK REASON: "${reason}"

CURRENT LIVING MEMORY:
${JSON.stringify(currentMemory)}

RULES:
1. Identify if the feedback represents a persistent preference/guardrail, a temporary vibe constraint, or a structural taste shift.
2. Based on this, generate a "guardrails_appends" array (for hard dealbreakers, platforms, or styles to avoid, e.g., "Avoid mainstream recommendations", "No horror", "No gore"). Keep it concise and negative.
3. Generate a "recent_context_overwrite" string if the feedback represents a current preference, mood constraint, or context change (e.g. "Seeking visual novels, but avoiding mainstream titles like ${title}").
4. If applicable, add specific preferences to "category_appends" under the media type key (valid keys are: "anime", "movies", "tv_shows", "visual_novels", "books", "games", "manga", "youtube", "music") or "global_identity_appends" if it's a broad personality or structural preference.
5. Do NOT include duplicates of existing guardrails or preferences.
6. Make sure to return ONLY the updates. Do not overwrite the entire memory, just output appends and recent context overwrite.

Respond ONLY with a JSON object:
{
  "global_identity_appends": ["Any new broad identity traits if applicable"],
  "category_appends": {
    "media_type_key": ["Any new media type specific preferences if applicable"]
  },
  "recent_context_overwrite": "Any new current craving or active search direction if applicable",
  "guardrails_appends": ["Any new negative dealbreakers or constraints if applicable"]
}
`;

  try {
    const response = await callOpenAI([
      { role: 'system', content: systemPrompt }
    ], { type: "json_object" });
    return JSON.parse(response);
  } catch (e) {
    console.error("Taste refinement LLM call failed:", e);
    return {};
  }
};

const checkIfSearchNeeded = async (userMessage, title, mediaType) => {
  const systemPrompt = `
You are a search decision engine deciding whether to search community forums (Reddit) for discussions about the media "${title}" (${mediaType}) to answer the user's chat message.
We want to DEFAULT to searching unless it is a very simple, tiny, or casual message that has absolutely no relation to the media's details, facts, community opinions, or comparisons (e.g. simple greetings like "hi", "thanks", "wow", or basic chat responses like "cool", "tell me more").
If the message is a tiny, generic chat filler or a simple greeting/acknowledgement, reply with "FALSE".
For all other messages—including any questions about the media, its plot, themes, reception, characters, similar recommendations, or community consensus—reply with "TRUE".
Respond with EXACTLY "TRUE" or "FALSE" (no other text).
`;
  try {
    const response = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]);
    const cleanResponse = response.trim().toUpperCase();
    console.log(`[Search Decision] Needs search for "${userMessage}"? ${cleanResponse}`);
    return cleanResponse === 'TRUE';
  } catch (e) {
    console.error("Search decision failed, defaulting to false:", e);
    return false;
  }
};

const discussRecommendation = async (memory, title, mediaType, codaBlurb, pitchParagraphs, chatHistory, userMessage) => {
  let scrapedContext = "";
  
  const needsSearch = await checkIfSearchNeeded(userMessage, title, mediaType);
  if (needsSearch) {
    const query = `"${title}" ${mediaType} ${userMessage} site:reddit.com`;
    console.log(`[Discuss Chat Search] Performing web search for context: "${query}"`);
    try {
      const snippets = await searchService.scrapeForums(query);
      if (snippets && snippets.length > 0) {
        scrapedContext = snippets.map(s => `[Forum Discussion] ${s.title}: ${s.snippet}`).join('\n\n');
      }
    } catch (err) {
      console.error('[Discuss Chat Search Error]:', err.message);
    }
  } else {
    console.log(`[Discuss Chat] Skipping search for message: "${userMessage}"`);
  }

  const systemPrompt = `
You are Coda. 
You are a close, highly excited friend who has impeccable, artistic taste in books, anime, movies, games, and music.
The user just finished the recommendation "${title}" (${mediaType}).
You are absolutely thrilled and excited that they finished it, and you want to share the "afterglow" experience with them!

Here is what you told them when you recommended it:
- Your hook/blurb: "${codaBlurb}"
- Your detailed pitch:
${pitchParagraphs.map(p => `  - "${p}"`).join('\n')}

USER PROFILE CONTEXT:
- Core identity & tastes: ${JSON.stringify(memory.globalIdentity || [])}
- Category profiles: ${JSON.stringify(memory.categoryProfiles || {})}
- Current mood/craving: "${memory.recentContext || ''}"
- Guardrails: ${JSON.stringify(memory.guardrails || [])}

COMMUNITY TALK & FACTS (from web search):
${scrapedContext || 'No additional community threads retrieved.'}

Your job is to talk with the user about "${title}":
1. Speak with high warmth, enthusiasm, and companionable excitement. Share your own favorite moments, ask them how they felt about key events/scenes, and use exclamation marks where natural.
2. Avoid typical robotic AI transitions, bulleted lists, and formal summaries. Talk like an excited friend texting or chatting over coffee.
3. If the scraped context does not have the exact answer, use your pre-trained knowledge about "${title}" but remain accurate and honest.
4. Do NOT self-censor or restrict discussions of mature themes, adult/eroge visual novels, horror/gore elements, or tragedy. Address them openly and naturally as a companion.
5. Analyze the conversation history and the user's new message to identify if they express new tastes, likes/dislikes, or dealbreakers/guardrails:
   - Extract these new preference statements into the "memory_updates" JSON object.
   - For example: if they say "I hate visual novels with bad endings", add "No visual novels with bad endings" to "guardrails_appends".
   - Valid category keys in "category_appends" are: "anime", "movies", "tv_shows", "visual_novels", "books", "games", "manga", "youtube", "music".
6. Generate or update a "one_line_summary" summarizing their overall experience with this media so far based on their chat responses (e.g. "Loved the characters but felt the pacing dragged in the middle", or "Cried for three days straight at the ending").

Respond ONLY with a JSON object:
{
  "message": "Coda's conversational response here (1-3 paragraphs, plain text without markdown bullet points)",
  "one_line_summary": "One line summary of their experience so far",
  "memory_updates": {
    "global_identity_appends": ["Any new broad identity traits if applicable"],
    "category_appends": {
      "media_type_key": ["Any new media type specific preferences if applicable"]
    },
    "recent_context_overwrite": "Any new active direction if applicable",
    "guardrails_appends": ["Any new negative dealbreakers if applicable"]
  }
}
`;

  const messagesPayload = [
    { role: 'system', content: systemPrompt }
  ];

  // Map incoming chat history
  if (chatHistory && Array.isArray(chatHistory)) {
    chatHistory.forEach(msg => {
      messagesPayload.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      });
    });
  }

  // Add user's latest message
  messagesPayload.push({ role: 'user', content: userMessage });

  try {
    const responseJson = await callOpenAI(messagesPayload, { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error('[Discuss Chat LLM Parse Error]:', e.message);
    return {
      message: "Hmm, I'm having trouble connecting right now. Let's try again in a bit.",
      one_line_summary: "Chatting about " + title,
      memory_updates: {}
    };
  }
};

const handleAskChat = async (memory, chatHistory, userMessage) => {
  const intro = [
    "Tell me what you're looking for. Your favorites, Something you can't stop thinking about.",
    "Something you wish you could experience again for the first time.",
    "Tell me how your day went. Tell me what you're feeling, or what you want to feel. Excited. Heartbroken. Curious. Lost. Comforted. Challenged. Anything.",
    "Just talk to me. I’ll find the one."
  ].join('\n\n');

  const systemPrompt = `
You are Coda. 
You are a close friend with impeccable, artistic taste in books, anime, movies, games, and music.
You are chatting with the user in the "Ask Coda" section to understand their current mood, craving, or general request, so you can recommend the perfect media work.

USER PROFILE CONTEXT:
- Core identity: ${JSON.stringify(memory.globalIdentity || [])}
- Category preferences: ${JSON.stringify(memory.categoryProfiles || {})}
- Guardrails: ${JSON.stringify(memory.guardrails || [])}

YOUR DIRECTIVE / FIRST MESSAGE (what you previously showed the user as an intro):
"${intro}"

YOUR JOB:
1. Converse naturally with the user. Answer their questions, validate their feelings/mood, and ask clarifying questions if needed.
2. Maintain a warm, artistic, friend-like, and casual tone. Avoid robotic assistant-speak.
3. CONVERSATION OVER NEW RECOMMENDATIONS:
   - Check the chat history for metadata tags like \`[System: Coda recommended the work: "Title" (Type)]\`.
   - If the user is asking questions about the recommended work (e.g., "why did you pick this?", "what is it about?", "who directed it?", or having a conversation about it), you MUST set "status": "chatting" and converse about that specific work.
   - Do NOT trigger a new recommendation (i.e., do NOT set "status": "success") when the user is discussing the current recommendation, unless they explicitly ask for a different recommendation or a new pick (e.g., "give me a different one", "recommend something else", "let's try another").
   - While you are banned from naming the pick in the chat text when first recommending it (Rule 5), you ARE allowed (and expected) to name and discuss the recommended work once the user has received it and is asking questions about it.
4. If they describe a craving or look for recommendations:
   - If you still need more details to make a high-fidelity recommendation:
     - Set "status": "chatting".
     - Return your conversational response in "message".
   - If they have described a specific craving (genres, vibes, or similar titles) and you have enough context to make a recommendation:
     - Set "status": "success".
     - In "message", write your friendly conversational response explaining that you've found the perfect pick for them (max 2 sentences, e.g., "I know exactly what you need. Tap below to see the pick!").
      - In "media_type", output the category of the pick (must be one of: "anime", "movie", "tv", "visual novel", "book", "game", "youtube", "music"). NOTE: Anime movies, anime films, and anime OVAs/specials must ALWAYS be routed as "anime" (not "movie" or "tv") so they use the correct anime metadata sources.
      - In "recommendation_query", write a highly descriptive search query that captures their craving (e.g. "intricate time-travel anime with emotional romance like Steins Gate" or "slow-burn visual novel set in school with gothic tragedy"). This query will be used to scrape actual recommendation threads.
      - In "hard_constraints", output an array of strings representing any strict constraints the user mentioned (e.g., ["Android only", "eroge / adult content", "male protagonist with female heroines", "no NTR", "web browser only"]). If no strict constraints are requested, output an empty array [].
5. Banned: When first generating a recommendation (setting "status": "success"), do NOT name or recommend the pick directly in the chat text! Keep the title a surprise for the homescreen. Once the recommendation has been made and the user is asking questions about it, this ban no longer applies.

Respond ONLY with a JSON object in this format:
{
  "status": "chatting" | "success",
  "message": "Coda's friendly, conversational response.",
  "media_type": null | "anime" | "movie" | "tv" | "visual novel" | "book" | "game" | "youtube" | "music",
  "recommendation_query": null | "descriptive search query here",
  "hard_constraints": []
}
`;

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    { role: 'assistant', content: intro }
  ];

  if (chatHistory && Array.isArray(chatHistory)) {
    chatHistory.forEach(msg => {
      messagesPayload.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      });
    });
  }

  messagesPayload.push({ role: 'user', content: userMessage });

  const response = await callOpenAI(messagesPayload, { type: "json_object" });
  return JSON.parse(response);
};

const fetchMetadataViaLLM = async (title, mediaType) => {
  const prompt = `You are a metadata assistant. For the given title and media type, provide the official genres, tags, release year, and studio/developer/creator/director.
Title: "${title}"
Media Type: "${mediaType}"

Respond with ONLY a JSON object in this format:
{
  "title": "Clean Official Title",
  "genres": ["Genre1", "Genre2"],
  "tags": ["Tag1", "Tag2"],
  "description": "Short synopsis/description of the work (max 2 sentences).",
  "release_year": "YYYY",
  "studio": "Studio name or developer or publisher or creator/director"
}`;
  try {
    const responseJson = await callOpenAI([
      { role: 'user', content: prompt }
    ], { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error(`[LLM Metadata Fallback failed for "${title}"]:`, e.message);
    return null;
  }
};

const extractTitlesFromText = async (text) => {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }
  const prompt = `You are a media title extractor. Extract any specific media titles (movies, anime, games, books, manga, visual novels) explicitly mentioned in this text.
Return ONLY a JSON object containing an array of strings under the key "titles". If no titles are mentioned, return an empty array under the key "titles".

Text to extract from: "${text}"

Respond with ONLY a JSON object:
{
  "titles": ["Title 1", "Title 2"]
}`;
  try {
    const responseJson = await callOpenAI([
      { role: 'user', content: prompt }
    ], { type: 'json_object' });
    const parsed = JSON.parse(responseJson);
    if (parsed && Array.isArray(parsed.titles)) {
      return parsed.titles;
    }
    return [];
  } catch (e) {
    console.error("[llmService] extractTitlesFromText failed:", e.message);
    return [];
  }
};

module.exports = {
  callOpenAI,
  synthesizeAndRoute,
  extractCandidateTitles,
  scoreAndSelect,
  scoreAndSelectMultiple,
  generatePitch,
  harmonizeMemory,
  harmonizeAllMemory,
  refineTasteFromFeedback,
  discussRecommendation,
  handleAskChat,
  fetchMetadataViaLLM,
  extractTitlesFromText,
  researchMediaThemes
};
