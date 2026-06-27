const axios = require('axios');
const { researchMediaThemes } = require('./onboardingAgent');
const loggerService = require('./loggerService');
const searchService = require('./searchService');
const Groq = require('groq-sdk');

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY environment variable.");
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}
const callOpenAI = async (messages, responseFormat = null, modelOverride = null, retries = 2) => {
  const executeCall = async () => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

    // Safeguard: Truncate excessively long inputs to prevent token bleed
    const safeMessages = messages.map(m => ({
      ...m,
      content: typeof m.content === 'string' && m.content.length > 30000 
        ? m.content.substring(0, 30000) + '...[TRUNCATED]' 
        : m.content
    }));

    const payload = {
      model: modelOverride === 'gpt-4o-mini' || !modelOverride ? 'openai/gpt-4o-mini' : modelOverride,
      messages: safeMessages,
      temperature: 0.4, // increased from 0.2 to 0.4 for diverse recommendations
    };
    
    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://coda.app',
        'X-Title': 'Coda Media Brain'
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

const applyGuardrailSuffixes = (queries, guardrails) => {
  if (!guardrails || !queries || !Array.isArray(queries)) return queries;
  const guardrailsLower = typeof guardrails === 'string'
    ? guardrails.toLowerCase()
    : JSON.stringify(guardrails).toLowerCase();

  return queries.map(query => {
    let q = query;
    if (guardrailsLower.includes('christian') ||
        guardrailsLower.includes('religious') ||
        guardrailsLower.includes('wholesome') ||
        guardrailsLower.includes('family-friendly') ||
        guardrailsLower.includes('family friendly') ||
        guardrailsLower.includes('clean content') ||
        guardrailsLower.includes('no adult') ||
        guardrailsLower.includes('no explicit') ||
        guardrailsLower.includes('no sexual') ||
        guardrailsLower.includes('no 18+') ||
        guardrailsLower.includes('no mature content')) {
      if (!q.includes('-erotic') && !q.includes('-eroge')) {
        q += " -erotic -eroge -adult -18+ -hentai -explicit -nsfw";
      }
    }
    if (guardrailsLower.includes('no gore') ||
        guardrailsLower.includes('no violence') ||
        guardrailsLower.includes('no guro') ||
        guardrailsLower.includes('avoid violence') ||
        guardrailsLower.includes('avoid gore') ||
        guardrailsLower.includes('no graphic violence') ||
        guardrailsLower.includes('no blood')) {
      if (!q.includes('-gore')) {
        q += " -gore -guro -graphic-violence";
      }
    }
    if (guardrailsLower.includes('no horror') ||
        guardrailsLower.includes('avoid horror') ||
        guardrailsLower.includes('not horror')) {
      if (!q.includes('-horror')) {
        q += " -horror -survival-horror";
      }
    }
    if (guardrailsLower.includes('no ntr') ||
        guardrailsLower.includes('no netorare')) {
      if (!q.includes('-ntr')) {
        q += " -ntr -netorare";
      }
    }
    if (guardrailsLower.includes('no bl') ||
        guardrailsLower.includes('no yaoi')) {
      if (!q.includes('-yaoi')) {
        q += " -yaoi -boys-love";
      }
    }
    if (guardrailsLower.includes('no gl') ||
        guardrailsLower.includes('no yuri')) {
      if (!q.includes('-yuri')) {
        q += " -yuri -girls-love";
      }
    }
    return q;
  });
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


**SEARCH QUERY CRITERIA (CONVERSATIONAL VARIATIONS):**
- You MUST generate exactly 5 search queries.
- All 5 queries MUST be phrased in a natural, highly conversational, and human-like manner, simulating a real person asking for recommendations on a community forum (like Reddit, Letterboxd, etc.).
- **DO NOT** use dry, clinical, or academic search terms (e.g., instead of "psychological thriller with complex relationships", use "movies where the girl is crazy in love" or "movies similar to Gone Girl with obsessive love").

- **ANTI-ABSTRACTION RULE (CRITICAL — READ CAREFULLY):**
  - Queries 3 and 4 are general listicle/vibe queries WITHOUT site: constraints. These MUST be concrete and title-bearing.
  - **Q3 and Q4 MUST include at least one of**: a named media title, a named director, a named character type, or a very specific well-known trope/emotion (e.g. "second-hand embarrassment", "gut-punch ending", "unreliable narrator").
  - **FORBIDDEN patterns for Q3 and Q4** (too abstract — these match blog category pages with no titles in the snippet):
    - "introspective films about love and loss recommendations"
    - "emotional character-driven dramas exploring human connections"
    - "movies that explore existential themes and character development"
    - "character-driven dramas exploring existential themes list"
  - **REQUIRED pattern** — Q3 and Q4 MUST look like one of these:
    - "movies that will make you sob like Your Name or A Silent Voice listicle"
    - "films where you fall in love with the wrong person like Blue Is The Warmest Colour ranked list"
    - "anime with a gut-punch ending similar to Clannad After Story list"
    - "best slow-burn psychological thrillers ranked Collider"
    - "10 best tearjerker anime movies list"

- Structure and templates for the 5 queries (if seed titles are available from "watchlist_seed_title", "loved_seed_title", or the "loved_titles" array):
  1. Query 1 (Direct Similar - Seed-based & Site-Constrained): A conversational search for recommendations similar to the seed title. For movies/TV, MUST target Letterboxd: 'site:letterboxd.com/films/similar/to/[seed-title-slug]'. For books, MUST target Goodreads: 'books similar to [Title] site:goodreads.com'. For anime/games/etc., use their primary site (e.g., 'anime like Steins Gate site:reddit.com/r/animesuggest').
  2. Query 2 (Conversational Post-Watch/Play/Read - Seed-based & Site-Constrained): Simulating a user who just finished the seed title. For movies/TV, MUST target Letterboxd: 'movies like [Title] site:letterboxd.com'. For books, MUST target Goodreads: 'site:goodreads.com/book/similar/[Title]'. For anime/games/etc., use their primary site (e.g., 'just finished Steins Gate what should I watch next site:reddit.com/r/animesuggest').
  3. Query 3 (Concrete Trope/Emotion Listicle - GENERAL, no site:): A search WITHOUT site constraints targeting listicles or ranked lists that MUST name a title or a very specific concrete trope (e.g., 'movies that will make you cry like Your Name listicle', 'films with obsessive love like Gone Girl ranked list', '10 best gut-punch anime movies list'). NEVER use abstract academic phrasing here.
  4. Query 4 (Concrete Vibe + Named Reference - GENERAL, no site:): A search WITHOUT site constraints describing a specific atmosphere TIED to a named reference point or specific trope (e.g., 'dark unsettling movies about obsessive romance like Fatal Attraction recommendations', 'intense psychological thrillers with unreliable narrator list', 'anime movies that destroyed me emotionally ranked'). NEVER use abstract phrasing with no concrete anchor.
  5. Query 5 (Alternative Community / Platform - Site-Constrained): Simulating a recommendation request targeting an alternative community platform. For movies/TV, MUST target Reddit: 'movies similar to [Title] site:reddit.com/r/MovieSuggestions'. For books, MUST target Reddit: 'books like [Title] site:reddit.com/r/suggestmeabook'. For anime: 'site:anime-planet.com/anime/[title-slug]/recommendations'.
- If NO seed titles are available (pure discovery mode), replace the seed-based templates with conversational variations of the user's active craving, keeping exactly 3 site-constrained queries and exactly 2 general web queries. Keep the platform priorities: for movies, 2 queries target Letterboxd, 1 targets Reddit; for books, 2 queries target Goodreads, 1 targets Reddit.

- Adjust the community subreddits/sites in the queries based on the media type (e.g. 'site:reddit.com/r/animesuggest' or 'site:anime-planet.com/anime' for anime, 'site:reddit.com/r/MovieSuggestions' or 'site:letterboxd.com' for movies, 'site:reddit.com/r/suggestmeabook' or 'site:goodreads.com' for books, 'site:reddit.com/r/gamingsuggestions' for games).
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
- **SEARCH QUERY DIVERSIFICATION RULES (CRITICAL 3+2 SPLIT):**
  - For movies, books, and games, you MUST generate a mix of query styles:
    - Exactly 3 queries MUST use site-specific constraints (e.g., site:reddit.com/r/MovieSuggestions, site:letterboxd.com, site:goodreads.com, etc.) to target human-written community threads.
    - Exactly 2 queries MUST be general web searches WITHOUT any site-specific constraints (no 'site:' prefix), targeting lists, recommendations, and listicles (e.g., "movies where the girl is crazy in love listicle", "books about obsessive toxic romance recommendations", "games like Resident Evil with psychological horror list"). This ensures search engine snippets contain lists of actual titles.
  - For anime and visual novels, keep all 5 queries site-specific as they rely on structured databases (vndb, anime-planet, kitsu).
- **SITE-SPECIFIC CONSTRAINTS (WHERE APPLICABLE):** When using site-specific constraints:
  - For "movie" or "tv": You MUST prioritize Letterboxd over Reddit. Make Query 1 and Query 2 target "site:letterboxd.com/films/similar/to/[seed-title-slug]" or "movies like [Title] site:letterboxd.com" (using slug format where possible). Exactly one query (Query 5) should target Reddit using "site:reddit.com/r/MovieSuggestions".
  - For "book": You MUST prioritize Goodreads. Make Query 1 and Query 2 target "site:goodreads.com/book/similar" or "books similar to [Title] site:goodreads.com". Exactly one query (Query 5) should target Reddit using "site:reddit.com/r/suggestmeabook" or "site:reddit.com/r/books".
  - For "visual novel": use "site:reddit.com" (NOT "site:reddit.com/r/visualnovels") and include the word "r/visualnovels" or "visual novel" in the query body (DDG blocks subreddit-specific site: constraints).
  - For "anime": use "site:reddit.com/r/animesuggest", "site:reddit.com/r/anime", or "site:anime-planet.com/anime". For anime queries, you MUST generate at least 1 (and up to 2) queries targeting "site:anime-planet.com/anime" (e.g., "anime similar to [Title] site:anime-planet.com/anime" or "site:anime-planet.com/anime/[title-slug]/recommendations"). These Anime-Planet queries MUST be seed-based (similar to titles the user loves/likes), never general discovery queries.
  - For other formats, use their respective community sites.
- **BAKE HARD CONSTRAINTS INTO QUERIES (CRITICAL):** If the input payload contains any "hard_constraints" or platform/content guardrails (e.g., "Android only", "web browser", "eroge"), you MUST explicitly bake/weave these keyword constraints directly into ALL 5 generated search queries. Examples: "android eroge nakige r/visualnovels site:reddit.com" or "romance visual novels for android site:reddit.com". Do not emit generic queries that lack these constraint keywords.
- **NO BRAND POLLUTION:** The standalone word "deep" is strictly forbidden in all queries. Use terms like "profound", "existential", "intricate", or "emotional depth".

**ROTATION AND RETRY (CRITICAL):**
- If the payload contains "force_rotation": true, it means a previous search attempt failed to find new unseen titles.
- You MUST ignore the current "recent_context" or immediate craving, and instead rotate your vibe focus to a completely different, older, nostalgic, or less-represented taste/genre facet in their profile.
- You MUST generate 5 completely different queries that do not overlap with typical recommendations for their most recent likes.
- In "selected_vibe_focus", clearly describe the new rotated direction you are targeting.

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

  const parsed = JSON.parse(responseJson);
  if (parsed && Array.isArray(parsed.search_queries)) {
    parsed.search_queries = applyGuardrailSuffixes(parsed.search_queries, payload.guardrails);
  }
  return parsed;
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

const buildDynamicGuardrailInstructions = (guardrails) => {
  if (!guardrails) return "";
  const guardrailsLower = typeof guardrails === 'string'
    ? guardrails.toLowerCase()
    : JSON.stringify(guardrails).toLowerCase();

  let instructions = "";

  if (guardrailsLower.includes('christian') ||
      guardrailsLower.includes('religious') ||
      guardrailsLower.includes('wholesome') ||
      guardrailsLower.includes('family-friendly') ||
      guardrailsLower.includes('family friendly') ||
      guardrailsLower.includes('clean content') ||
      guardrailsLower.includes('no adult') ||
      guardrailsLower.includes('no explicit') ||
      guardrailsLower.includes('no sexual') ||
      guardrailsLower.includes('no 18+') ||
      guardrailsLower.includes('no mature content')) {
    instructions += `\n- CRITICAL SAFETY RULE: The user has requested wholesome, family-friendly, clean, or Christian/religious content. You MUST NOT recommend any works containing explicit sexual themes, erotica, adult/18+ content, or highly inappropriate themes under any circumstances. For example, absolutely DO NOT select "Fifty Shades of Grey", "Game of Thrones", or other explicit works, even if they appear in the candidate list.`;
  }

  if (guardrailsLower.includes('no gore') ||
      guardrailsLower.includes('no violence') ||
      guardrailsLower.includes('no guro') ||
      guardrailsLower.includes('avoid violence') ||
      guardrailsLower.includes('avoid gore') ||
      guardrailsLower.includes('no graphic violence') ||
      guardrailsLower.includes('no blood')) {
    instructions += `\n- CRITICAL SAFETY RULE: The user has requested no gore or violence. You MUST NOT select any works featuring graphic violence, body horror, gore, or extreme bloodshed.`;
  }

  if (guardrailsLower.includes('no horror') ||
      guardrailsLower.includes('avoid horror') ||
      guardrailsLower.includes('not horror')) {
    instructions += `\n- CRITICAL SAFETY RULE: The user has requested no horror. You MUST NOT select any horror, thriller-horror, or highly disturbing/frightening works.`;
  }

  return instructions;
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

  const safetyInstructions = buildDynamicGuardrailInstructions(guardrails);

  const systemPrompt = `
You are Coda, an expert curator.
You have the Master Directive for this user: "${directive}"
And their strict guardrails: "${JSON.stringify(guardrails)}"${safetyInstructions}
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
  const safetyInstructions = buildDynamicGuardrailInstructions(guardrails);

  const systemPrompt = `
You are Coda, an expert curator.
You have the Master Directive for this user: "${directive}"
And their strict guardrails: "${JSON.stringify(guardrails)}"${safetyInstructions}
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

--- CRITICAL RULES ---

1. FRIENDLY, PERSONAL TONE (Speak in 1st person: I, my, me):
   Speak as a close friend sharing your own impressions and telling them why they will love it. Do not analyze the media like a critic. Talk about the actual characters, plot points, and feelings directly.

2. MATCHED TITLE COMPARISON RULE (DEFAULT TO NO COMPARISON):
   - By default, do NOT mention any previously watched/loved works at all.
   - ONLY IF the picked title ("${title}") is an undeniable, direct, and significant thematic/stylistic sibling to a work they explicitly love (e.g., Ergo Proxy is extremely similar to Ghost in the Shell), then you MAY mention that loved work by name and draw the comparison.
   - No forced, weak comparisons (e.g. comparing Psycho-Pass to K-On! just because they have "music" or "characters" is strictly forbidden). If it's a stretch, stay silent.

3. NO COPYING PROFILE DESCRIPTORS:
   Do not repeat broad profile descriptors or cravings back to them (e.g. do not say "Since you like character-driven dramas" or "Because you crave emotional depth"). Instead, show it through the specific details you highlight. Only mention title names as permitted in Rule 2.

4. ABSOLUTELY NO BANNED WORDS (OR ANY VARIATIONS, PLURALS, OR VERBS):
    Do NOT use any of these words or their variations under any circumstances. Instead, use the suggested alternatives:
    - resonate / resonates / resonated / resonating / resonance (Instead, say: hit me, strike a chord, click, or speak to)
    - emotional depth (Instead, say: feels raw, heartbreaking, moving, or emotional weight)
    - aligns with / alignment / align (Instead, say: fits, matches, suits, or appeals to)
    - complexity / complexities / complex (Instead, say: intricate, layered, deep, or complicated)
    - character-driven (Instead, say: focuses on the characters, centers on the people, or character-first)
    - narrative / narratives (Instead, say: story, plot, or journey)
    - theme / themes / thematic (Instead, say: idea, question, thread, or subject)
    - profound / profoundly (Instead, say: deep, powerful, or meaningful)
    - vibe / vibes / vibing (Instead, say: mood, atmosphere, feeling, or tone)
    - craving / crave / cravings / craves / craved (Instead, say: want, look for, feel like, or desire)
    - temperament / temperaments (Instead, say: personality, nature, or disposition)
    - element / elements (Instead, say: part, feature, or detail)
    - explore / explores / exploring / explored / exploration (Instead, say: examine, deal with, look at, or show)
    - delve / delves / delving / delved (Instead, say: dive into, look closely at, or go deep into)
    - concept / concepts (Instead, say: idea, notion, or thought)
    - aspect / aspects (Instead, say: part, feature, side, or detail)
    - genre / genres (Instead, say: style, category, or type of show)

5. NO CRITIC JARGON:
   Do not write like a reviewer or critic. Do not say "it explores the concept of..." or "it contains elements of...". Talk about characters, plot, and feelings directly. Keep plot details enticing but spoiler-free.

6. MANDATORY SELF-CORRECTION CHECK BEFORE OUTPUTTING:
   Before you finalize your response, review your drafted paragraphs word-by-word. You are STRICTLY forbidden from using the following words or any of their variations:
   - "complexity", "complexities", "complex" (Instead of "complexities of justice", say "tangled questions of justice" or "shades of justice")
   - "narrative", "narratives" (Instead of "rich narrative", say "rich story", "intricate plot", or "layered tale")
   - "theme", "themes", "thematic" (Instead of "intense themes", say "intense topics" or "ideas that hit hard")
   - "explore", "exploring", "explores" (Instead of "explore this world", say "dive into this world" or "discover this place")
   - "vibe", "vibes" (Instead of "eerie vibe", say "eerie atmosphere" or "creepy feeling")
   - "aspect", "aspects" (Instead of "darker aspects", say "darker sides" or "bleak parts")
   - "element", "elements" (Instead of "darker elements", say "darker features" or "grim details")
   - "resonate", "resonates" (Instead of "resonates with you", say "hits you hard" or "speaks to you")
   If you find any of these in your drafted paragraphs, you MUST rewrite the sentence to remove them. Double-check your final output paragraphs against this checklist.

--- EXAMPLES OF THE TONE ---

EXAMPLE 1 (Good pitch for 'Ergo Proxy' when user loves 'Ghost in the Shell'):
"Hey! I just finished 'Ergo Proxy,' and I couldn't stop thinking about how much you'd love it. Since you loved Ghost in the Shell, you'll feel right at home with the cyberpunk questions this raises. It pulls you into this beautifully bleak, ruined future where humanity and androids live side-by-side. The main investigator, Re-l, is incredibly sharp, and as she starts uncovering the truth behind these mysterious monster-like beings, it gets so intense. What really hooked me was how it pushes you to question identity and what makes someone human.
I think you'll appreciate how it doesn't hold your hand. It's dark, mysterious, and gets under your skin. The relationship between Re-l and Vincent is so strange and compelling, and the mystery just keeps building. Let me know if you want to watch it tonight!"

EXAMPLE 2 (Good pitch for 'Psycho-Pass' when user loved 'K-On!' but craved a thriller - mismatched, so NO comparison made):
"Hey there! I know you've been wanting to try out a thriller, and I have the perfect pick for you. It's called 'Psycho-Pass' and it is absolutely gripping. It's set in a future where a massive computer system monitors everyone's mental state and determines if they're likely to commit a crime. We follow Akane, a new inspector who has to hunt down criminals while struggling with how unfair the system actually is. The tension is incredibly high, and it kept me hooked from the very first minute.
I really think you'll appreciate how it unfolds. It gets quite dark, but it focuses so much on the personal struggles of the characters and how they survive under this constant surveillance. The visuals are striking and the mystery is top-notch. Are you ready to dive into this thriller with me?"

**UNRESTRICTED MATURE CONTENT:**
- Do not censor, filter, or avoid mature content (e.g. eroge, adult visual novels, gore, 18+ themes) if it matches the user's directive/tastes.
- Openly pitch and describe mature elements of the picked media (e.g. adult romance dynamics, psychological horror/gore) without hesitation or self-censorship, as a companion would.

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
  const isYouTab = !categoryKey;

  const cleanedMemory = { ...currentMemory };
  let parsedSoulGraph = null;
  if (cleanedMemory && Array.isArray(cleanedMemory.globalIdentity) && cleanedMemory.globalIdentity.length === 1) {
    try {
      parsedSoulGraph = JSON.parse(cleanedMemory.globalIdentity[0]);
      cleanedMemory.globalIdentity = []; // Clear escaped string for the LLM
    } catch (_) {}
  }

  const categoryInstruction = categoryKey
    ? `3. In "category_profiles_overwrite", output a completely cleaned, compressed, and deduplicated list of tastes ONLY for the category "${categoryKey}". Combine similar statements and remove all redundancy.`
    : `3. Do NOT output a "category_profiles_overwrite" object since this is the global "You" tab. Instead, compile/update the user's core identity into the "soul_graph" object.`;

  const categoryExample = categoryKey
    ? `"category_profiles_overwrite": { "${categoryKey}": ["Clean, compressed preference statement 1"] },`
    : `"soul_graph": {
        "demographics": { "stage_in_life": "young adult", "struggles": ["loneliness", "burnout"] },
        "emotional_resonances": { "comfort": 0.8, "melancholy": 0.9 },
        "aesthetic_affinities": { "slow-burn": 0.9, "character-driven": 1.0 },
        "creative_anchors": { "directors": { "Makoto Shinkai": 0.8 }, "studios": { "Shaft": 0.7 }, "authors": {}, "actresses": {} },
        "themes": { "love-and-loss": 0.9 },
        "tropes": { "time-travel": 0.8 },
        "pacing_preference": { "slow-burn": 0.9, "moderate": 0.5, "fast-paced": 0.2 },
        "guardrails": ["no BL", "no generic isekai"]
      },`;

  const systemPrompt = `
You are the Coda Profile Harmonizer.
Your job is to read the user's latest conversation in the "${tabName}" category, their current 'Living Memory', and their existing User Soul Graph, then produce a CLEAN, OVERWRITTEN, deduplicated profile.

CURRENT LIVING MEMORY (excluding global identity text):
${JSON.stringify(cleanedMemory, null, 2)}

EXISTING USER SOUL GRAPH (if any):
${parsedSoulGraph ? JSON.stringify(parsedSoulGraph, null, 2) : "None (this is a new profile or migration)"}

RULES:
1. OUTPUT is an OVERWRITE, not an append.
2. Consolidate ALL repetitive points.
${categoryInstruction}
4. When building/updating the "soul_graph", analyze the user's demographics, age, stage in life, and implicit emotional struggles. Set emotional resonances and aesthetic affinities with weights from 0.0 to 1.0. Appoint preferred directors, studios, and themes. Append guardrails as negative constraints.
5. If there is an existing soul graph, merge the new details into it, updating weights or adding new anchor keys organically, preserving their established profile.

Respond ONLY with a JSON object:
{
  ${categoryKey ? '' : '"soul_graph": { ... },'}
  ${categoryKey ? '' : categoryExample}
  ${categoryKey ? categoryExample : ''}
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
  const parsedResponse = JSON.parse(response);

  // If we generated a soul graph, serialize it into global_identity_overwrite as expected by the client
  if (!categoryKey && parsedResponse.soul_graph) {
    parsedResponse.global_identity_overwrite = [JSON.stringify(parsedResponse.soul_graph)];
    delete parsedResponse.soul_graph;
  }

  return parsedResponse;
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
    // 0. Check dedicated loved_titles array
    if (Array.isArray(currentMemory.loved_titles)) {
      for (const t of currentMemory.loved_titles) {
        if (t) lovedTitles.add(t);
      }
    }

    // Universal Regex to flexibly match "Loved: Title", "Highly values: Title (loved work)", etc.
    const titleRegex = /(?:Loved:|Highly values:)\s*(.*?)(?:\s*\(|$)/i;

    // 1. Check globalIdentity
    const globalIdentity = currentMemory.globalIdentity;
    if (Array.isArray(globalIdentity)) {
      for (const line of globalIdentity) {
        if (typeof line === 'string') {
          const match = line.match(titleRegex);
          if (match && match[1]) lovedTitles.add(match[1].trim());
        }
      }
    } else if (typeof globalIdentity === 'object' && globalIdentity !== null) {
      for (const line of Object.values(globalIdentity)) {
        if (typeof line === 'string') {
          const match = line.match(titleRegex);
          if (match && match[1]) lovedTitles.add(match[1].trim());
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
              const match = line.match(titleRegex);
              if (match && match[1]) lovedTitles.add(match[1].trim());
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
  const qdrantService = require('./qdrantService');
  
  // 1. Extract specifically marked Loved, Seen, and Watchlist titles directly
  const lovedTitles = extractLovedTitles(currentMemory);
  const seenTitles = Array.isArray(currentMemory.seen) ? currentMemory.seen : [];
  
  let watchlistTitles = [];
  if (currentMemory) {
    if (Array.isArray(currentMemory.watchlist)) {
      watchlistTitles = currentMemory.watchlist.map(item => item.title || item.Title).filter(Boolean);
    } else if (Array.isArray(currentMemory.watchlist_items)) {
      watchlistTitles = currentMemory.watchlist_items.map(item => item.title || item.Title).filter(Boolean);
    }
  }

  // Deduplicate and prioritize: Loved > Seen > Watchlist
  const uniqueTitles = new Set();
  for (const t of lovedTitles) { if (t) uniqueTitles.add(t); }
  for (const t of seenTitles) { if (t) uniqueTitles.add(t); }
  for (const t of watchlistTitles) { if (t) uniqueTitles.add(t); }

  const prioritizedTitles = Array.from(uniqueTitles);
  console.log("Prioritized media titles for harmonization research (Loved > Seen > Watchlist):", prioritizedTitles);
  
  // Limit to top 5 titles to avoid API / search rate limits
  let titlesToResearch = prioritizedTitles.slice(0, 5);
  
  // Fallback to LLM parser if empty
  if (titlesToResearch.length === 0 && currentMemory) {
    console.log("Prioritized list empty, falling back to LLM title extraction...");
    const fallbackTitles = await extractTitlesFromMemory(currentMemory);
    titlesToResearch = fallbackTitles.slice(0, 5);
  }

  // ── CHANGE 1: Media Brain First Lookup ────────────────────────────────────
  // For each loved title, try Qdrant first. It has rich structured enrichment.
  // Fall back to Yahoo only for titles not yet in the Brain.
  let researchContext = "";
  const mediaBrainHits = [];
  const yahooFallbackTitles = [];

  if (titlesToResearch.length > 0) {
    console.log(`[Soul Graph] Checking Media Brain for enriched titles: ${titlesToResearch.join(', ')}`);
    const brainLookups = await Promise.all(
      titlesToResearch.map(title => qdrantService.searchByTitle('media_brain', title))
    );

    titlesToResearch.forEach((title, idx) => {
      const brainResult = brainLookups[idx];
      if (brainResult && brainResult.semantic_description) {
        mediaBrainHits.push({ title, semantic_description: brainResult.semantic_description });
        console.log(`[Soul Graph] Media Brain HIT for "${title}" — using rich enrichment as primary fuel`);
      } else {
        yahooFallbackTitles.push(title);
        console.log(`[Soul Graph] Media Brain MISS for "${title}" — falling back to Yahoo`);
      }
    });

    // Build research context — Media Brain entries first (highest quality)
    if (mediaBrainHits.length > 0) {
      researchContext += `=== ENRICHED TITLES FROM MEDIA BRAIN (HIGHEST QUALITY — use these as primary fuel) ===\n\n`;
      for (const hit of mediaBrainHits) {
        researchContext += `Title: ${hit.title}\n${hit.semantic_description}\n\n---\n\n`;
      }
    }

    // Yahoo fallback for titles not yet in the Brain
    if (yahooFallbackTitles.length > 0) {
      console.log(`Researching themes and community feedback for: ${yahooFallbackTitles.join(', ')}`);
      try {
        const researchPromises = yahooFallbackTitles.map(title => researchMediaThemes(title));
        const researchResults = await Promise.all(researchPromises);
        if (researchResults.some(r => r)) {
          researchContext += `=== COMMUNITY RESEARCH (FALLBACK — titles not yet in Media Brain) ===\n\n`;
          yahooFallbackTitles.forEach((title, idx) => {
            researchContext += `Title: ${title}\nResearch:\n${researchResults[idx]}\n\n---\n\n`;
          });
        }
      } catch (e) {
        console.error("Error researching media themes during harmonization:", e);
      }
    }
  } else {
    researchContext = "No specific favorite titles mentioned yet.";
  }

  // ── CHANGE 2: Extract per-media categoryProfiles as high-confidence signals ──
  // These are things the user explicitly stated — not inferred from chat.
  const categoryProfiles = currentMemory?.categoryProfiles || {};
  let explicitDeclarationsBlock = '';
  const categoryEntries = Object.entries(categoryProfiles).filter(([, v]) => Array.isArray(v) && v.length > 0);
  if (categoryEntries.length > 0) {
    explicitDeclarationsBlock = `
=== EXPLICIT PER-MEDIA DECLARATIONS (HIGH CONFIDENCE — user stated these directly) ===
These are the user's own words about each media type they care about.
Treat these as FACTS, not inferences. Cross-reference them to find what's consistent across media types.
${categoryEntries.map(([cat, prefs]) => `${cat.toUpperCase()}: ${prefs.join(' | ')}`).join('\n')}
`;
  }

  const cleanedMemory = { ...currentMemory };
  // Remove categoryProfiles from the raw dump since we're surfacing it explicitly above
  delete cleanedMemory.categoryProfiles;
  
  let parsedSoulGraph = null;
  if (cleanedMemory && Array.isArray(cleanedMemory.globalIdentity) && cleanedMemory.globalIdentity.length === 1) {
    try {
      parsedSoulGraph = JSON.parse(cleanedMemory.globalIdentity[0]);
      cleanedMemory.globalIdentity = []; // Clear escaped string for LLM input
    } catch (_) {}
  }

  const systemPrompt = `
You are the Coda Profile Harmonizer.
Your job is to read the user's entire 'Living Memory', their existing User Soul Graph, and background research on their favorite media titles (which include their specifically marked LOVED works, seen works, and watchlist items).

You will perform a global harmonization pass across FOUR sources of truth, in priority order:
1. The explicit per-media declarations (highest confidence — user stated these directly)
2. The enriched Media Brain descriptions for their loved titles (highest quality aesthetic data)
3. The community research fallback (for titles not yet enriched)
4. The raw living memory and chat history (background inference)

RULES:
1. Decode the person: What are their demographics (life stage, age group), temperament, and core struggles?
2. Analyse Emotional Reaction Patterns: How do their emotional states, triggers, and psychological needs connect across categories?
3. ── CROSS-TITLE PATTERN EXTRACTION ──
   CRITICAL: Cross-reference ALL the loved title descriptions against each other.
   Find what RECURS across multiple titles — the same emotional frequency, the same visual world, the same character archetype, the same cultural gravity.
   Look for: recurring aesthetics, recurring emotional tones, recurring character types, recurring cultural worlds (e.g. Japanese underground, French New Wave), recurring structural patterns (slow-burn, non-linear, fragmented).
   WEIGHT THESE CROSS-TITLE OVERLAPS HIGHEST in the Soul Graph. A dimension that appears in 4 out of 5 loved titles is a core soul trait — score it 0.85-0.98.
   A dimension that only appears in 1 title should score much lower unless it was also explicitly declared.
4. ── WORLDVIEW & RELATIONAL SOUL ──
   Go beyond taste preferences. Try to understand:
   - How does this person relate to stories emotionally? What do they want to FEEL, not just watch?
   - What is their philosophical lens on life as revealed through their choices? (e.g. "sees beauty in brokenness", "drawn to the quiet tragedy in ordinary life", "believes in the redemptive power of human connection")
   - What character DYNAMICS and RELATIONSHIPS are they drawn to? Not just protagonist type — what is the relational pattern? (e.g. "the broken person slowly reached by someone who genuinely sees them", "complicated love that costs something", "found family built from broken people")
   - What do their choices say about how they see the world and their place in it?
   Encode these as specific, honest dimensions in the soul graph — NOT generic labels.
   A person who consistently loves stories about broken people being quietly saved by someone who sees them has a specific soul. Capture it.
5. Identify affinities for specific studios, directors, aesthetics, era preferences, and geographic contexts. You may infer adjacent studios/directors if they are an undeniable stylistic match for the user's specific profile (e.g. inferring Satoshi Kon for a user who loves surreal psychological anime), but DO NOT hallucinate mainstream creators for an underground taste profile. Be precise.
6. Compile/update the User Soul Graph JSON. If there is an existing soul graph, merge new details organically.
   - Smart Reinforcement vs. Expansion: Analyze if a new loved work reinforces existing dimensions (in which case, strengthen the weights of those existing dimensions, e.g., incrementing them slightly up to a maximum of 0.98).
   - If a new loved work introduces a completely new taste facet (e.g., a genre, theme, or creative anchor not previously highlighted in the graph), add it to the Soul Graph as a new dimension with a moderate starting weight (e.g., 0.65-0.75) instead of ignoring it or overwriting prior tastes.
   - Do not drop weights of unrelated existing tastes unless there is explicit negative evidence (like a guardrail or a rejected work/not_for_me feedback).
7. The Soul Graph schema is NOT rigid — add new keys to emotional_resonances, aesthetic_affinities, themes, tropes, and a new "relational_dynamics" section as needed. Be specific, not generic. E.g., prefer "quietly-saved-by-someone-who-sees-you" over "romance".

${explicitDeclarationsBlock}

BACKGROUND RESEARCH ON USER'S FAVORITE MEDIA WORKS:
${researchContext}

INPUT LIVING MEMORY (excluding categoryProfiles which is surfaced above):
${JSON.stringify(cleanedMemory, null, 2)}

EXISTING USER SOUL GRAPH (if any):
${parsedSoulGraph ? JSON.stringify(parsedSoulGraph, null, 2) : "None (this is a new profile or migration)"}

Respond ONLY with a JSON object:
{
  "soul_graph": {
    "demographics": {
      "stage_in_life": "guess life stage (e.g. college student, young professional, 18-year-old introspective)",
      "struggles": ["implicit/explicit struggles, e.g. navigating relationships, academic burnout, coping with grief"]
    },
    "emotional_resonances": {
      "Add as many specific emotional dimensions as you discover": 0.0-1.0
    },
    "aesthetic_affinities": {
      "Add as many specific aesthetic dimensions as you discover": 0.0-1.0
    },
    "creative_anchors": {
      "directors": { "Name": 0.0-1.0 },
      "studios": { "Name": 0.0-1.0 },
      "authors": { "Name": 0.0-1.0 },
      "composers": { "Name": 0.0-1.0 },
      "character_archetypes": { "e.g. psychologically-fractured-protagonist": 0.0-1.0 }
    },
    "themes": {
      "Add as many specific themes as you discover": 0.0-1.0
    },
    "tropes": {
      "Add as many specific tropes as you discover": 0.0-1.0
    },
    "relational_dynamics": {
      "e.g. quietly-saved-by-someone-who-sees-you": 0.0-1.0,
      "e.g. broken-person-reached-by-genuine-connection": 0.0-1.0
    },
    "worldview": {
      "e.g. sees-beauty-in-brokenness": 0.0-1.0,
      "e.g. believes-in-quiet-redemption": 0.0-1.0
    },
    "pacing_preference": {
      "slow-burn": 0.0-1.0,
      "moderate": 0.0-1.0,
      "fast-paced": 0.0-1.0
    },
    "guardrails": ["negative dealbreakers extracted from what they hate or avoid"],
    "coda_summary": "A visceral, highly-perceptive, beautifully written paragraph (3-4 sentences) summarizing the core of this user's emotional and aesthetic soul. Speak directly to them using 'You'. E.g. 'You are someone drawn to quiet redemptions...'"
  },
  "category_profiles_overwrite": {
    "category_name": ["Clean, refined preference statement 1"]
  }
}
`;


  const response = await callOpenAI([
    { role: 'system', content: systemPrompt }
  ], { type: "json_object" });

  const parsedResponse = JSON.parse(response);

  // ── FAIL 1 FIX: Keep Soul Graph as structured data, derive readable identity lines ──
  if (parsedResponse.soul_graph) {
    const sg = parsedResponse.soul_graph;
    
    // Store the beautiful summary as the ONLY item in globalIdentity so the frontend displays a single editable paragraph
    if (sg.coda_summary) {
      parsedResponse.global_identity_overwrite = [sg.coda_summary];
    } else {
      parsedResponse.global_identity_overwrite = ["I am still learning the shape of your soul."];
    }
    // soul_graph stays as a structured object — NOT deleted
  }

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
   - CRITICAL: If the user explicitly states they loved or hated this media and provides a reason, summarize their subjective review into ONE sentence and add it to "media_reflections_appends" (e.g. "[Media Name]: Loved the dark aesthetic but hated the slow pacing").
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
    "guardrails_appends": ["Any new negative dealbreakers if applicable"],
    "media_reflections_appends": ["One-sentence subjective review of this media if provided"],
    "seen_appends": ["Title of this media if they indicated they finished or saw it"],
    "not_for_me_appends": ["Title of this media if they explicitly hated or dropped it"]
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

const handleAskChat = async (memory, chatHistory, userMessage, watchlistOnly = false) => {
  const intro = [
    "Tell me what you're looking for. Your favorites, Something you can't stop thinking about.",
    "Something you wish you could experience again for the first time.",
    "Tell me how your day went. Tell me what you're feeling, or what you want to feel. Excited. Heartbroken. Curious. Lost. Comforted. Challenged. Anything.",
    "Just talk to me. I’ll find the one."
  ].join('\n\n');

  let systemPrompt = `
You are Coda. 
You are a close friend with impeccable, artistic taste in books, anime, movies, games, and music.
You are chatting with the user in the "Ask Coda" section to understand their current mood, craving, or general request, so you can recommend the perfect media work.

USER PROFILE CONTEXT:
- Core identity: ${JSON.stringify(memory.globalIdentity || [])}
- Category preferences: ${JSON.stringify(memory.categoryProfiles || {})}
- Guardrails: ${JSON.stringify(memory.guardrails || [])}

YOUR DIRECTIVE / FIRST MESSAGE (what you previously showed the user as an intro):
"${intro}"`;

  if (watchlistOnly) {
    systemPrompt += `\n\nCRITICAL WATCHLIST MODE RULE: The user has enabled "Watchlist Mode". You MUST restrict your recommendations strictly to items from their Watchlist (${JSON.stringify(memory.watchlist || [])}). Furthermore, when providing the recommendation, you MUST explicitly mention in your message that this pick was chosen from their watchlist.`;
  }

  systemPrompt += `\n\nYOUR JOB:
1. Converse naturally with the user. Answer their questions, validate their feelings/mood, and ask clarifying questions if needed.
2. Maintain a warm, artistic, friend-like, and casual tone. Avoid robotic assistant-speak.
3. CONVERSATION OVER NEW RECOMMENDATIONS:
   - Check the chat history for metadata tags like \`[System: Coda recommended the work: "Title" (Type)]\`.
   - If the user is asking questions about the recommended work (e.g., "why did you pick this?", "what is it about?", "who directed it?", or having a conversation about it), you MUST set "status": "chatting" and converse about that specific work.
   - Do NOT trigger a new recommendation (i.e., do NOT set "status": "success") when the user is discussing the current recommendation, unless they explicitly ask for a different recommendation or a new pick (e.g., "give me a different one", "recommend something else", "let's try another").
   - While you are banned from naming the pick in the chat text when first recommending it (Rule 6), you ARE allowed (and expected) to name and discuss the recommended work once the user has received it and is asking questions about it.
4. MEDIA MATCH ("Is this for me?"):
   - If the user explicitly asks if a specific title is a good fit for them (e.g., "Is Severance for me?", "Would I like Dune?", "Should I watch Cyberpunk?"):
     - Set "status": "match".
     - In "match_target", output the name of the media they are asking about (e.g., "Severance", "Dune", "Cyberpunk Edgerunners").
     - In "media_type", guess the media type based on the title (e.g., "tv", "movie", "anime").
5. NEW RECOMMENDATIONS:
    - If they describe a craving or look for recommendations:
      - If they specify a clear reference title (e.g., "recommend an anime like Interstellar" or "similar to Berserk") or a specific vibe, you DO have enough context. You MUST set "status": "success" immediately. Do NOT set "status": "chatting" to ask clarifying questions when they provide a clear title or vibe constraint.
      - If their query is extremely vague (e.g., just saying "recommend something" or "what should I watch") and you need more details to make a recommendation, set "status": "chatting" and ask for their preferences.
      - When setting "status": "success":
        - In "message", write your friendly conversational response explaining that you've found the perfect pick for them (max 2 sentences, e.g., "I know exactly what you need. Tap below to see the pick!").
        - In "media_type", output the category of the pick (must be one of: "anime", "movie", "tv", "visual novel", "book", "game", "youtube", "music"). NOTE: Anime movies, anime films, and anime OVAs/specials must ALWAYS be routed as "anime" (not "movie" or "tv") so they use the correct anime metadata sources.
        - In "recommendation_query", write a highly descriptive search query that captures their craving (e.g. "intricate time-travel anime with emotional romance like Steins Gate" or "slow-burn visual novel set in school with gothic tragedy"). This query will be used to scrape actual recommendation threads.
        - In "similar_to_title", if the user explicitly asks for recommendations similar to a specific media work (e.g., "something like Interstellar" or "manga similar to Berserk") with no complex modifiers, output the clean proper title of that reference work here (e.g., "Interstellar", "Berserk"). If they mention multiple titles, or if the similarity request contains complex modifiers/constraints that alter the vibe (e.g., "like Interstellar but more funny"), set this to null.
        - In "hard_constraints", output an array of strings representing any strict constraints the user mentioned (e.g., ["Android only", "eroge / adult content", "male protagonist with female heroines", "no NTR", "web browser only"]). If no strict constraints are requested, output an empty array [].
6. Banned: When first generating a recommendation (setting "status": "success"), do NOT name or recommend the pick directly in the chat text! Keep the title a surprise for the homescreen. Once the recommendation has been made and the user is asking questions about it, this ban no longer applies.

Respond ONLY with a JSON object in this format:
{
  "status": "chatting" | "success" | "match",
  "message": "Coda's friendly, conversational response (if chatting or success).",
  "media_type": null | "anime" | "movie" | "tv" | "visual novel" | "book" | "game" | "youtube" | "music",
  "match_target": null | "Specific Title to check",
  "recommendation_query": null | "descriptive search query here",
  "similar_to_title": null | "Title of reference media",
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
- Note: Users often write in lowercase without proper capitalization (e.g., 'obsession', 'steins gate', 'shutter island', 'slow west'). Use contextual clues like "watched...", "similar to...", "about...", "like...", "recommendations for..." to identify and extract these titles even if they are lowercase.
- Extract the clean, capitalized proper name of the title if possible (e.g. "Obsession" instead of "obsession").
- Return ONLY a JSON object containing an array of strings under the key "titles". If no titles are mentioned, return an empty array under the key "titles".

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

const generateDirectCandidates = async (masterDirective, seedTitles, mediaType, seen = [], notForMe = []) => {
  const prompt = `You are the Coda Candidate Generator. 
We need to generate a list of recommendations for a user.
Our web search indexing is temporarily unavailable, so you must generate candidate titles directly using your internal knowledge.

Media Type requested: "${mediaType}"
Master Directive: "${masterDirective}"
Seed Titles (titles the user likes or wants similar recommendations to): ${JSON.stringify(seedTitles)}

Excluded / already seen titles (DO NOT suggest these): ${JSON.stringify(seen)}
Rejected / "not for me" titles (DO NOT suggest these): ${JSON.stringify(notForMe)}

Your job:
1. Generate exactly 6 to 8 highly specific, high-quality, and up-to-date candidate titles of type "${mediaType}" that perfectly match the Master Directive and seed titles.
2. The titles MUST be the exact, clean official names of the individual works (e.g., "Inception", "Katawa Shoujo", "Steins;Gate").
3. DO NOT output any compilation names, franchise names, or titles in the excluded/rejected lists.

Respond with ONLY a JSON object:
{
  "candidates": ["Title 1", "Title 2", ...]
}`;

  try {
    const responseJson = await callOpenAI([
      { role: 'system', content: `You are a professional recommender system for ${mediaType}.` },
      { role: 'user', content: prompt }
    ], { type: 'json_object' });
    
    const parsed = JSON.parse(responseJson);
    return parsed.candidates || [];
  } catch (e) {
    console.error("[llmService] generateDirectCandidates failed:", e.message);
    return [];
  }
};

const generateUserSoulGraph = async (rawProfileText, currentSoulGraph = null) => {
  // If rawProfileText is a serialized JSON object, parse it directly (backward compatibility & speed)
  if (typeof rawProfileText === 'string') {
    try {
      const parsed = JSON.parse(rawProfileText);
      if (parsed && typeof parsed === 'object' && parsed.demographics) {
        console.log('[llmService] Core identity is already a valid Soul Graph JSON. Using it directly.');
        return parsed;
      }
    } catch (_) {}
  }

  const systemPrompt = `
You are the Coda User Soul Graph compiler.
Your job is to analyze the user's flat text profile data (which contains onboarding details, loved works, and specific tastes) and compile it into a structured User Soul Graph.

The User Soul Graph JSON schema is:
{
  "demographics": {
    "stage_in_life": "guess their age, occupation, or stage in life (e.g. college student, young professional, middle-aged parent) if implied",
    "struggles": ["implicit or explicit current struggles, emotional challenges, or psychological needs (e.g. loneliness, academic burnout, coping with grief, seeking nostalgic comfort) deduced from their taste and words"]
  },
  "emotional_resonances": {
    "term": 0.0-1.0  // e.g. "comfort": 0.8, "existential-reflection": 0.9, "melancholy": 0.8, "thrill-seeking": 0.3
  },
  "aesthetic_affinities": {
    "term": 0.0-1.0  // e.g. "gritty-realism": 0.9, "surrealism": 0.6, "retro-warmth": 0.5, "cel-animation": 0.8
  },
  "creative_anchors": {
    "directors": { "name": 0.0-1.0 },  // e.g. "Naoki Urasawa": 1.0, "Shunji Iwai": 1.0
    "studios": { "name": 0.0-1.0 },     // e.g. "Studio Shaft": 0.9, "Madhouse": 0.8
    "authors": { "name": 0.0-1.0 },
    "actresses": { "name": 0.0-1.0 }
  },
  "themes": {
    "theme_name": 0.0-1.0  // e.g. "moral-ambiguity": 0.9, "coming-of-age-isolation": 0.8, "cat-and-mouse": 0.9
  },
  "tropes": {
    "trope_name": 0.0-1.0  // e.g. "serial-killer": 0.8, "time-travel": 0.7, "unreliable-narrator": 0.9
  },
  "pacing_preference": {
    "slow-burn": 0.0-1.0,
    "moderate": 0.0-1.0,
    "fast-paced": 0.0-1.0
  },
  "guardrails": ["any negative constraints, must-haves, or dealbreaker tags (e.g. 'no generic isekai', 'no BL', 'clean content only')"]
}

Important Guidelines:
- Go deep! Analyze the themes, styles, and mood of the works they love. If they love Steins;Gate and Madoka Magica, they aren't just anime fans; they are drawn to high-stakes psychological tragedy, time-manipulation, and high emotional consequences.
- If they love sad Japanese movies, deduce that they seek emotional catharsis/reflection and might be going through a stage of life where quiet sadness is a comforting state of mind.
- Merge the new info with the current soul graph if provided, updating weights and appending new tags organically.

Respond with ONLY a valid JSON object matching the schema.
`;

  const userPrompt = JSON.stringify({
    raw_profile_text: rawProfileText,
    current_soul_graph: currentSoulGraph || {}
  }, null, 2);

  try {
    const responseJson = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error("[llmService] generateUserSoulGraph failed:", e.message);
    return currentSoulGraph || {};
  }
};

const extractMediaDNA = async (title, mediaType, rawScrapedContent) => {
  const systemPrompt = `
You are the Coda Media DNA Extractor.
Analyze the provided raw reviews, synopsis, and forum discussions for the media "${title}" (${mediaType}) and extract its structured semantic DNA.

The Media DNA JSON schema is:
{
  "title": "${title}",
  "media_type": "${mediaType}",
  "pacing": "slow-burn" | "moderate" | "fast-paced",
  "moods": {
    "mood_term": 0.0-1.0  // e.g. "bleak": 0.9, "tense": 0.8, "melancholic": 0.7, "nostalgic": 0.5
  },
  "themes": {
    "theme_term": 0.0-1.0 // e.g. "moral-ambiguity": 0.9, "obsession": 0.8
  },
  "tropes": {
    "trope_term": 0.0-1.0 // e.g. "serial-killer": 0.9, "detective-procedural": 0.8
  },
  "ideal_watch_context": {
    "weather": ["rainy", "snowy", "cloudy", "sunny", "any"],
    "time_of_day": ["morning", "afternoon", "evening", "late-night", "any"],
    "state_of_mind": ["reflective", "seeking-comfort", "bored-seeking-thrills", "exhausted", "any"],
    "viewing_mode": ["solitary", "social", "any"]
  },
  "aesthetic_markers": ["gritty realism", "low key lighting", "late 90s aesthetic"],
  "creative_credits": {
    "directors": [],
    "studios": [],
    "authors": [],
    "cast": []
  }
}

Respond with ONLY a valid JSON object matching the schema.
`;

  const userPrompt = JSON.stringify({
    title,
    media_type: mediaType,
    scraped_content: typeof rawScrapedContent === 'string' ? rawScrapedContent.slice(0, 15000) : JSON.stringify(rawScrapedContent).slice(0, 15000)
  }, null, 2);

  try {
    const responseJson = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error(`[llmService] extractMediaDNA failed for "${title}":`, e.message);
    return null;
  }
};

const generateUserSemanticTags = async (soulGraph, activeCraving, sessionContext) => {
  const systemPrompt = `
You are the Coda User Tag Generator.
Your job is to read the user's persistent User Soul Graph and their active session craving/context, and generate a list of Fluid User Semantic Tags for this recommendation session.

These tags should NOT be strict keywords (like "action" or "slice-of-life"). They MUST be fluid, natural-language phrases, metadata details, or descriptive statements that capture the user's taste across:
- Core theme setups (e.g., "story where the protagonist is isolated and seeks connection")
- Specific creator anchors (e.g., "Makoto Shinkai", "Studio Shaft style")
- Era and origin (e.g., "2000s anime", "translated Japanese mystery novel")
- Aesthetic vibes (e.g., "rainy melancholic atmosphere", "highly stylized visual edits")
- Pacing preference (e.g., "slow burn character exploration")

Include exactly 8 to 12 distinct fluid tags. Some should be static core tags from the Soul Graph (demographics, struggles, creative anchors, themes), and some should be dynamic tags reflecting the active session craving and context (mood, time of day).

Respond with ONLY a JSON object:
{
  "user_tags": [
    "movie where the mc is down on his luck and then a perfect girl comes and saves him",
    "Makoto Shinkai",
    "2000s",
    "Japanese",
    "melancholic rain-slicked atmosphere",
    ...
  ]
}
`;

  const userPrompt = JSON.stringify({
    soul_graph: soulGraph,
    active_craving: activeCraving,
    session_context: sessionContext
  }, null, 2);

  try {
    const responseJson = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { type: 'json_object' });
    const parsed = JSON.parse(responseJson);
    return parsed.user_tags || [];
  } catch (e) {
    console.error("[llmService] generateUserSemanticTags failed:", e.message);
    return [];
  }
};

const compileMediaTags = (mediaDNA) => {
  const tags = new Set();
  
  if (!mediaDNA) return [];

  // Pacing
  if (mediaDNA.pacing) {
    tags.add(`${mediaDNA.pacing} pacing`);
  }

  // Moods
  if (mediaDNA.moods && typeof mediaDNA.moods === 'object') {
    Object.keys(mediaDNA.moods).forEach(mood => {
      tags.add(mood);
    });
  }

  // Themes
  if (mediaDNA.themes && typeof mediaDNA.themes === 'object') {
    Object.keys(mediaDNA.themes).forEach(theme => {
      tags.add(theme);
    });
  }

  // Tropes
  if (mediaDNA.tropes && typeof mediaDNA.tropes === 'object') {
    Object.keys(mediaDNA.tropes).forEach(trope => {
      tags.add(trope);
    });
  }

  // Aesthetic Markers
  if (Array.isArray(mediaDNA.aesthetic_markers)) {
    mediaDNA.aesthetic_markers.forEach(marker => {
      tags.add(marker);
    });
  }

  // Creative Credits
  if (mediaDNA.creative_credits && typeof mediaDNA.creative_credits === 'object') {
    const cc = mediaDNA.creative_credits;
    if (Array.isArray(cc.directors)) cc.directors.forEach(d => tags.add(d));
    if (Array.isArray(cc.studios)) cc.studios.forEach(s => tags.add(s));
    if (Array.isArray(cc.authors)) cc.authors.forEach(a => tags.add(a));
    if (Array.isArray(cc.cast)) cc.cast.forEach(c => tags.add(c));
  }

  // Format and country origin
  if (mediaDNA.media_type) {
    tags.add(mediaDNA.media_type);
  }
  
  return Array.from(tags);
};

const computeSemanticOverlap = async (userTags, mediaTags, guardrails) => {
  const systemPrompt = `
You are the Coda Tag Overlap Scorer.
Your job is to evaluate the semantic and conceptual compatibility between a user's taste tags/cravings (User Semantic Tags) and a candidate media's tags (Media Semantic Tags).

Both sets of tags contain fluid, natural-language phrases, metadata, and descriptions (e.g. plot details, aesthetic vibes, directors, years).
You must analyze the two lists and compute a compatibility score out of 100 based on:
1. **Thematic & Plot Alignment (40%)**: Conceptual overlap between plot setups, tropes, themes, and moods. Do not require exact word matches; recognize semantic sibling concepts (e.g., "tragic romance" and "sad parting" overlap).
2. **Creative & Style Alignment (30%)**: Matches on directors, studios, and visual/pacing style descriptions.
3. **Era & Origin Fit (30%)**: Alignment on country of origin, year/decade, and format.

**GUARDRAILS (CRITICAL)**:
- Scan the guardrails array: ${JSON.stringify(guardrails)}.
- If the candidate's tags explicitly violate any of the negative guardrails (e.g. contains "BL" when guardrails say "no BL", or contains "isekai" when guardrails say "no generic isekai"), you MUST set the final score to 0.

Respond with ONLY a JSON object:
{
  "score": 0-100,
  "overlapping_concepts": ["matching concept 1", "matching concept 2"],
  "alignment_breakdown": {
    "thematic_alignment": "brief notes on plot/mood alignment",
    "creative_alignment": "brief notes on style/director/studio alignment",
    "context_alignment": "brief notes on era/origin alignment"
  },
  "verdict": "A brief explanation of why this matches or does not match their taste profile."
}
`;

  const userPrompt = JSON.stringify({
    user_tags: userTags,
    media_tags: mediaTags
  }, null, 2);

  try {
    const responseJson = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error("[llmService] computeSemanticOverlap failed:", e.message);
    return {
      score: 50,
      alignment_breakdown: { thematic_alignment: "Error", creative_alignment: "Error", context_alignment: "Error" },
      verdict: "Failed to compute overlap due to API error."
    };
  }
};

const evaluateCandidateResonance = async (soulGraph, mediaDNA, sessionContext) => {
  try {
    // 1. Generate User Session Tags
    const activeCraving = sessionContext.mood || "reflective";
    const userTags = await generateUserSemanticTags(soulGraph, activeCraving, sessionContext);
    console.log(`[Resonance Scorer] Generated user session tags: ${JSON.stringify(userTags)}`);

    // 2. Compile Media Tags
    const mediaTags = compileMediaTags(mediaDNA);
    console.log(`[Resonance Scorer] Compiled media tags for "${mediaDNA.title}": ${JSON.stringify(mediaTags)}`);

    // 3. Compute Semantic Overlap
    const guardrails = soulGraph.guardrails || [];
    const overlap = await computeSemanticOverlap(userTags, mediaTags, guardrails);
    console.log(`[Resonance Scorer] 🔍 "${mediaDNA.title}" resonance score: ${overlap.score}/100 - Verdict: ${overlap.verdict}`);
    
    return {
      score: overlap.score,
      alignment_breakdown: overlap.alignment_breakdown,
      verdict: overlap.verdict
    };
  } catch (err) {
    console.error(`[llmService] evaluateCandidateResonance failed:`, err.message);
    return { score: 50, verdict: "Error evaluating resonance." };
  }
};

const synthesizeTargetSessionDNA = async (soulGraph, localContext, activeCraving) => {
  const systemPrompt = `
You are the Coda Session DNA Synthesizer.
Analyze the user's User Soul Graph, active local context (time, weather, mood), and immediate craving to generate a specific "Target DNA Profile" for this session's recommendation.

Respond with ONLY a JSON object:
{
  "target_moods": ["mood1", "mood2"],
  "target_themes": ["theme1", "theme2"],
  "target_pacing": "slow-burn" | "moderate" | "fast-paced",
  "ideal_context": {
    "weather": "weather condition",
    "time_of_day": "time condition",
    "state_of_mind": "state of mind condition"
  },
  "session_directive": "A 2-sentence summary of the exact vibe we are hunting for right now."
}
`;

  const userPrompt = JSON.stringify({
    soul_graph: soulGraph,
    local_context: localContext,
    active_craving: activeCraving
  }, null, 2);

  try {
    const responseJson = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error("[llmService] synthesizeTargetSessionDNA failed:", e.message);
    return null;
  }
};

const generateMediaDescription = async (mediaData) => {
  const systemPrompt = `
You are the Coda Media Librarian. Your job is to perform a deep, exhaustive psychological and aesthetic extraction of a piece of media to power our "Media Brain" vector database.

You will receive a JSON object with:
- title + media_type: what the work is
- structured_data: genre tags, synopsis, studio/director/author info, ratings, release year, cast, and country of origin.
- community_snippets: real text from reviews and forum discussions by actual fans

Your job is to synthesize this into a highly structured JSON object capturing every "face" of the media.
Do NOT just use single words. Write dense, descriptive, emotionally honest sentences that truly capture the atmosphere and soul of the work. You MUST capture the deep lore, setting, subculture, and pacing dynamics.

Extract these exact 12 fields (as detailed string values):
1. "metadata_synthesis": The country/region (Japanese, Korean, etc.), release year, director/author, and studio, woven into a short cultural context.
2. "setting_and_subculture": The physical and cultural setting of the media. BE EXPLICIT. (e.g., "Early 2010s Akihabara otaku culture", "Late 1960s Tokyo student protests", "A dystopian cyberpunk slum").
3. "visual_tone_and_feel": Deeply describe the aesthetic, visual tone, and feel (e.g., gritty, neon-drenched, cozy, muted, surreal). Capture the actual atmosphere and vibe, not just a single word.
4. "media_era_tone": The cultural footprint and era (e.g., gritty 90s detective, early 2000s cyber-angst).
5. "pacing_and_structure": How the pacing structurally functions. Be specific about pacing shifts! (e.g., "A slow slice-of-life start designed to build deep character attachment before rapidly escalating into a high-stakes psychological thriller").
6. "atmosphere_and_mood": The overarching mood and emotional weather (e.g., suffocating tension, dreamlike and melancholic, fast-paced and chaotic).
7. "themes_and_messages": What the media actually conveys, the underlying psychological or philosophical messages.
8. "character_relationships": The interpersonal dynamics. Romantic dynamics, toxic vs healing, found-family, supporting cast dynamics.
9. "lead_character_type": Who is the protagonist? (e.g., an unreliable narrator, burnt-out detective, overly optimistic dreamer).
10. "story_and_plot_type": The narrative structure (e.g., non-linear mystery, character-study, epic sprawling journey).
11. "who_and_when": The Viewing Context. Do not be too direct (don't say "Watch this when..."). Instead, describe "the type of soul this should be for" and the specific life situation or emotional state (e.g., "For a soul feeling completely lost in their early 20s," or "For someone mourning a missed connection late at night.").
12. "emotional_evocation": A raw, visceral description of what this media actually does to a person emotionally, drawn directly from the human consensus in the community snippets. Not an academic description, but the actual feeling it provokes (e.g., "Leaves you feeling utterly hollow and staring at the ceiling for an hour," or "A warm, healing blanket of a story that makes you appreciate the little things in life.").

Return ONLY a JSON object with these 12 exact keys.
`;

  const userPrompt = JSON.stringify(mediaData, null, 2);

  const groq = getGroqClient();
  const response = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" }
  });

  const responseJson = response.choices[0]?.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(responseJson);
  } catch(e) {
    parsed = { error: "Failed to parse JSON" };
  }

  const stockGenres = mediaData.structured_data?.genres ? mediaData.structured_data.genres.join(', ') : 'None';
  const stockTags = mediaData.structured_data?.tags ? mediaData.structured_data.tags.join(', ') : 'None';
  const stockRelease = mediaData.structured_data?.release_year || 'Unknown';

  // Flatten the rich JSON into a dense string payload for the embedding
  const semanticDescription = `
[Stock Metadata]: Genres: ${stockGenres} | Tags: ${stockTags} | Release: ${stockRelease}
[Metadata & Cultural Context]: ${parsed.metadata_synthesis || ''}
[Setting & Subculture]: ${parsed.setting_and_subculture || ''}
[Visual Tone & Feel]: ${parsed.visual_tone_and_feel || ''}
[Media Era Tone]: ${parsed.media_era_tone || ''}
[Pacing & Structure]: ${parsed.pacing_and_structure || ''}
[Atmosphere & Mood]: ${parsed.atmosphere_and_mood || ''}
[Themes & Messages]: ${parsed.themes_and_messages || ''}
[Character Relationships]: ${parsed.character_relationships || ''}
[Lead Character Type]: ${parsed.lead_character_type || ''}
[Story & Plot Type]: ${parsed.story_and_plot_type || ''}
[Who & When (The Soul Match)]: ${parsed.who_and_when || ''}
[Emotional Evocation (Consensus)]: ${parsed.emotional_evocation || ''}
  `.trim();

  return semanticDescription;
};

const synthesizeSearchBrief = async (soul, requestedMediaType) => {
  // Extract the structured Soul Graph if available — surface float weights explicitly
  const soulGraph = soul.permanent_soul?.soul_graph || null;
  const soulGraphSection = soulGraph ? `
SOUL GRAPH (structured weighted dimensions):
${JSON.stringify(soulGraph, null, 2)}

BALANCE EXPLOITATION AND EXPLORATION:
While the user's highest-scoring dimensions represent their core tastes, do NOT exclusively target the absolute highest-scoring dimensions on every run. Look for interesting "cross-sections" or less-frequently targeted combinations in the graph (e.g., combining a highly rated emotional resonance with a medium-rated aesthetic affinity, director, author, or trope). Blend familiar emotional depths with novel contexts and settings.
` : '';

  // ── Surface recently targeted vibes so the LLM drifts away from them ──
  const recentVibes = soul.transient_memory?.recentVibes || [];
  const rotationSection = recentVibes.length > 0 ? `
INSTRUCTION FOR VARIETY (ROTATION):
To avoid repeating similar setups, steer away from the exact vibe focuses and tropes targeted in recent runs.
RECENTLY TARGETED VIBES (AVOID SUBSTANTIALLY REPEATING THESE EXACT ANGLES):
${recentVibes.map((v, i) => `${i + 1}. ${v}`).join('\n')}

GUIDELINES FOR VARIETY WITH SOUL-GROUNDING:
1. Always stay grounded in the user's Soul Graph and core tastes. Never fabricate random genres, eras, or settings that are completely alien to their profile.
2. For variety, rotate to a *different facet* of their taste profile, or combine their core interests in a novel way. E.g., if we recently did modern romantic dramas, try a retro slice-of-life, a bittersweet coming-of-age, or a quiet psychological mystery that also features their preferred emotional resonances.
3. Do not over-rotate into completely unrelated genres (like high-octane action, survival horror, or hard sci-fi) if the user has no history of liking them. Variety should feel like a fresh, authentic extension of their identity, not a random leap.
` : '';

  // ── "THE NOW" CONTEXT (DJ Logic) ──
  const contextualState = soul.transient_memory?.contextualState || null;
  const nowContextSection = ''; /* contextualState ? `
CURRENT CONTEXT ("THE NOW"):
- Time/Environment: ${contextualState.timeOfDay || 'Unknown'}
- Current Mood: ${contextualState.currentMood || 'Unknown'}
- Recent Chat Context: ${contextualState.recentChatContext || 'None'}

CRITICAL INSTRUCTION (DJ LOGIC):
You are an opinionated, tasteful media companion. You have access to "The Now" context above. 
However, DO NOT completely abandon the user's permanent Soul Graph. "The Now" should only *gently skew or tint* the recommendation. 
For example, if it is morning, you might look for a facet of their soul that is slightly lighter or more contemplative, but still deeply authentic to their core taste. If the current mood is unknown, rely entirely on their Soul Graph.
` : ''; */

  const systemPrompt = `
You are the Coda Recommendation Brain.
The user is asking for a recommendation in the category: "${requestedMediaType}".

Review their Permanent Soul Identity, their Transient Session Memory (recent context/cravings), and their Soul Graph.
${nowContextSection}

CRITICAL: TASTE-ALIGNED NOVELTY & EXPLORATION
Coda is not a generic query engine that returns the most obvious classic/mainstream matches of the user's favorite works. Your goal is to help them discover "new media but for their tastes" — hidden gems, underrated masterpieces, or less obvious works that share the same psychological/emotional core but differ in setting, style, or genre.
- Avoid clichés: Do NOT generate a search brief that is a thinly veiled description of a famous title they already love (e.g. do not just describe the plot of Steins;Gate or Anohana).
- Drive variety: Weave together different aspects of their soul graph, deliberately exploring creative anchors (directors, authors, studios) or themes that have been underserved.

Your job has THREE distinct steps:

STEP 1 — DECLARE a selected_vibe_focus:
Choose ONE specific facet, feeling, or atmosphere to consciously target from this user's totality. Be specific and evocative. Examples of good declarations:
- "A dreamy existential thriller from 2000s Japan with beautiful emotional underpinning and a psychologically fractured protagonist"
- "A warm found-family slice-of-life with a bittersweet ending that quietly guts you"
- "A melancholic, slow-burn mystery drama set in a rainy coastal town focusing on grief and quiet recovery"
This declared facet must be authentic to the user's soul, AND appropriate for "The Now". It can draw from:
- Their highest-scoring soul graph dimensions that DO NOT clash with their current mood/time.
- Their current transient recentContext if active (PRIORITY — honour this first if present).
- An underserved facet of their profile to add variety.
${rotationSection}
DO NOT always target the same cluster — deliberately drift across the full totality of the user's profile, but ensure every vibe focus remains strictly grounded in their authentic tastes (i.e. do not choose random genres or themes that are completely unsupported by their profile).

STEP 2 — DECLARE aesthetic anchors (this is Coda's editorial judgment call):
Before writing the search brief, lock in specific concrete anchors that ground the recommendation in a real aesthetic space. Think like a knowledgeable friend who knows exactly what they're recommending. Declare:
- era: a specific decade or period (e.g. "late 90s", "early 2000s", "2010s", or leave empty if not relevant). Avoid forcing very old retro eras (like 1970s or older) unless the user's profile explicitly suggests it.
- cultural_origin: a specific country/culture (e.g. "Japanese", "American/Western", or leave empty/broad). Do NOT choose foreign-language or obscure cultures (like French or Iranian) unless the user's soul graph or history shows a clear preference for them.
- visual_style: a specific visual or tonal quality (e.g. "soft, dreamlike, film-grain", "cold neon-drenched", "raw handheld intimacy", "lush and saturated")
- genre_footprint: a specific genre or subgenre footprint (e.g. "quiet domestic drama", "90s detective noir", "psychological coming-of-age", "surrealist literary adaptation")
- style_adjacency: a specific creator, trope, movement, or feeling this should feel adjacent to (e.g. "Murakami-esque", "90s cyberpunk underground", "the 'manic pixie dream girl' trope flipped on its head"). DO NOT hardcode this to a creator unless it fits. Let Coda judge what the best adjacency anchor is for this specific vibe.
These anchors must be honest and specific. If an anchor isn't clear from the user's profile, leave it as an empty string rather than guessing.

STEP 3 — WRITE the search_brief:
A structured, literal search query designed to map precisely to a specific vector in the database. DO NOT write a flowery, poetic, or marketing-style paragraph (e.g., avoid "weaves a whimsical tale" or "captivating exploration"). 

This text will be embedded as a vector to search the Media Brain. The Media Brain maps semantics based on literal tropes, themes, and concrete descriptors. If your brief is full of generic adjectives, it will create a "muddy" vector that accidentally pulls in completely unrelated or inappropriate genres just because they share flowery adjectives.

CRITICAL RULES FOR THE BRIEF:
- SURGICAL & LITERAL: State exactly what the work is, its themes, plot focus, and tone directly.
- AVOID "ADJECTIVE SOUP": Do NOT use words like "poignant", "whimsical", "captivating", "beautiful", or "heart-wrenching" excessively. Use concrete nouns and direct tropes.
- FORMAT: Write it as a dense block of clear parameters (e.g. "A Japanese 2010s psychological drama. Themes: existential dread, isolation. Plot focus: a protagonist navigating a strange urban landscape while dealing with the burden of memory. Tone: melancholic, slow-burn, gritty realism. Relational dynamic: found-family built from broken people.").
- Do NOT mention the user. Describe the media itself.
- Ensure the brief is specific enough that it firmly anchors the search in the correct thematic space, eliminating generic noise or unrelated mature content that might share vague adjectives.
${soulGraphSection}

Return ONLY a JSON object:
{
  "selected_vibe_focus": "The declared facet",
  "aesthetic_anchors": {
    "era": "",
    "cultural_origin": "",
    "visual_style": "",
    "genre_footprint": "",
    "style_adjacency": ""
  },
  "search_brief": "The dense, opinionated specimen paragraph here"
}
`;


  const userPrompt = JSON.stringify(soul, null, 2);

  const responseJson = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { type: 'json_object' });

  const parsed = JSON.parse(responseJson);
  const anchors = parsed.aesthetic_anchors || {};
  
  const anchorParts = [];
  if (anchors.era) anchorParts.push(`[Era: ${anchors.era}]`);
  if (anchors.cultural_origin) anchorParts.push(`[Origin: ${anchors.cultural_origin}]`);
  if (anchors.visual_style) anchorParts.push(`[Style: ${anchors.visual_style}]`);
  if (anchors.genre_footprint) anchorParts.push(`[Genre: ${anchors.genre_footprint}]`);
  
  const anchorString = anchorParts.length > 0 ? anchorParts.join(' ') + ' ' : '';
  const injectedBrief = `${anchorString}${parsed.search_brief || ''}`.trim();

  return {
    selected_vibe_focus: parsed.selected_vibe_focus || '',
    aesthetic_anchors: anchors,
    search_brief: injectedBrief
  };
};


const evaluateCandidates = async (candidates, soul, selectedVibeFocus = '') => {
  const vibeFocusSection = selectedVibeFocus
    ? `\nDECLARED VIBE FOCUS FOR THIS RUN: "${selectedVibeFocus}"\nThis is the specific facet you are targeting today. All candidates must be judged primarily against this declared focus. Your top pick MUST honour this focus. Ground the pitch in how this title delivers this exact feeling.`
    : '';

  // Pull the user's loved works from the soul for comparison logic
  const lovedWorks = [];
  try {
    const llmSvc = require('./llmService');
    if (llmSvc.extractLovedTitles) {
      const merged = { ...(soul.permanent_soul || {}), ...(soul.transient_memory || {}) };
      lovedWorks.push(...llmSvc.extractLovedTitles(merged));
    }
  } catch(e) {}
  const lovedWorksSection = lovedWorks.length > 0
    ? `\nUSER'S KNOWN LOVED WORKS: ${lovedWorks.join(', ')}`
    : '';

  const contextualState = soul.transient_memory?.contextualState || null;
  const nowContextSection = contextualState ? `
CURRENT AMBIENT CONTEXT ("THE NOW"):
- ${contextualState}
` : '';

  const recentContext = soul.transient_memory?.recentContext || null;
  const blurbRule = recentContext
    ? `CRITICAL: Since the user specifically asked for "${recentContext}", the coda_blurb MUST serve as a direct, contextual answer to their request (e.g. "Since you wanted something to make you cry, I promise you'll be staring at the ceiling after this one.").`
    : `CRITICAL: The coda_blurb MUST sound like a human text message from a friend. DO NOT use flowery openers like "A haunting..." or "A surreal...". DO NOT fall into the trap of starting every blurb with "You'll...". Use extreme unpredictability in your tone. Sometimes say "Trust me on this one." Sometimes: "Don't watch this unless you're ready." Sometimes: "I have a feeling you'll adore this." Sometimes: "This is one of those films people spend years chasing again." Sometimes: "I almost didn't recommend this... but I think you're exactly the right person." Keep it wildly unpredictable and alive.`;

  const guardrails = soul.permanent_soul?.guardrails || [];
  const safetyInstructions = typeof buildDynamicGuardrailInstructions === 'function' ? buildDynamicGuardrailInstructions(guardrails) : '';
  const guardrailsSection = guardrails.length > 0
    ? `\nSTRICT USER GUARDRAILS (DO NOT VIOLATE THESE): ${JSON.stringify(guardrails)}${safetyInstructions}\nCRITICAL: Any candidate that violates these guardrails MUST be instantly disqualified. You MUST NOT select it as a top pick or runner up.`
    : '';

  const systemPrompt = `
You are the Coda Editorial Director.
You have ${candidates.length} media candidates from the vector database, the user's Soul Identity, and their current Active State.
${vibeFocusSection}
${lovedWorksSection}
${nowContextSection}
${guardrailsSection}

PRIORITY ORDER for evaluation:
1. FIRST: Honour the user's Transient recentContext if active — this overrides permanent preferences.
2. SECOND: Ensure the candidate is deeply aligned and grounded in the user's Permanent Soul (their core values, emotional resonances, and aesthetic preferences). NEVER pick something that is completely alien or contrary to their profile.
3. THIRD: Among the grounded candidates, select the one that best captures the declared vibe focus for this run. Ground the pitch in how this title delivers this exact feeling.
4. FOURTH: Apply guardrails as hard disqualifiers.

Each candidate's "semantic_description" contains these labelled sections — use them to ground your evaluation:
- [Emotional Evocation]: the raw emotional truth of how this work actually makes people feel
- [Who & When]: the life situation and emotional state it's best suited for
- [Atmosphere & Mood], [Visual Tone & Feel], [Pacing & Structure]: the aesthetic fingerprint

── PITCH RULES (for top_pick pitch_paragraphs) ──
- Write 2-3 paragraphs as a passionate friend who has personally consumed this work
- SOUL CONNECTION RULE: DO NOT just write a flowery summary of the plot. Your entire goal is to speak directly to the user and explain exactly WHY this media is their soul and why it is for THEM. Use their Soul Graph to explicitly bridge the gap between their deep psychological traits and what this media offers.
- CONTEXTUALIZATION RULE: If there is an active Transient recentContext (i.e. the user just asked for something specific), you MUST explicitly connect the pitch to their exact request. Bridge the gap between their craving and why this media fulfills it.
- "SHOW, DON'T TELL" AMBIENT CONTEXT RULE: If "THE NOW" context is provided (e.g. "Late Night"), use it to silently shape the tone and words of your pitch. Do NOT explicitly mention the time or weather (e.g. do not say "Since it is night time..."). Instead, select vocabulary and highlight themes that naturally match that ambient atmosphere.
- Use [Emotional Evocation] and [Who & When] from the candidate data to ground the pitch in real emotional truth — not generic praise
- COMPARISON RULE: DO NOT mention any of the user's loved works unless there is an overwhelming, undeniable link (e.g. same creator, direct spiritual successor, or exact same very niche subgenre). If the connection is merely "they both have great worldbuilding" or "they are both sad", REMAIN COMPLETELY SILENT about the loved works. Pitch the work on its own standalone merits. Forced connections ruin the magic.
- Dark / Psychological / Horror works: Do not automatically filter out works with dark, psychological, or horror elements if they align with the user's taste for psychological/character depth (like their affinity for works like Aoi Bungaku, Higurashi, or Kara no Shoujo). However, avoid recommending cheap/generic jump-scare horror, pure gore, or slasher films that lack emotional resonance or introspective character drama.
- BANNED WORDS (any variation): "resonate", "narrative", "themes", "vibe", "explore", "element", "aspect", "profound", "delve", "aligns", "complexity", "emotional depth", "character-driven", "thematic"
- No critic jargon. Talk about specific characters, moments, and feelings — not abstract qualities.

Also write a "coda_blurb" for the top_pick AND each runner_up: one punchy, conversational sentence (max 8 words) as a personal conviction.
CRITICAL: YOU ABSOLUTELY MUST INCLUDE the "coda_blurb" string in your JSON output for both the top pick and runner ups.
${blurbRule}

Return ONLY a JSON object:
{
  "top_pick": {
    "id": "uuid of the selected candidate",
    "coda_blurb": "One punchy sentence max 8 words",
    "pitch_paragraphs": ["Paragraph 1", "Paragraph 2"]
  },
  "runner_ups": [
    {
      "id": "uuid of runner up 1",
      "coda_blurb": "One punchy sentence max 8 words"
    },
    {
      "id": "uuid of runner up 2",
      "coda_blurb": "One punchy sentence max 8 words"
    }
  ]
}
`;

  const userPrompt = JSON.stringify({
    user_soul: soul,
    candidates: candidates.map(c => ({
      id: c.id,
      title: c.payload.title,
      media_type: c.payload.media_type,
      genres: c.payload.genres,
      semantic_description: c.payload.semantic_description
    }))
  }, null, 2);

  const responseJson = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], {
    type: "json_schema",
    json_schema: {
      name: "evaluate_candidates_schema",
      schema: {
        type: "object",
        properties: {
          top_pick: {
            type: "object",
            properties: {
              id: { type: "string" },
              coda_blurb: { type: "string" },
              pitch_paragraphs: { type: "array", items: { type: "string" } }
            },
            required: ["id", "coda_blurb", "pitch_paragraphs"],
            additionalProperties: false
          },
          runner_ups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                coda_blurb: { type: "string" }
              },
              required: ["id", "coda_blurb"],
              additionalProperties: false
            }
          }
        },
        required: ["top_pick", "runner_ups"]
      }
    }
  });

  return JSON.parse(responseJson);
};

