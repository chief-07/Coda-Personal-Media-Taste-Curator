const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

let memwalInstance = null;
let initPromise = null;

async function getClient() {
  if (memwalInstance) return memwalInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { MemWal } = await import('@mysten-incubation/memwal');
    
    const key = process.env.MEMWAL_PRIVATE_KEY || 'f04743303d3babe664d0a7ab410f03426a7ae61a09d81bded730d5118f0f3677';
    const accountId = process.env.MEMWAL_ACCOUNT_ID || '0x48b30fecc266bef51e01ae32c4f610bbe2910ed09a4c022e27383999aa331d55';
    const serverUrl = process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz';

    memwalInstance = MemWal.create({
      key,
      accountId,
      serverUrl,
    });
    return memwalInstance;
  })();

  return initPromise;
}

function normalizeCategory(category) {
  if (!category) return 'general';
  const c = category.toLowerCase().replace(/[^a-z]/g, '');
  if (c === 'movies') return 'movie';
  if (c === 'shows' || c === 'tvshows') return 'tv';
  if (c === 'books') return 'book';
  if (c === 'games') return 'game';
  if (c === 'visualnovels' || c === 'vn' || c === 'vns') return 'visualnovel';
  return c;
}

/**
 * Strict tenant ID sanitizer to guarantee namespace isolation across users.
 * Strips colons, wildcards, whitespace, and control characters so a userId
 * can never escape its `coda:<userId>:<segment>` partition.
 */
function sanitizeUserId(userId) {
  if (!userId || typeof userId !== 'string') return 'anon';
  const cleaned = userId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || 'anon';
}

/**
 * Standard Walrus Memory namespace formatter following the official multi-tenant pattern:
 * coda:{userId}:{category}
 */
function formatNamespace(userId, category) {
  const safeUser = sanitizeUserId(userId);
  const normCategory = normalizeCategory(category);
  return `coda:${safeUser}:${normCategory}`;
}

const recentWritesByUser = new Map(); // userId -> Array<{ job_id, status, blob_id, text, namespace, category, created_at }>

function recordUserWrite(userId, entry) {
  if (!userId || !entry) return;
  const safeUser = sanitizeUserId(userId);
  const list = recentWritesByUser.get(safeUser) || [];
  const filtered = list.filter(x => !(x.namespace === entry.namespace && x.text === entry.text));
  filtered.unshift(entry);
  recentWritesByUser.set(safeUser, filtered.slice(0, 50));
}

function extractUserIdFromNamespace(namespace) {
  if (!namespace) return 'anon';
  if (namespace.includes(':')) {
    const parts = namespace.split(':');
    return parts.length >= 2 ? sanitizeUserId(parts[1]) : 'anon';
  }
  if (namespace.startsWith('coda_')) {
    const parts = namespace.split('_');
    if (parts.length >= 3) {
      return sanitizeUserId(parts.slice(1, -1).join('_'));
    }
  }
  return 'anon';
}

function extractCategoryFromNamespace(namespace) {
  if (!namespace) return 'core';
  if (namespace.includes(':')) {
    const parts = namespace.split(':');
    return parts[parts.length - 1] || 'core';
  }
  if (namespace.includes('_')) {
    const parts = namespace.split('_');
    return parts[parts.length - 1] || 'core';
  }
  return namespace;
}

/**
 * Remember an atomic fact under a specific namespace.
 * Uses async remember so the user is not blocked waiting for on-chain block confirmation,
 * and records the job_id for live blob_id resolution via Walrus relayer.
 */
async function rememberFact(text, namespace, retries = 1, categoryLabel = null) {
  if (!text || !text.trim()) return null;
  const cleanText = text.trim();
  const client = await getClient();
  const userId = extractUserIdFromNamespace(namespace);
  const shortCat = categoryLabel || extractCategoryFromNamespace(namespace);

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const result = await client.remember(cleanText, namespace);
      const writeRecord = {
        job_id: result.job_id || null,
        status: result.status || 'pending',
        blob_id: result.blob_id || null,
        text: cleanText,
        namespace,
        category: shortCat,
        created_at: new Date().toISOString(),
      };
      recordUserWrite(userId, writeRecord);
      console.log(`[Walrus Memory] Stored memory in '${namespace}': ${cleanText.substring(0, 60)}... (job: ${result.job_id})`);
      return writeRecord;
    } catch (err) {
      const isRateLimit = err.message && (err.message.includes('429') || err.message.toLowerCase().includes('rate limit'));
      if (isRateLimit) {
        console.warn(`[Walrus Memory] Rate limit (429) on '${namespace}', skipping immediate retry to preserve quota.`);
        return null;
      }
      if (attempt <= retries) {
        await new Promise(r => setTimeout(r, 400 * attempt));
        continue;
      }
      console.error(`[Walrus Memory Error] Failed to remember in '${namespace}':`, err.message);
      return null;
    }
  }
}

/**
 * Resolves pending job_ids against Walrus relayer (client.getRememberBulkStatus)
 * to populate live on-chain blob_ids as soon as Walrus finishes uploading.
 */
async function resolvePendingWriteJobs(userId, extraJobIds = []) {
  const client = await getClient();
  const safeUser = sanitizeUserId(userId);
  const userWrites = recentWritesByUser.get(safeUser) || [];
  const pendingIds = new Set(extraJobIds.filter(Boolean));

  for (const w of userWrites) {
    if (w.job_id && !w.blob_id && w.status !== 'failed') {
      pendingIds.add(w.job_id);
    }
  }

  const idsArray = Array.from(pendingIds).slice(0, 25);
  if (idsArray.length === 0) return userWrites;

  try {
    const bulkRes = await client.getRememberBulkStatus(idsArray);
    // @mysten-incubation/memwal returns { results: [...] } for /api/remember/bulk/status
    const jobs = bulkRes?.results || bulkRes?.jobs || [];
    const jobMap = new Map(jobs.map(j => [j.job_id, j]));

    for (const w of userWrites) {
      if (w.job_id && jobMap.has(w.job_id)) {
        const j = jobMap.get(w.job_id);
        w.status = j.status || w.status;
        if (j.blob_id) w.blob_id = j.blob_id;
        if (j.namespace) w.namespace = j.namespace;
      }
    }
    return userWrites;
  } catch (err) {
    console.warn(`[Walrus Status Poll] Could not resolve bulk job status:`, err.message);
    return userWrites;
  }
}

/**
 * Recall memories from a specific namespace using semantic search.
 * Supports maxDistance to filter out weak/irrelevant matches and provides
 * bidirectional fallback between 'coda:user:category' and legacy 'coda_user_category'.
 */
