const { researchMediaThemes } = require('./onboardingAgent');
const loggerService = require('./loggerService');
const searchService = require('./searchService');
const { callGeminiChat } = require('./geminiClient');

const callGemini = async (messages, responseFormat = null, modelOverride = null, retries = 2) => {
  const safeMessages = messages.map(m => ({
    ...m,
    content: typeof m.content === 'string' && m.content.length > 250000 
      ? m.content.substring(0, 250000) + '...[TRUNCATED]' 
      : m.content
  }));

  const responseData = await callGeminiChat({
    messages: safeMessages,
    responseFormat: responseFormat,
    temperature: 0.4,
    model: modelOverride || 'gemini-3.1-flash-lite',
    retries,
  });

  return responseData.choices[0].message.content;
};

const structuredCompletion = async (messages, modelOverride = null) => {
  const raw = await callGemini(messages, { type: 'json_object' }, modelOverride);
  let cleaned = (raw || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return JSON.parse(cleaned);
};

const getCategoryKey = (tab) => {
  const t = (tab || '').toLowerCase();
  if (t === 'you') return null;
  if (t === 'anime') return 'anime';
  if (t === 'movies' || t === 'movie') return 'movie';
  if (t === 'tv shows' || t === 'tv') return 'tv';
  if (t === 'visual novels' || t === 'visual novel') return 'visualnovel';
  if (t === 'books' || t === 'book') return 'book';
  if (t === 'games' || t === 'game') return 'game';
  return t.replace(/\s+/g, '_');
};

const formatWalrusMemoriesList = (walrusMemories) => {
  if (!Array.isArray(walrusMemories) || walrusMemories.length === 0) {
    return 'No explicit memories recorded on Walrus yet.';
  }
  return walrusMemories
    .map(m => `- [${m.category || m.namespace || 'Walrus Memory'}]: "${m.text || m.content || JSON.stringify(m)}"`)
    .join('\n');
};

/**
 * Harmonizes a single onboarding tab conversation against recalled Walrus memories.
 * Focuses strictly on media taste facets, creative anchors, and negative guardrails
 * (zero demographic or psychological profiling).
 */
const harmonizeMemory = async (chatHistory, walrusMemories = [], tabName = 'You') => {
  const categoryKey = getCategoryKey(tabName);
  const walrusContext = formatWalrusMemoriesList(walrusMemories);

  const systemPrompt = `
You are the Coda Taste Harmonizer.
Your job is to read the user's latest onboarding conversation in the "${tabName}" section alongside their recalled Walrus Protocol memories, and produce clean, deduplicated atomic media taste facets.

RECALLED WALRUS PROTOCOL MEMORIES:
${walrusContext}

STRICT RULES:
1. Focus EXCLUSIVELY on media taste, narrative preferences, pacing, tonal affinities, favorite creators/titles, and explicit content guardrails.
2. NEVER infer or guess personal demographics, age, life circumstances, or psychological struggles.
3. Consolidate repetitive points into crisp, distinct atomic taste statements.

Respond ONLY with a JSON object:
{
  "global_identity_overwrite": ["1-3 distinct atomic statements describing their core storytelling and aesthetic taste"],
  ${categoryKey ? `"category_profiles_overwrite": { "${categoryKey}": ["Distinct category-specific taste anchors and favorite titles"] },` : '"category_profiles_overwrite": {},'}
  "recent_context_overwrite": "What they are actively craving right now (or empty string if none).",
  "guardrails_appends": ["Only explicit negative content dealbreakers stated by the user."]
}
`;

  const messagesPayload = [{ role: 'system', content: systemPrompt }];
  if (chatHistory && Array.isArray(chatHistory)) {
    chatHistory.forEach(msg => {
      messagesPayload.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      });
    });
  }

  try {
    const response = await callGemini(messagesPayload, { type: 'json_object' });
    return JSON.parse(response);
  } catch (e) {
    console.error('[harmonizeMemory Error]:', e.message);
    return {};
  }
};

/**
 * Global taste harmonization across recalled Walrus Protocol memories.
 * Produces a concise aesthetic taste summary and per-category taste anchors without any psychological profiling.
 */