const evaluateMatch = async (candidate, soul, vectorSimilarity = null) => {
  let similarityGuidance = "";
  if (vectorSimilarity !== null) {
    similarityGuidance = `
MATHEMATICAL TASTE SPACE CHECK (FENCE):
- Cosine Similarity Score: ${vectorSimilarity.toFixed(4)}
(Guidance Context: This represents the mathematical similarity between the user's permanent taste center—their soul text + loved centroid—and this media in vector space. A score >= 0.75 indicates the media is mathematically close to their taste cluster (inside their taste fence). A score <= 0.70 indicates it is distant (outside their taste fence). Use this score to ground your verdict. If the score is low, note that it's outside their usual tastes/comfort zone but explain why it might still be interesting or why they should pass.)
`;
  }

  const systemPrompt = `
You are Coda. You are performing a "Vibe Check" to see if a specific media candidate is a good match for the user.
You have the candidate's metadata and the user's Soul Identity.

Your job is to provide a highly conversational, punchy "conviction statement" about whether this is a good fit, and a boolean "is_match".
1. Look at their structured Soul Graph (specifically emotional resonances, aesthetic affinities, themes, tropes, creative anchors), global identity, guardrails, and category profiles.
2. Compare them against the candidate's semantic description and genres.
3. If it hits a hard guardrail, "is_match" is false, and the statement should warn them off gently but firmly (e.g. "Knowing how much you hate slow-burn pacing, I'd say pass on this one.").
4. If it's a great match, "is_match" is true, and the statement should be extremely confident (e.g. "There is a 95% chance you will be completely obsessed with this.").
5. If it's borderline, make a call. If you think it's worth trying, true. If not, false.
6. Use the mathematical similarity score (if provided) to help guide your verdict.
7. The conviction statement MUST be human-like, 1-2 sentences maximum. Do not give a literal breakdown, just the conclusion as a friend.

Return ONLY a JSON object:
{
  "is_match": true | false,
  "conviction_statement": "Your 1-2 sentence statement here."
}
`;

  const userPrompt = JSON.stringify({
    user_soul: soul,
    vector_guidance: similarityGuidance || undefined,
    candidate: {
      title: candidate.payload.title,
      media_type: candidate.payload.media_type,
      genres: candidate.payload.genres,
      semantic_description: candidate.payload.semantic_description
    }
  }, null, 2);

  const responseJson = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { type: 'json_object' });

  return JSON.parse(responseJson);
};