async function recallMemories({ query, namespace, limit = 5, maxDistance = null, sort = 'relevance' }) {
  if (!query || !namespace) return [];
  const client = await getClient();
  const safeSort = (!sort || sort === 'similarity') ? 'relevance' : sort;
  try {
    const opts = { query, namespace, limit, sort: safeSort };
    if (maxDistance !== null && maxDistance !== undefined) {
      opts.maxDistance = maxDistance;
    }
    const res = await client.recall(opts);
    let results = res.results || [];
    let resolvedNs = namespace;

    // If no results and namespace contains ':', fallback to legacy '_' format
    if (results.length === 0 && namespace.includes(':')) {
      const legacyNs = namespace.replace(/:/g, '_');
      try {
        const legacyRes = await client.recall({ ...opts, namespace: legacyNs });
        if (legacyRes?.results?.length > 0) {
          results = legacyRes.results;
          resolvedNs = legacyNs;
        }
      } catch (_) {}
    } else if (results.length === 0 && namespace.includes('_')) {
      const modernNs = namespace.replace(/_/g, ':');
      try {
        const modernRes = await client.recall({ ...opts, namespace: modernNs });
        if (modernRes?.results?.length > 0) {
          results = modernRes.results;
          resolvedNs = modernNs;
        }
      } catch (_) {}
    }

    return results.map(r => ({
      ...r,
      blob_id: r.blob_id || r.blobId || null,
      blobId: r.blob_id || r.blobId || null,
      namespace: resolvedNs,
    }));
  } catch (err) {
    console.error(`[Walrus Memory Error] Failed to recall from '${namespace}':`, err.message);
    return [];
  }
}

/**
 * Smart router: Distributes memory_updates from conversation to domain-specific namespaces
 * as clean, self-contained ATOMIC facts (never gluing unrelated genres/tastes into a single blob
 * and never wrapping facts in verbose boilerplate fluff).
 */
async function routeAndSaveLivingMemory(userId, memoryUpdates) {
  if (!userId || !memoryUpdates) return [];
  const ambient = getLiveAmbientContext();
  const atomicWrites = []; // Array of { ns, text, rawText, category }
  const seenWriteKeys = new Set();

  const queueAtomicWrite = (ns, text, rawText, category) => {
    if (!ns || !text || !text.trim()) return;
    const cleanText = text.trim();
    const dedupeKey = `${ns}:::${cleanText.toLowerCase()}`;
    if (seenWriteKeys.has(dedupeKey)) return;
    seenWriteKeys.add(dedupeKey);
    atomicWrites.push({
      ns,
      text: cleanText,
      rawText: (rawText && rawText.trim()) ? rawText.trim() : cleanText,
      category,
    });
  };

  // Helper to split accidentally combined multi-clause strings if separated by ' | ' or ';'
  const splitAtomicStrings = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
      if (typeof item !== 'string' || !item.trim()) continue;
      const parts = item.split(/\s*(?:\||;)\s*/).map(s => s.trim()).filter(Boolean);
      out.push(...parts);
    }
    return out;
  };

  // 1. Core taste & identity facets -> coda:{userId}:core (each distinct facet stored as its own atomic blob)
  const coreNs = formatNamespace(userId, 'core');
  for (const fact of splitAtomicStrings(memoryUpdates.global_identity_appends)) {
    queueAtomicWrite(coreNs, fact, fact, 'Core Taste Facet');
  }
  for (const theme of splitAtomicStrings(memoryUpdates.thematic_connections_appends)) {
    queueAtomicWrite(coreNs, theme, theme, 'Thematic Resonance');
  }

  // 2. Category-specific taste anchors -> coda:{userId}:{category} (each anchor stored as its own atomic blob)
  if (memoryUpdates.category_appends && typeof memoryUpdates.category_appends === 'object') {
    for (const [category, facts] of Object.entries(memoryUpdates.category_appends)) {
      const normalized = normalizeCategory(category);
      const namespace = formatNamespace(userId, normalized);
      const rawItems = Array.isArray(facts) ? facts : [facts];
      for (const item of splitAtomicStrings(rawItems)) {
        const hasCategoryWord = new RegExp(`\\b(${normalized}|movie|film|tv|show|anime|book|manga|game)\\b`, 'i').test(item);
        const atomicAnchor = hasCategoryWord ? item : `Favorite ${normalized}: ${item}`;
        queueAtomicWrite(namespace, atomicAnchor, item, `${normalized.toUpperCase()} Taste Anchor`);
      }
    }
  }

  // 3. Guardrails, dealbreakers & seen titles -> coda:{userId}:guardrails
  const guardrailNs = formatNamespace(userId, 'guardrails');
  for (const rule of splitAtomicStrings(memoryUpdates.guardrails_appends)) {
    const cleanRule = /^dealbreaker/i.test(rule) ? rule : `Dealbreaker: ${rule}`;
    queueAtomicWrite(guardrailNs, cleanRule, rule, 'Guardrail Protocol');
  }

  const seenTitles = splitAtomicStrings(memoryUpdates.seen_appends);
  if (seenTitles.length > 0) {
    const seenFact = `Already watched/seen: ${seenTitles.map(t => `"${t.replace(/^["']|["']$/g, '')}"`).join(', ')}`;
    queueAtomicWrite(guardrailNs, seenFact, `Already watched: ${seenTitles.join(', ')}`, 'Already Seen');
  }

  // 4. Temporary session context / right-now craving -> coda:{userId}:session
  // Only written when the user explicitly states a right-now mood or time-of-day habit
  if (memoryUpdates.recent_context_overwrite && typeof memoryUpdates.recent_context_overwrite === 'string' && memoryUpdates.recent_context_overwrite.trim()) {
    const cleanCraving = memoryUpdates.recent_context_overwrite.trim();
    const sessionNs = formatNamespace(userId, 'session');
    const sessionFact = `Right now (${ambient.time_of_day}): ${cleanCraving}`;
    queueAtomicWrite(sessionNs, sessionFact, cleanCraving, 'Active Craving');
  }

  invalidateUserRecallCache(userId);

  // Execute atomic writes with light spacing (220ms) so Walrus Relayer never hits 429 rate limits
  const results = [];
  const cappedWrites = atomicWrites.slice(0, 8);
  for (let i = 0; i < cappedWrites.length; i++) {
    const entry = cappedWrites[i];
    if (i > 0) {
      await new Promise(r => setTimeout(r, 220));
    }
    try {
      const res = await rememberFact(entry.text, entry.ns, 1, entry.category);
      if (res) {
        results.push({
          ...res,
          raw_text: entry.rawText,
        });
      }
    } catch (err) {
      console.warn(`[Walrus Throttler] Skipped write to ${entry.ns}:`, err.message);
    }
  }

  return results;
}

function getLiveAmbientContext(clientContext) {
  const now = new Date();
  const hours = now.getHours();
  let timeOfDay = 'morning';
  if (hours >= 12 && hours < 17) timeOfDay = 'afternoon';
  else if (hours >= 17 && hours < 22) timeOfDay = 'evening';
  else if (hours >= 22 || hours < 5) timeOfDay = 'late night';

  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.getMonth();
  let season = 'autumn';
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'autumn';
  else season = 'winter';

  const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    time_of_day: timeOfDay,
    day_of_week: dayOfWeek,
    season: season,
    formatted_time: `${dateString}, ${timeString} (${timeOfDay})`,
    client_context: clientContext || null,
  };
}

const recallCache = new Map();
const RECALL_CACHE_TTL = 2 * 60 * 1000;

function invalidateUserRecallCache(userId) {
  if (!userId) return;
  for (const key of recallCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      recallCache.delete(key);
    }
  }
}

// In-memory probe & soul-traversal rotation trackers so consecutive recommendations explore distinct facets
const recentQueriesByUser = new Map();
const soulTraversalIndexByUser = new Map();