const harmonizeAllMemory = async (walrusMemories = []) => {
  const walrusContext = formatWalrusMemoriesList(walrusMemories);

  const systemPrompt = `
You are the Coda Taste Harmonizer.
Review the user's decentralized Walrus Protocol taste memories and synthesize a clean, cohesive media taste summary.

RECALLED WALRUS PROTOCOL MEMORIES:
${walrusContext}

STRICT RULES:
1. Summarize ONLY their media, storytelling, aesthetic, and pacing preferences across formats.
2. NEVER infer or speculate about personal demographics, age, or psychological struggles.

Respond ONLY with a JSON object:
{
  "global_identity_overwrite": [
    "A perceptive 2-3 sentence summary of the user's storytelling and aesthetic taste, speaking directly to them as 'You'."
  ],
  "category_profiles_overwrite": {},
  "guardrails_appends": []
}
`;

  try {
    const response = await callGemini([{ role: 'system', content: systemPrompt }], { type: 'json_object' });
    const parsedResponse = JSON.parse(response);
    loggerService.logHarmonization({
      type: 'Global',
      tabName: null,
      inputMemory: { walrus_recalled_count: Array.isArray(walrusMemories) ? walrusMemories.length : 0 },
      researchContext: null,
      outputMemory: parsedResponse
    });
    return parsedResponse;
  } catch (e) {
    console.error('[harmonizeAllMemory Error]:', e.message);
    return {};
  }
};

/**
 * Refines user taste and guardrails from rejection feedback using recalled Walrus Protocol memories.
 */
const refineTasteFromFeedback = async (walrusMemories = [], title, mediaType, reason) => {
  const walrusContext = formatWalrusMemoriesList(walrusMemories);

  const systemPrompt = `
You are the Coda Taste Refiner.
The user was recommended "${title}" (${mediaType}), swiped left ("NOT FOR ME"), and gave a specific feedback reason.
Analyze their recalled Walrus Protocol memories and this rejection feedback, then produce atomic memory updates so future recommendations respect this boundary.

REJECTED WORK: "${title}" (${mediaType})
FEEDBACK REASON: "${reason}"

RECALLED WALRUS PROTOCOL MEMORIES:
${walrusContext}

RULES:
1. Identify whether the feedback represents a persistent negative guardrail, a temporary mood constraint, or a category taste adjustment.
2. Generate a "guardrails_appends" array for hard dealbreakers or styles to avoid (e.g., "Avoid mainstream recommendations", "No horror", "No gore").
3. Generate a "recent_context_overwrite" string if the feedback expresses an active mood shift (e.g., "Seeking visual novels, avoiding mainstream titles like ${title}").
4. Optionally add specific preferences to "category_appends" (valid keys: "anime", "movie", "tv", "visualnovel", "book", "game", "manga", "youtube", "music") or "global_identity_appends".
5. Do NOT duplicate existing Walrus memories.

Respond ONLY with a JSON object:
{
  "global_identity_appends": [],
  "category_appends": {},
  "recent_context_overwrite": "",
  "guardrails_appends": []
}
`;

  try {
    const response = await callGemini([{ role: 'system', content: systemPrompt }], { type: 'json_object' });
    return JSON.parse(response);
  } catch (e) {
    console.error('Taste refinement LLM call failed:', e.message);
    return {};
  }
};

const checkIfSearchNeeded = async (userMessage, title, mediaType) => {
  const systemPrompt = `
You are a search decision engine deciding whether to search community forums (Reddit) for discussions about the media "${title}" (${mediaType}) to answer the user's chat message.
If the message is a tiny, generic chat filler or a simple greeting/acknowledgement (e.g. "hi", "thanks", "cool"), reply with "FALSE".
For all other messages—including questions about the media, its plot, themes, reception, characters, or comparisons—reply with "TRUE".
Respond with EXACTLY "TRUE" or "FALSE" (no other text).
`;
  try {
    const response = await callGemini([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]);
    const cleanResponse = response.trim().toUpperCase();
    return cleanResponse === 'TRUE';
  } catch (e) {
    return false;
  }
};

/**
 * Recommendation Discussion Chat ("Pitch" / "Afterglow").
 * Grounded 100% in recalled Walrus Protocol memories (zero local cognitive memory).
 */