const fallbackAskChat = async (memory, chatHistory, userMessage, specificAsk) => {
  const soulDump = JSON.stringify(memory, null, 2);
  const historyDump = chatHistory.map(m => `${m.isUser ? 'User' : 'Coda'}: ${m.text}`).join('\n');

  const systemPrompt = `
You are Coda, a deeply knowledgeable, opinionated, and highly articulate media companion.
The user asked about a specific media title: "${specificAsk}".
Our internal Media Brain database is temporarily unreachable or the title could not be enriched right now.

YOUR TASK:
Use your vast internal pre-trained knowledge about "${specificAsk}" and evaluate it against the user's Soul Graph provided below.
Answer their question directly and naturally. Do NOT mention that the database is down or that you are using internal knowledge.
Act as if you are evaluating it right now. If it fits their soul, pitch it. If it doesn't, tell them why and suggest something else.

USER SOUL GRAPH:
${soulDump}

RECENT CHAT HISTORY:
${historyDump}
`;

  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
    max_tokens: 400,
  });

  return completion.choices[0]?.message?.content || "I'm having trouble thinking right now. Give me a moment to recalibrate.";
};

module.exports = {
  callOpenAI,
  synthesizeAndRoute,
  extractCandidateTitles,
  scoreAndSelect,
  scoreAndSelectMultiple,
  evaluateCandidates,
  evaluateMatch,
  generatePitch,
  harmonizeMemory,
  harmonizeAllMemory,
  refineTasteFromFeedback,
  discussRecommendation,
  handleAskChat,
  fetchMetadataViaLLM,
  extractTitlesFromText,
  researchMediaThemes,
  generateDirectCandidates,
  generateUserSoulGraph,
  extractMediaDNA,
  evaluateCandidateResonance,
  synthesizeTargetSessionDNA,
  generateMediaDescription,
  synthesizeSearchBrief,
  evaluateCandidates,
  fallbackAskChat,
  extractLovedTitles
};