/**
 * Dynamic Memory Scout (4 Genre-Neutral Probes):
 * Rotates across 4 genre-neutral probes so whether the user loves comedy, kinetic action,
 * romance, sci-fi, or thrillers, Coda pulls in the right atomic facet of their soul:
 *   1. General Interest & Genres ("What types of films/media and genres is the user interested in?")
 *   2. Favorite Titles & Creators ("Which favorite titles, directors, studios, or creators does the user love?")
 *   3. Tone, Humor, Action & Style ("What tone, humor, action, pacing, or storytelling style does the user enjoy?")
 *   4. Situational / Time-of-Day ("What kind of media does the user prefer to experience in the <time_of_day>?")
 */
async function generateDynamicMemoryQuery({ userId, mediaType, contextualState, recentContext }) {
  const ambient = getLiveAmbientContext(contextualState);
  const normalizedCategory = normalizeCategory(mediaType);
  const userKey = `${userId || 'anon'}:${normalizedCategory}`;
  const previousQueries = recentQueriesByUser.get(userKey) || [];

  const categoryNoun = {
    movie: 'films and movies',
    tv: 'TV shows and series',
    anime: 'anime series and films',
    book: 'books and novels',
    manga: 'manga series',
    game: 'video games',
    visualnovel: 'visual novels',
  }[normalizedCategory] || normalizedCategory;

  const actionVerb = (normalizedCategory === 'book' || normalizedCategory === 'manga' || normalizedCategory === 'visualnovel')
    ? 'read'
    : (normalizedCategory === 'game' ? 'play' : 'watch');

  const cravingSuffix = recentContext && recentContext.trim()
    ? ` matching "${recentContext.trim().slice(0, 60)}"`
    : '';

  const probes = [
    {
      probeIndex: 0,
      isSituational: false,
      angle: 'General Taste & Genres',
      query: `What types of ${categoryNoun} and genres is the user interested in to ${actionVerb}${cravingSuffix}?`,
    },
    {
      probeIndex: 1,
      isSituational: false,
      angle: 'Favorite Titles & Creators',
      query: `Which favorite ${categoryNoun} titles, directors, studios, or creators does the user love${cravingSuffix}?`,
    },
    {
      probeIndex: 2,
      isSituational: false,
      angle: 'Tone, Humor, Action & Style',
      query: `What tone, humor, action, pacing, or storytelling style does the user enjoy in ${categoryNoun}${cravingSuffix}?`,
    },
    {
      probeIndex: 3,
      isSituational: true,
      angle: `${ambient.day_of_week} ${ambient.time_of_day[0].toUpperCase() + ambient.time_of_day.slice(1)} Habit`,
      query: `What kind of ${categoryNoun} does the user like to ${actionVerb} in the ${ambient.time_of_day}${cravingSuffix}?`,
    },
  ];

  const chosen = probes[previousQueries.length % probes.length];
  const updated = [...previousQueries, chosen.query].slice(-8);
  recentQueriesByUser.set(userKey, updated);

  return chosen;
}

/**
 * Comprehensive recall pipeline with Soul Traversal:
 * 1. Queries each Walrus namespace with a namespace-appropriate query (never the same generic string everywhere).
 * 2. Fetches the ENTIRE `:guardrails` namespace (`sort: 'recent', limit: 50`) so all dealbreakers and seen titles are enforced.
 * 3. Performs Soul Traversal: spotlights 1 distinct atomic facet from `:core` + 1-2 matching anchors from `:{mediaType}`
 *    so each recommendation explores a focused side of the user's taste instead of dumping every memory blob at once.
 */