const discussRecommendation = async (_unusedLocalMemory, title, mediaType, codaBlurb, pitchParagraphs, chatHistory, userMessage, walrusMemories = []) => {
  let scrapedContext = '';

  const needsSearch = await checkIfSearchNeeded(userMessage, title, mediaType);
  if (needsSearch) {
    const query = `"${title}" ${mediaType} ${userMessage} site:reddit.com`;
    try {
      const snippets = await searchService.scrapeForums(query);
      if (snippets && snippets.length > 0) {
        scrapedContext = snippets.map(s => `[Forum Discussion] ${s.title}: ${s.snippet}`).join('\n\n');
      }
    } catch (err) {
      console.error('[Discuss Chat Search Error]:', err.message);
    }
  }

  const walrusContext = formatWalrusMemoriesList(walrusMemories);

  const systemPrompt = `
You are Coda.
You are a close, perceptive friend with impeccable artistic taste in books, anime, movies, games, and music.
You are chatting with the user about the recommendation "${title}" (${mediaType}).

Here is what you told them when you recommended it:
- Your hook/blurb: "${codaBlurb}"
- Your detailed pitch:
${(pitchParagraphs || []).map(p => `  - "${p}"`).join('\n')}

USER WALRUS PROTOCOL MEMORIES (Authoritative Decentralized Taste Anchors):
${walrusContext}

COMMUNITY TALK & FACTS (from web search):
${scrapedContext || 'No additional community threads retrieved.'}

If the user asks why you recommended this, why you thought they would like it, or about their taste, you MUST directly reference their authentic Walrus Protocol taste anchors above (and if no Walrus memories are present because Memories are turned OFF, explain that you recommended it on its standalone artistic merits without personal memory context).

Your job is to talk with the user about "${title}":
1. Speak with warmth, enthusiasm, and companionable excitement.
2. Avoid robotic AI transitions, bulleted lists, and formal summaries.
3. If the scraped context does not have the exact answer, use your knowledge about "${title}" accurately and honestly.
4. CONTINUOUS WALRUS MEMORY EXTRACTION (STRICT FIRST-PERSON AFFIRMATION ONLY):
   - Clarifying, curious, or exploratory questions (e.g., "Why did you pick this?", "What is this about?", "Who directed this?", "Is it scary?") are NOT preferences!
   - If the user asks a question or makes casual remarks ("cool", "okay", "tell me more"), YOU MUST SET ALL ARRAYS IN "memory_updates" TO EMPTY ([] or {}).
   - ONLY extract into "memory_updates" when the user EXPLICITLY declares a personal taste, favorite creator/work, or negative dealbreaker in their own words.
   - Valid category keys in "category_appends" are: "anime", "movie", "tv", "visualnovel", "book", "game", "manga", "youtube", "music".
5. Generate or update a "one_line_summary" summarizing their reaction to this media so far.

Respond ONLY with a JSON object:
{
  "message": "Coda's conversational response here (1-3 paragraphs, plain text without markdown bullet points)",
  "one_line_summary": "One line summary of their experience so far",
  "memory_updates": {
    "global_identity_appends": [],
    "category_appends": {},
    "recent_context_overwrite": "",
    "guardrails_appends": [],
    "media_reflections_appends": [],
    "seen_appends": [],
    "not_for_me_appends": []
  }
}
`;

  const messagesPayload = [{ role: 'system', content: systemPrompt }];
  if (chatHistory && Array.isArray(chatHistory)) {
    chatHistory.forEach(msg => {
      messagesPayload.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      });
    });
  }
  messagesPayload.push({ role: 'user', content: userMessage });

  try {
    const responseJson = await callGemini(messagesPayload, { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error('[Discuss Chat LLM Parse Error]:', e.message);
    return {
      message: `[LLM Error]: ${e.message || e}`,
      one_line_summary: 'Chatting about ' + title,
      memory_updates: {}
    };
  }
};

/**
 * Ask Coda Conversational Curation Endpoint.
 * Grounded 100% in recalled Walrus Protocol memories (only product state `watchlist` is accepted when Watchlist Mode is active).
 */
const handleAskChat = async (productState = {}, chatHistory = [], userMessage = '', watchlistOnly = false, walrusMemories = []) => {
  const intro = [
    "Tell me what you're looking for. Your favorites, Something you can't stop thinking about.",
    "Something you wish you could experience again for the first time.",
    "Tell me how your day went. Tell me what you're feeling, or what you want to feel. Excited. Heartbroken. Curious. Lost. Comforted. Challenged. Anything.",
    "Just talk to me. I’ll find the one."
  ].join('\n\n');

  const walrusContext = formatWalrusMemoriesList(walrusMemories);

  let systemPrompt = `
You are Coda.
You are a close friend with impeccable, artistic taste in books, anime, movies, games, and music.
You are chatting with the user in the "Ask Coda" section to understand their current mood, craving, or general request, so you can recommend the perfect media work.

USER WALRUS PROTOCOL MEMORIES (Authoritative Decentralized Taste Anchors):
${walrusContext}

YOUR DIRECTIVE / FIRST MESSAGE (what you previously showed the user as an intro):
"${intro}"`;

  if (watchlistOnly) {
    systemPrompt += `\n\nCRITICAL WATCHLIST MODE RULE: The user has enabled "Watchlist Mode". You MUST restrict your recommendations strictly to items from their Watchlist (${JSON.stringify(productState?.watchlist || [])}). Furthermore, when providing the recommendation, you MUST explicitly mention in your message that this pick was chosen from their watchlist.`;
  }

  systemPrompt += `\n\nYOUR JOB:
1. Converse naturally with the user. Answer their questions, validate their feelings/mood, and ask clarifying questions if needed.
2. Maintain a warm, artistic, friend-like, and casual tone. Avoid robotic assistant-speak.
3. CONVERSATION OVER NEW RECOMMENDATIONS:
   - Check the chat history for metadata tags like \`[System: Coda recommended the work: "Title" (Type)]\`.
   - If the user is asking questions about the recommended work (e.g., "why did you pick this?", "what is it about?", "who directed it?"), you MUST set "status": "chatting" and converse about that specific work using the recalled Walrus Protocol memories above.
   - Do NOT trigger a new recommendation (do NOT set "status": "success") when the user is discussing the current recommendation, unless they explicitly ask for a different recommendation or a new pick.
4. MEDIA MATCH ("Is this for me?"):
   - If the user explicitly asks if a specific title is a good fit for them (e.g., "Is Severance for me?", "Would I like Dune?"):
     - Set "status": "match".
     - In "match_target", output the name of the media they are asking about.
     - In "media_type", output the media type ("tv", "movie", "anime", etc.).
5. NEW RECOMMENDATIONS:
   - If they describe a craving or look for recommendations:
     - If they specify a clear reference title or a specific vibe, set "status": "success" immediately.
     - If their query is extremely vague (e.g. just "recommend something") and no Walrus memories clarify their craving, set "status": "chatting" and ask for their preferences.
     - When setting "status": "success":
       - In "message", write a friendly 1-2 sentence response explaining that you've found the right pick.
       - In "media_type", output one of: "anime", "movie", "tv", "visual novel", "book", "game", "youtube", "music".
       - In "recommendation_query", write a descriptive search query capturing their craving.
       - In "similar_to_title", output the reference work title if applicable, or null.
       - In "hard_constraints", output an array of strict constraints if mentioned, or [].
6. CONTINUOUS WALRUS MEMORY EXTRACTION (STRICT FIRST-PERSON AFFIRMATION ONLY):
   - Asking general questions, asking for recommendations, or asking about a title is NOT a permanent taste declaration.
   - NEVER extract a memory update unless the user explicitly declares their personal taste, creator admiration, or dealbreaker in their own words.
   - Otherwise, leave "memory_updates" completely empty: { "guardrails_appends": [], "category_appends": {}, "global_identity_appends": [] }.

Respond ONLY with a JSON object in this format:
{
  "status": "chatting" | "success" | "match",
  "message": "Coda's friendly, conversational response.",
  "media_type": null | "anime" | "movie" | "tv" | "visual novel" | "book" | "game" | "youtube" | "music",
  "match_target": null | "Specific Title to check",
  "recommendation_query": null | "descriptive search query here",
  "similar_to_title": null | "Title of reference media",
  "hard_constraints": [],
  "memory_updates": {
    "guardrails_appends": [],
    "category_appends": {},
    "global_identity_appends": []
  }
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

  const response = await callGemini(messagesPayload, { type: 'json_object' });
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
    const responseJson = await callGemini([{ role: 'user', content: prompt }], { type: 'json_object' });
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
  const prompt = `Extract all specific media work titles (movies, anime, TV shows, books, visual novels, games) explicitly mentioned in this text:
"${text}"

Return ONLY a JSON object:
{
  "titles": ["Title 1", "Title 2"]
}`;
  try {
    const responseJson = await callGemini([{ role: 'user', content: prompt }], { type: 'json_object' });
    const parsed = JSON.parse(responseJson);
    return Array.isArray(parsed.titles) ? parsed.titles : [];
  } catch (e) {
    console.error('[llmService] extractTitlesFromText failed:', e.message);
    return [];
  }
};

module.exports = {
  callGemini,
  structuredCompletion,
  harmonizeMemory,
  harmonizeAllMemory,
  refineTasteFromFeedback,
  discussRecommendation,
  handleAskChat,
  fetchMetadataViaLLM,
  extractTitlesFromText,
  researchMediaThemes,
};