async function recallForRecommendation(userId, mediaType, contextualQuery = null, contextualState = null, recentContext = null) {
  const normalizedCategory = normalizeCategory(mediaType);
  const ambient = getLiveAmbientContext(contextualState);

  let queryInfo;
  if (contextualQuery) {
    queryInfo = {
      probeIndex: -1,
      isSituational: true,
      query: `What in the user's ${normalizedCategory} taste profile connects to "${contextualQuery}"?`,
      angle: `Targeted: ${contextualQuery.length > 22 ? contextualQuery.substring(0, 22) + '...' : contextualQuery}`,
    };
  } else {
    queryInfo = await generateDynamicMemoryQuery({ userId, mediaType, contextualState, recentContext });
  }

  const query = queryInfo.query;
  const primaryNs = formatNamespace(userId, normalizedCategory);
  const coreNs = formatNamespace(userId, 'core');
  const guardrailNs = formatNamespace(userId, 'guardrails');
  const sessionNs = formatNamespace(userId, 'session');

  // Resolve any pending write jobs first so recent writes have their live blob_ids
  await resolvePendingWriteJobs(userId).catch(() => {});

  // Namespace-specific queries tailored to what each namespace actually stores
  const coreQuery = query;
  const categoryQuery = contextualQuery
    ? `Favorite ${normalizedCategory} titles and genres matching "${contextualQuery}"`
    : `Favorite ${normalizedCategory} titles, genres, and benchmarks — ${query}`;
  const sessionQuery = contextualQuery
    ? `Right now active craving ${contextualQuery}`
    : `Right now in the ${ambient.time_of_day} watch habit or active craving`;
  const guardrailQuery = `Dealbreaker Avoid Disliked Already watched seen`;

  const safeUser = sanitizeUserId(userId);
  const rawCacheKey = `${safeUser}:${normalizedCategory}:${contextualQuery || 'rotation'}`;
  const cachedRaw = recallCache.get(rawCacheKey);

  let coreHitsRaw, categoryHitsRaw, guardrailHitsRaw, sessionHitsRaw;
  if (cachedRaw && (Date.now() - cachedRaw.timestamp < 45 * 1000)) {
    ({ coreHitsRaw, categoryHitsRaw, guardrailHitsRaw, sessionHitsRaw } = cachedRaw.data);
  } else {
    [coreHitsRaw, categoryHitsRaw, guardrailHitsRaw, sessionHitsRaw] = await Promise.all([
      recallMemories({ query: coreQuery, namespace: coreNs, limit: 8, maxDistance: 0.84 }).catch(() => []),
      recallMemories({ query: categoryQuery, namespace: primaryNs, limit: 8, maxDistance: 0.84 }).catch(() => []),
      // Full namespace fetch for guardrails: sort by recent, limit 50, no maxDistance cutoff
      recallMemories({ query: guardrailQuery, namespace: guardrailNs, limit: 50, sort: 'recent' }).catch(() => []),
      recallMemories({ query: sessionQuery, namespace: sessionNs, limit: 3, maxDistance: 0.62 }).catch(() => []),
    ]);
    recallCache.set(rawCacheKey, {
      data: { coreHitsRaw, categoryHitsRaw, guardrailHitsRaw, sessionHitsRaw },
      timestamp: Date.now(),
    });
  }

  const formatHit = (h, defaultNs, categoryTitle, subQuery) => ({
    ...h,
    text: (h.text || h.content || '').trim(),
    blob_id: h.blob_id || h.blobId || null,
    blobId: h.blob_id || h.blobId || null,
    job_id: h.job_id || null,
    status: h.blob_id || h.blobId ? 'done' : (h.status || 'done'),
    distance: typeof h.distance === 'number' ? Number(h.distance.toFixed(3)) : null,
    created_at: h.created_at || null,
    namespace: h.namespace || defaultNs,
    short_namespace: extractCategoryFromNamespace(h.namespace || defaultNs),
    category: categoryTitle,
    query_used: subQuery,
  });

  // Merge any recent in-flight Walrus writes for this user that haven't finished indexing yet
  const userRecentWrites = recentWritesByUser.get(safeUser) || [];
  const mergeUnindexedWrites = (hits, targetNs, categoryTitle, subQuery) => {
    const out = hits.map(h => formatHit(h, targetNs, categoryTitle, subQuery));
    const existingTexts = new Set(out.map(m => m.text.toLowerCase()));
    for (const w of userRecentWrites) {
      if (w.namespace === targetNs && w.text && !existingTexts.has(w.text.trim().toLowerCase())) {
        existingTexts.add(w.text.trim().toLowerCase());
        out.unshift({
          text: w.text.trim(),
          blob_id: w.blob_id || null,
          blobId: w.blob_id || null,
          job_id: w.job_id || null,
          status: w.blob_id ? 'done' : (w.status || 'uploading'),
          distance: null,
          created_at: w.created_at,
          namespace: w.namespace,
          short_namespace: extractCategoryFromNamespace(w.namespace),
          category: w.category || categoryTitle,
          query_used: subQuery,
        });
      }
    }
    return out;
  };

  const coreHits = mergeUnindexedWrites(coreHitsRaw, coreNs, 'Core Taste Facet', coreQuery);
  const categoryHits = mergeUnindexedWrites(categoryHitsRaw, primaryNs, `${normalizedCategory.toUpperCase()} Taste Anchor`, categoryQuery);
  const guardrailHits = mergeUnindexedWrites(guardrailHitsRaw, guardrailNs, 'Guardrail Protocol', guardrailQuery);

  // Only keep session hits if they are a genuine close semantic match (distance <= 0.62) or explicit contextualQuery
  const sessionHits = sessionHitsRaw
    .filter(h => contextualQuery || (typeof h.distance === 'number' && h.distance <= 0.62))
    .map(h => formatHit(h, sessionNs, `Active Craving (${ambient.time_of_day})`, sessionQuery));

  // Check if time-of-day actually matched a real habit in :session or :core (distance <= 0.62)
  const hasTimeOfDayMemoryMatch = sessionHits.length > 0 || (
    queryInfo.isSituational &&
    coreHits.some(h => typeof h.distance === 'number' && h.distance <= 0.62 && /\b(night|evening|morning|afternoon|late|weekend|bedtime)\b/i.test(h.text))
  );

  // SOUL TRAVERSAL:
  // Instead of dumping every recalled memory blob into the prompt at once,
  // rotate across the user's atomic facets so each recommendation spotlights ONE distinct facet
  // from :core + ONE matching category anchor from :{mediaType}.
  const traversalKey = `${safeUser}:${normalizedCategory}`;
  const currentTraversalIdx = soulTraversalIndexByUser.get(traversalKey) || 0;
  soulTraversalIndexByUser.set(traversalKey, currentTraversalIdx + 1);

  const spotlightMemories = [];
  const usedTexts = new Set();
  const pushUnique = (mem) => {
    if (!mem || !mem.text) return;
    const key = mem.text.toLowerCase();
    if (usedTexts.has(key)) return;
    usedTexts.add(key);
    spotlightMemories.push(mem);
  };

  // 1. If there is a genuine active session craving, spotlight it first
  if (sessionHits.length > 0) {
    pushUnique(sessionHits[0]);
  }

  // 2. Spotlight 1 rotated atomic facet from :core
  if (coreHits.length > 0) {
    const chosenCore = coreHits[currentTraversalIdx % coreHits.length];
    pushUnique(chosenCore);
  }

  // 3. Spotlight 1 rotated category taste anchor from :{mediaType}
  if (categoryHits.length > 0) {
    const firstCat = categoryHits[currentTraversalIdx % categoryHits.length];
    pushUnique(firstCat);
  }

  // Effective angle: if Probe 4 (situational time-of-day) was used but the user has NO time-of-day habit stored,
  // label the angle as Soul Traversal so time-of-day doesn't artificially skew the pick.
  const effectiveAngle = (queryInfo.isSituational && !hasTimeOfDayMemoryMatch)
    ? 'Soul Facet Traversal'
    : queryInfo.angle;

  const result = {
    queryUsed: query,
    moodAngle: effectiveAngle,
    hasTimeOfDayMemoryMatch,
    queriesByNamespace: {
      [primaryNs]: categoryQuery,
      [coreNs]: coreQuery,
      [sessionNs]: sessionQuery,
      [guardrailNs]: guardrailQuery,
    },
    coreHits,
    categoryHits,
    guardrailHits,
    sessionHits,
    allMemories: spotlightMemories,
    totalCount: spotlightMemories.length,
  };

  return result;
}

/**
 * Live Walrus Protocol Inspector:
 * Queries Walrus relayer directly for:
 * 1) Live job_id -> blob_id status updates (via client.getRememberBulkStatus)
 * 2) User's active Walrus namespaces and blob counts (via client.listNamespaces)
 * 3) Actual decrypted blobs stored on Walrus across the user's namespaces
 */
async function inspectLiveWalrus({ userId, jobIds = [], query = null, category = null }) {
  const client = await getClient();
  const activeUserId = sanitizeUserId(userId || 'demo_user');
  const normCat = category ? normalizeCategory(category) : 'movie';

  // 1. Resolve any pending write jobs so we get fresh blob_ids
  const resolvedWrites = await resolvePendingWriteJobs(activeUserId, jobIds);

  // 2. Fetch live namespaces from Walrus relayer
  let userNamespaces = [];
  try {
    const nsRes = await client.listNamespaces();
    const allNs = nsRes?.namespaces || [];
    const prefixColon = `coda:${activeUserId}:`;
    const prefixUnderscore = `coda_${activeUserId}_`;
    userNamespaces = allNs.filter(n =>
      n.name && (n.name.startsWith(prefixColon) || n.name.startsWith(prefixUnderscore))
    );
  } catch (err) {
    console.warn('[Walrus Inspect] listNamespaces warning:', err.message);
  }

  // 3. Pull live blobs from the user's namespaces on Walrus
  const targetNamespaces = [
    { ns: formatNamespace(activeUserId, 'core'), label: 'Personality & Emotional DNA' },
    { ns: formatNamespace(activeUserId, normCat), label: `${normCat.toUpperCase()} Taste Anchor` },
    { ns: formatNamespace(activeUserId, 'session'), label: 'Active Session Craving' },
    { ns: formatNamespace(activeUserId, 'guardrails'), label: 'Guardrail Protocol' },
  ];

  const probeQuery = query || 'favorite taste anchors emotional profile themes guardrails craving watched';
  const recallPromises = targetNamespaces.map(async ({ ns, label }) => {
    const hits = await recallMemories({
      query: probeQuery,
      namespace: ns,
      limit: 6,
      sort: 'recent'
    }).catch(() => []);
    return hits.map(h => ({
      text: h.text || h.content || '',
      blob_id: h.blob_id || h.blobId || null,
      blobId: h.blob_id || h.blobId || null,
      status: 'done',
      distance: typeof h.distance === 'number' ? Number(h.distance.toFixed(3)) : null,
      created_at: h.created_at || null,
      namespace: h.namespace || ns,
      category: label,
    }));
  });

  const recalledGroups = await Promise.all(recallPromises);
  const liveBlobs = recalledGroups.flat();

  // Merge with resolvedWrites so any brand-new writes (even if still uploading) appear with their job_id/blob_id
  const mergedBlobs = [];
  const seenKeys = new Set();

  for (const w of resolvedWrites) {
    const key = `${w.namespace}:::${w.text.trim().toLowerCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      // Check if liveBlobs has a matching text with a resolved blob_id
      const matchingLive = liveBlobs.find(lb => lb.text.trim().toLowerCase() === w.text.trim().toLowerCase());
      mergedBlobs.push({
        text: w.text,
        blob_id: w.blob_id || matchingLive?.blob_id || null,
        blobId: w.blob_id || matchingLive?.blob_id || null,
        job_id: w.job_id || null,
        status: (w.blob_id || matchingLive?.blob_id) ? 'done' : (w.status || 'uploading'),
        distance: matchingLive?.distance || null,
        created_at: matchingLive?.created_at || w.created_at,
        namespace: w.namespace,
        category: w.category || 'Walrus Memory Blob',
      });
    }
  }

  for (const lb of liveBlobs) {
    const key = `${lb.namespace}:::${lb.text.trim().toLowerCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      mergedBlobs.push(lb);
    }
  }

  // Ensure namespaces list includes at least the active ones if listNamespaces was empty
  if (userNamespaces.length === 0) {
    const countsByNs = {};
    for (const b of mergedBlobs) {
      countsByNs[b.namespace] = (countsByNs[b.namespace] || 0) + 1;
    }
    userNamespaces = targetNamespaces.map(t => ({
      name: t.ns,
      memory_count: countsByNs[t.ns] || 0,
      updated_at: new Date().toISOString(),
    }));
  }

  return {
    account_id: process.env.MEMWAL_ACCOUNT_ID || '0x48b30fecc266bef51e01ae32c4f610bbe2910ed09a4c022e27383999aa331d55',
    relayer_url: process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz',
    user_id: activeUserId,
    namespaces: userNamespaces,
    recent_writes: resolvedWrites.slice(0, 15),
    live_blobs: mergedBlobs.slice(0, 25),
  };
}

/**
 * Direct Walrus Memory-driven curator.
 * Recalls memories strictly from Walrus Protocol (zero local memory input to Gemini),
 * spotlights focused atomic taste facets via Soul Traversal, enforces the full `:guardrails`
 * namespace, queries Gemini for an extraordinary recommendation, and returns 1:1 attribution.
 */
async function curateWithWalrusMemory({ 
  userId, 
  mediaType, 
  currentMemory, 
  contextualState, 
  specificAsk = null,
  watchlistOnly = false,
  memoriesEnabled = true,
  additionalExclusions = []
}) {
  mediaType = (mediaType || 'movie').toLowerCase();
  const { callGeminiChat } = require('./geminiClient');
  const mediaService = require('./mediaService');
  const crypto = require('crypto');

  // Watchlist Only Mode is an explicit UI filter toggle (not taste memory)
  const rawWatchlist = currentMemory?.watchlist || [];
  const watchlistTitles = rawWatchlist
    .map(item => (typeof item === 'string' ? item : item?.title))
    .filter(Boolean);

  if (watchlistOnly) {
    if (watchlistTitles.length === 0) {
      console.log(`[Walrus Curator] Watchlist Only Mode active, but user's watchlist is empty.`);
      return null;
    }
    console.log(`[Walrus Curator] Watchlist Only Mode active with ${watchlistTitles.length} items:`, watchlistTitles);
  }

  const ambient = getLiveAmbientContext(contextualState);
  // Zero local memory input: only use specificAsk if explicitly passed for a targeted request
  const recentContext = specificAsk || null;

  let allMemories = [];
  let queryUsed = memoriesEnabled ? '' : 'Neutral Mode (Memories Disabled)';
  let moodAngle = memoriesEnabled ? 'Soul Facet Traversal' : 'Unpersonalized Default';
  let hasTimeOfDayMemoryMatch = false;
  let walrusSeen = [];
  let walrusGuardrails = [];
  let walrusNotForMe = [];

  if (memoriesEnabled) {
    console.log(`[Walrus Curator] Recalling Walrus memories for user ${userId} (${mediaType}).`);
    const recallResult = await recallForRecommendation(userId, mediaType, specificAsk, contextualState, recentContext);
    allMemories = recallResult.allMemories || [];
    queryUsed = recallResult.queryUsed;
    moodAngle = recallResult.moodAngle;
    hasTimeOfDayMemoryMatch = Boolean(recallResult.hasTimeOfDayMemoryMatch);

    const rawGuardrails = recallResult.guardrailHits || [];
    for (const item of rawGuardrails) {
      const text = item.text || item.content || '';
      const segments = text.split(' | ');
      for (const seg of segments) {
        if (/Already watched(?:\/seen)?:/i.test(seg)) {
          const quotedMatches = [...seg.matchAll(/"([^"]+)"/g)];
          if (quotedMatches.length > 0) {
            for (const m of quotedMatches) {
              if (m[1] && m[1].trim()) walrusSeen.push(m[1].trim());
            }
          } else {
            const singleMatch = seg.match(/Already watched(?:\/seen)?:\s*([^"(]+)/i);
            if (singleMatch && singleMatch[1]) {
              const splitItems = singleMatch[1].split(',').map(s => s.trim()).filter(Boolean);
              walrusSeen.push(...splitItems);
            }
          }
        } else if (seg.toLowerCase().includes('not for me') || seg.toLowerCase().includes('rejected') || seg.toLowerCase().includes('avoid/disliked')) {
          walrusNotForMe.push(seg.trim());
        } else if (seg.trim()) {
          walrusGuardrails.push(seg.trim());
        }
      }
    }
  } else {
    console.log(`[Walrus Curator] Memories disabled. Operating in Cold/Brain-Dead curation mode for ${mediaType}.`);
  }

  // 100% PURE WALRUS MEMORY:
  // Gemini receives ZERO local memory (no currentMemory.seen, no currentMemory.notForMe, no currentMemory.guardrails).
  // Only Walrus-recalled guardrails/seen blobs (+ in-batch parallel exclusion) are used.
  const seenList = memoriesEnabled
    ? Array.from(new Set([...walrusSeen, ...(additionalExclusions || [])]))
    : [];
  const notForMeList = memoriesEnabled ? Array.from(new Set([...walrusNotForMe])) : [];
  const guardrailsList = memoriesEnabled ? Array.from(new Set([...walrusGuardrails])) : [];

  const memoriesContext = (!memoriesEnabled)
    ? 'AMNESIA MODE: Walrus Memory is turned OFF. You have ZERO memory of who this user is, their taste facets, their favorite titles, or their dealbreakers.'
    : (allMemories.length > 0
        ? allMemories.map((m, i) => `${i + 1}. [ns: ${m.namespace} | blob: ${m.blob_id || m.job_id || 'live'}]: "${m.text || m.content || JSON.stringify(m)}"`).join('\n')
        : 'No explicit memories recorded yet in Walrus.');

  const watchlistConstraint = (watchlistOnly && watchlistTitles.length > 0)
    ? `
STRICT WATCHLIST ONLY CONSTRAINT:
You MUST select and curate ONE title strictly from the user's saved watchlist:
${watchlistTitles.map(t => `- "${t}"`).join('\n')}
Do NOT recommend any title outside this list under any circumstance.
`
    : '';

  const situationalDirective = hasTimeOfDayMemoryMatch
    ? `Situational Context Matched in Walrus: ${ambient.day_of_week} ${ambient.time_of_day} (${ambient.formatted_time})`
    : `Active Traversal Lens: ${moodAngle} (Focus strictly on the spotlighted Walrus memory facets below; do NOT force time-of-day mood unless stated in the recalled memories)`;

  const amnesiaBuckets = [
    'a loud, explosive commercial action or superhero blockbuster (e.g. Transformers, Fast & Furious, The Avengers, Expendables)',
    'a mainstream jump-scare horror or gory slasher flick (e.g. Saw, The Conjuring, Final Destination, Terrifier)',
    'a generic mass-market popcorn hit or cheesy rom-com (e.g. Jurassic World, Avatar, Fifty Shades of Grey, Red Notice)',
    'an over-the-top mainstream battle/mecha/popcorn title (e.g. Gundam Seed, Dragon Ball Super, Call of Duty, Fortnite, Twilight)',
    'a random chart-topping commercial bestseller with zero knowledge of the user'
  ];
  const randomAmnesiaBucket = amnesiaBuckets[Math.floor(Math.random() * amnesiaBuckets.length)];

  const prompt = (!memoriesEnabled)
    ? `
You are a generic, unpersonalized media database with complete amnesia because Walrus Memory is currently DISABLED.
You have NO memory, taste profile, guardrails, seen history, or past knowledge of this user whatsoever.
Randomly pick ONE title for the category: "${mediaType}" — specifically lean toward ${randomAmnesiaBucket}.
${watchlistConstraint}
TASK:
Pick ONE random mainstream/commercial title in a flat, generic catalog voice (demonstrating how unpersonalized and tone-deaf recommendations are without Walrus Memory).
RULES:
1. ${watchlistOnly ? 'Choose STRICTLY from the watchlist provided above.' : 'Pick a random commercial/mainstream title without any user context.'}
2. coda_blurb: A generic 1-sentence catalog tagline (under 8 words) describing the genre or popularity.
3. pitch_paragraphs: 2 generic, surface-level overview paragraphs describing the plot and commercial appeal. Do NOT personalize or say "you".
4. attributed_memory: "" (leave completely empty).
5. Provide genres (array of strings), release_year (string), studio/director/author (string), and brief description (1-2 sentences).

Return strictly JSON format:
{
  "title": "Exact Title of Media",
  "coda_blurb": "Popular mainstream hit for general audiences.",
  "pitch_paragraphs": ["Paragraph 1", "Paragraph 2"],
  "genres": ["Genre1", "Genre2"],
  "release_year": "2020",
  "studio": "Studio or Director",
  "description": "Short description.",
  "attributed_memory": ""
}
`
    : `
You are Coda. An observant, sharp media curator and friend who recommends works that genuinely match the specific facet of the user's soul spotlighted below.
You operate strictly on the user's decentralized memory recalled from Walrus Protocol.

Memory Scout Probe Executed: "${queryUsed}"
${situationalDirective}

Spotlighted Atomic Memories Recalled from Walrus Protocol (Focus your pick on these specific facets!):
${memoriesContext}
${watchlistConstraint}
Walrus Guardrails / Dealbreakers (Strictly avoid):
${guardrailsList.join(', ') || 'None specified'}

Already Seen on Walrus (Never recommend these or the exact titles named inside the recalled memories above):
${seenList.join(', ') || 'None'}

Rejected / Not For Me on Walrus:
${notForMeList.join(', ') || 'None'}

TASK:
Recommend ONE specific, extraordinary title for the category: "${mediaType}" that directly satisfies the Spotlighted Atomic Memories Recalled from Walrus Protocol above.
RULES:
1. Do NOT recommend anything in the Already Seen or Not For Me lists, and do NOT recommend a title that the user already named as a favorite in their recalled memories.
2. Respect all Walrus Guardrails / Dealbreakers strictly.
3. ${watchlistOnly ? 'Choose STRICTLY from the watchlist provided above.' : 'Match the specific genre, tone, or creator affinity in the spotlighted Walrus memories above (whether that is comedy, kinetic action, romance, sci-fi, thriller, or drama) — do NOT default to slow/melancholy drama unless the spotlighted memory asks for it.'}
4. coda_blurb: exactly ONE sentence, maximum 8 words, bold conviction without starting with "This" or "You".
5. pitch_paragraphs: exactly 2 vivid paragraphs explaining why this work is essential for them, connecting directly to the spotlighted Walrus memories.
6. attributed_memory: Copy the exact text of the #1 spotlighted Walrus memory from the list above that most decisively justified picking this work.
7. Provide genres (array of strings, e.g. ["Action", "Thriller"]), estimated release_year (string), studio/director/author (string), and brief description (1-2 sentences).

Return strictly JSON format:
{
  "title": "Exact Title of Media",
  "coda_blurb": "Punchy conviction under 8 words",
  "pitch_paragraphs": ["Paragraph 1...", "Paragraph 2..."],
  "attributed_memory": "Exact recalled memory text that justified this pick",
  "genres": ["Genre1", "Genre2"],
  "release_year": "2019",
  "studio": "Director or Studio or Author",
  "description": "Short synopsis."
}
`;

  try {
    const response = await callGeminiChat({
      messages: [
        { role: 'system', content: memoriesEnabled ? 'You are Coda, an elite media curator powered exclusively by decentralized memory on Walrus Protocol.' : 'You are a generic media catalog with no user memory.' },
        { role: 'user', content: prompt }
      ],
      responseFormat: { type: 'json_object' },
      temperature: memoriesEnabled ? 0.4 : 0.9,
    });

    let raw = response.choices[0].message.content.trim();
    if (raw.startsWith('```json')) raw = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    else if (raw.startsWith('```')) raw = raw.replace(/^```\s*/, '').replace(/\s*```$/, '');

    const data = JSON.parse(raw);
    const title = data.title;
    
    // Fetch real assets (posters, trailer, ost)
    let assets = { poster_url: '', trailer_url: '', ost_url: '' };
    try {
      assets = await mediaService.fetchAssets(title, mediaType);
    } catch (err) {
      console.warn(`[Walrus Curator] Could not fetch assets for "${title}":`, err.message);
    }

    const hashId = crypto.createHash('md5').update(`${mediaType}:${title.toLowerCase()}:${memoriesEnabled ? 'walrus' : 'cold'}`).digest('hex');

    const cleanStr = (str) => (str ? String(str).replace(/\*\*/g, '').replace(/\*/g, '').trim() : '');
    const cleanList = (arr) => (Array.isArray(arr) ? arr.map(s => cleanStr(s)).filter(Boolean) : []);

    let recalledMemoriesFormatted = [];
    let attributedMemText = '';

    if (memoriesEnabled) {
      const memoriesToFormat = allMemories.length > 0 ? allMemories : [];
      attributedMemText = cleanStr(data.attributed_memory) || cleanStr(memoriesToFormat[0]?.text || '');

      recalledMemoriesFormatted = memoriesToFormat.slice(0, 4).map((m, idx) => ({
        category: m.category || 'Walrus Memory',
        text: cleanStr(m.text || m.content || ''),
        namespace: m.namespace || formatNamespace(userId, 'core'),
        blob_id: m.blob_id || m.blobId || null,
        blobId: m.blob_id || m.blobId || null,
        job_id: m.job_id || null,
        status: m.status || ((m.blob_id || m.blobId) ? 'done' : 'live'),
        distance: m.distance ?? null,
        created_at: m.created_at || null,
        query_used: m.query_used || queryUsed,
        timestamp: m.timestamp || Date.now(),
        paragraph_index: idx % 2,
        is_attributed: (cleanStr(m.text || m.content || '') === attributedMemText) || idx === 0
      }));
    }

    return {
      id: hashId,
      title: cleanStr(title),
      media_type: mediaType,
      coda_blurb: cleanStr(data.coda_blurb) || "Because some stories stay with you forever.",
      pitch_paragraphs: cleanList(data.pitch_paragraphs).length > 0
        ? cleanList(data.pitch_paragraphs)
        : [cleanStr(data.description) || "A notable work in its medium."],
      poster_url: (assets.poster_url && assets.poster_url.startsWith('http') && !assets.poster_url.includes('/api/recommend/proxy-image'))
        ? `/api/recommend/proxy-image?url=${encodeURIComponent(assets.poster_url)}`
        : (assets.poster_url || ''),
      ost_url: assets.ost_url || '',
      trailer_url: assets.trailer_url || '',
      description: cleanStr(data.description) || '',
      genres: data.genres || [mediaType],
      tags: (data.genres || []).slice(0, 5),
      release_year: String(data.release_year || 'Recent'),
      studio: data.studio || 'Acclaimed',
      recalled_memories: recalledMemoriesFormatted,
      query_used: memoriesEnabled ? queryUsed : '',
      mood_angle: memoriesEnabled ? moodAngle : '',
      attributed_memory: memoriesEnabled ? attributedMemText : ''
    };
  } catch (err) {
    console.error('[Walrus Curator Error]:', err.message || err);
    
    if (watchlistOnly) {
      if (watchlistTitles.length === 0) return null;
      const chosenTitle = watchlistTitles[0];
      let assets = { poster_url: '', trailer_url: '', ost_url: '' };
      try {
        assets = await mediaService.fetchAssets(chosenTitle, mediaType);
      } catch (_) {}
      const hashId = crypto.createHash('md5').update(`${mediaType}:${chosenTitle.toLowerCase()}`).digest('hex');
      return {
        id: hashId,
        title: chosenTitle,
        media_type: mediaType,
        coda_blurb: "Waiting on your watchlist.",
        pitch_paragraphs: ["Saved in your watchlist for the exact right moment.", "A resonant work waiting to be experienced."],
        poster_url: assets.poster_url || '',
        ost_url: assets.ost_url || '',
        trailer_url: assets.trailer_url || '',
        description: "From your saved watchlist.",
        genres: [mediaType],
        tags: [mediaType, "Watchlist"],
        release_year: "Recent",
        studio: "Curated",
        recalled_memories: [],
        query_used: "",
        mood_angle: "Watchlist Priority",
        attributed_memory: ""
      };
    }

    const amnesiaFallbacks = {
      movie: [
        { title: "Transformers: Revenge of the Fallen", blurb: "Explosive giant robots battling across the globe.", pitch: ["Sam Witwicky leaves the Autobots behind for a normal life, only to be dragged back into a massive CGI robot war.", "High-octane explosions, loud action set-pieces, and nonstop commercial spectacle."], genres: ["Action", "Sci-Fi"], release_year: "2009", studio: "Michael Bay" },
        { title: "Saw III", blurb: "Brutal traps and relentless gore.", pitch: ["Jigsaw tests a kidnapped doctor while putting another victim through a grueling series of violent mechanical traps.", "Graphic body horror and unrelenting suspense designed for hardcore gore fans."], genres: ["Horror", "Gore"], release_year: "2006", studio: "Lionsgate" },
        { title: "F9: The Fast Saga", blurb: "Cars, explosions, and gravity-defying stunts.", pitch: ["Dom Toretto and his crew confront an international plot led by his estranged brother with rocket-powered cars.", "Loud, blockbuster popcorn entertainment with maximum spectacle."], genres: ["Action", "Adventure"], release_year: "2021", studio: "Universal" }
      ],
      anime: [
        { title: "Sword Art Online", blurb: "Trapped inside a massive fantasy MMORPG.", pitch: ["Thousands of players are locked inside a virtual reality game where dying in-game means dying in the real world.", "Mainstream action-fantasy packed with power-ups, harem tropes, and sword battles."], genres: ["Action", "Fantasy"], release_year: "2012", studio: "A-1 Pictures" },
        { title: "Mobile Suit Gundam SEED", blurb: "Giant mecha warfare across space colonies.", pitch: ["Teenage pilot Kira Yamato is thrust into an interstellar war piloting an advanced military mobile suit.", "Explosive mecha battles and melodramatic space politics."], genres: ["Mecha", "Action"], release_year: "2002", studio: "Sunrise" }
      ],
      book: [
        { title: "Fifty Shades of Grey", blurb: "Commercial romance and tabloid drama.", pitch: ["A college graduate enters a tumultuous relationship with a wealthy young business magnate.", "A mass-market commercial bestseller known for melodrama."], genres: ["Romance"], release_year: "2011", studio: "E. L. James" },
        { title: "The Da Vinci Code", blurb: "Fast-paced conspiracy thriller across Europe.", pitch: ["Symbologist Robert Langdon investigates a murder in the Louvre that points to a centuries-old secret society.", "An airport bestseller packed with cliffhangers and puzzles."], genres: ["Thriller", "Mystery"], release_year: "2003", studio: "Dan Brown" }
      ]
    };

    // Graceful fallback if LLM call fails
    const fallbacks = memoriesEnabled ? {
      movie: [
        { title: "Past Lives", blurb: "Two souls across time and quiet longing.", pitch: ["Nora and Hae Sung share a bond deeply woven across decades and continents, exploring what could have been.", "A gentle, achingly beautiful exploration of destiny and unspoken connection."], genres: ["Drama", "Romance"], release_year: "2023", studio: "A24" },
        { title: "Drive My Car", blurb: "Quiet grief finding peace in motion.", pitch: ["An aging theater director confronts grief and human vulnerability through unexpected camaraderie.", "Slow-burning, profoundly moving, and exquisitely composed."], genres: ["Drama"], release_year: "2021", studio: "Ryusuke Hamaguchi" },
        { title: "Aftersun", blurb: "Faded memory holding onto quiet love.", pitch: ["Sophie reflects on a bittersweet holiday with her young, loving father twenty years earlier.", "A tender, heartbreaking study of memory, joy, and sorrow."], genres: ["Drama"], release_year: "2022", studio: "Charlotte Wells" }
      ],
      anime: [
        { title: "Mushishi", blurb: "Silent wonder in nature's hidden currents.", pitch: ["Ginko travels misty landscapes studying ethereal lifeforms, mediating between humanity and nature.", "Sublime, meditative storytelling with unmatched atmosphere and tranquility."], genres: ["Supernatural", "Slice of Life", "Mystery"], release_year: "2005", studio: "Artland" },
        { title: "A Silent Voice", blurb: "Forgiveness earned through raw human courage.", pitch: ["A former bully seeks redemption and true connection with the deaf girl he once hurt.", "One of the most emotionally resonant and honest animated films ever created."], genres: ["Drama", "Romance"], release_year: "2016", studio: "Kyoto Animation" },
        { title: "Frieren: Beyond Journey's End", blurb: "An elf discovering the weight of human warmth.", pitch: ["An immortal mage retraces the journey of her late companions to understand human hearts.", "Bittersweet, profoundly philosophical, and breathtakingly paced."], genres: ["Fantasy", "Adventure", "Drama"], release_year: "2023", studio: "Madhouse" }
      ],
      book: [
        { title: "Kafka on the Shore", blurb: "Dreamlike odyssey through fate and memory.", pitch: ["A runaway teenage boy and an elderly man with a peculiar gift navigate parallel surreal journeys.", "Murakami at his most imaginative, blending reality with profound melancholic whimsy."], genres: ["Magical Realism", "Fiction"], release_year: "2002", studio: "Haruki Murakami" },
        { title: "The Remains of the Day", blurb: "A dignified life masking profound unspoken regret.", pitch: ["Stevens, an English butler, recalls decades of service while examining the love he never dared voice.", "A devastating, masterfully understated masterpiece about dignity and longing."], genres: ["Literary Fiction", "Historical"], release_year: "1989", studio: "Kazuo Ishiguro" }
      ]
    } : amnesiaFallbacks;

    const typeKey = (mediaType || 'movie').toLowerCase();
    const list = fallbacks[typeKey] || fallbacks.movie;
    const lowerSeen = (seenList || []).map(s => String(s).toLowerCase());
    const lowerNotForMe = (notForMeList || []).map(n => String(n).toLowerCase());
    const chosen = memoriesEnabled
      ? (list.find(item => !lowerSeen.includes(item.title.toLowerCase()) && !lowerNotForMe.includes(item.title.toLowerCase())) || list[0])
      : list[Math.floor(Math.random() * list.length)];

    console.log(`[Walrus Curator] Using resilient fallback masterpiece: "${chosen.title}" (${mediaType})`);
    let assets = { poster_url: '', trailer_url: '', ost_url: '' };
    try {
      assets = await mediaService.fetchAssets(chosen.title, mediaType);
    } catch (_) {}

    const cleanStr = (str) => (str ? String(str).replace(/\*\*/g, '').replace(/\*/g, '').trim() : '');
    const cleanList = (arr) => (Array.isArray(arr) ? arr.map(s => cleanStr(s)).filter(Boolean) : []);

    const fallbackMemories = (memoriesEnabled && allMemories.length > 0) ? allMemories.slice(0, 4) : [];

    const hashId = crypto.createHash('md5').update(`${mediaType}:${chosen.title.toLowerCase()}`).digest('hex');
    return {
      id: hashId,
      title: cleanStr(chosen.title),
      media_type: mediaType,
      coda_blurb: cleanStr(chosen.blurb),
      pitch_paragraphs: cleanList(chosen.pitch),
      poster_url: (assets.poster_url && assets.poster_url.startsWith('http') && !assets.poster_url.includes('/api/recommend/proxy-image'))
        ? `/api/recommend/proxy-image?url=${encodeURIComponent(assets.poster_url)}`
        : (assets.poster_url || ''),
      ost_url: assets.ost_url || '',
      trailer_url: assets.trailer_url || '',
      description: cleanStr(chosen.pitch[0]),
      genres: chosen.genres,
      tags: chosen.genres,
      release_year: chosen.release_year,
      studio: chosen.studio,
      recalled_memories: fallbackMemories.map((m, idx) => ({
        category: m.category || 'Walrus Memory',
        text: cleanStr(m.text || m.content || ''),
        namespace: m.namespace || formatNamespace(userId, 'core'),
        blob_id: m.blob_id || m.blobId || null,
        blobId: m.blob_id || m.blobId || null,
        job_id: m.job_id || null,
        status: m.status || 'done',
        distance: m.distance ?? null,
        created_at: m.created_at || null,
        timestamp: m.timestamp || Date.now(),
        paragraph_index: idx % 2,
        is_attributed: idx === 0
      })),
      query_used: memoriesEnabled ? queryUsed : '',
      mood_angle: memoriesEnabled ? moodAngle : '',
      attributed_memory: memoriesEnabled ? (fallbackMemories[0]?.text || '') : ''
    };
  }
}

/**
 * Direct write helper for "Loved it" swipe action (clean atomic facts, no boilerplate fluff)
 */
async function rememberLovedTitle(userId, title, mediaType, whyLoved = '') {
  if (!userId || !title) return null;
  const normalizedCategory = normalizeCategory(mediaType);
  let thematicNote = whyLoved;
  if (!thematicNote) {
    try {
      const { enrichTitleThematicContext } = require('../scripts/enrich_stored_memories');
      thematicNote = await enrichTitleThematicContext(title, normalizedCategory);
    } catch (_) {
      thematicNote = 'cherished favorite';
    }
  }
  const fact = `Loved ${normalizedCategory}: "${title}" (${thematicNote})`;
  const coreFact = `Enjoys works like "${title}" — ${thematicNote}`;
  const seenFact = `Already watched/seen: "${title}"`;

  invalidateUserRecallCache(userId);
  const [catWrite, coreWrite, seenWrite] = await Promise.all([
    rememberFact(fact, formatNamespace(userId, normalizedCategory), 2, `${normalizedCategory.toUpperCase()} Taste Anchor`),
    rememberFact(coreFact, formatNamespace(userId, 'core'), 2, 'Core Taste Facet'),
    rememberFact(seenFact, formatNamespace(userId, 'guardrails'), 2, 'Already Seen'),
  ]);
  return {
    status: 'success',
    savedMemory: fact,
    walrusWrites: [catWrite, coreWrite, seenWrite].filter(Boolean),
  };
}

/**
 * Direct write helper for "Seen it" swipe action
 */
async function rememberSeenTitle(userId, title) {
  if (!userId || !title) return null;
  const seenFact = `Already watched/seen: "${title}"`;
  invalidateUserRecallCache(userId);
  const writeRes = await rememberFact(seenFact, formatNamespace(userId, 'guardrails'), 2, 'Already Seen');
  return {
    status: 'success',
    savedMemory: seenFact,
    walrusWrites: writeRes ? [writeRes] : [],
  };
}

/**
 * Direct write helper for "Why doesn't this fit?" feedback sheet
 */
async function rememberFeedbackGuardrail(userId, title, mediaType, reason) {
  if (!userId || !title) return null;
  const normalizedCategory = normalizeCategory(mediaType);
  const rule = `Dealbreaker: Avoid/Disliked "${title}" (${normalizedCategory}) — ${reason || 'unfitting tone or pacing'}`;
  invalidateUserRecallCache(userId);
  const writeRes = await rememberFact(rule, formatNamespace(userId, 'guardrails'), 2, 'Guardrail Protocol');
  return {
    status: 'success',
    savedMemory: rule,
    walrusWrites: writeRes ? [writeRes] : [],
  };
}

module.exports = {
  getClient,
  rememberFact,
  recallMemories,
  formatNamespace,
  normalizeCategory,
  routeAndSaveLivingMemory,
  generateDynamicMemoryQuery,
  recallForRecommendation,
  inspectLiveWalrus,
  resolvePendingWriteJobs,
  curateWithWalrusMemory,
  rememberLovedTitle,
  rememberSeenTitle,
  rememberFeedbackGuardrail,
};
