const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const llmService = require('../services/llmService');
const searchService = require('../services/searchService');
const mediaService = require('../services/mediaService');
const loggerService = require('../services/loggerService');

// Cache of recent direct watchlist recommendations to pass down to the lazy pitch route
const recentWatchlistPicks = new Set();

// Create image cache directory
const IMAGE_CACHE_DIR = path.join(__dirname, '../cache/images');
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

// Search Cache setup
const SEARCH_CACHE_FILE = path.join(__dirname, '../cache/search_cache.json');
let searchCache = {};
if (fs.existsSync(SEARCH_CACHE_FILE)) {
  try {
    searchCache = JSON.parse(fs.readFileSync(SEARCH_CACHE_FILE, 'utf8'));
  } catch (_) {}
}

const saveSearchCache = () => {
  try {
    const cacheDir = path.dirname(SEARCH_CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(SEARCH_CACHE_FILE, JSON.stringify(searchCache, null, 2), 'utf8');
  } catch (e) {
    console.error('[Search Cache Save Error]:', e.message);
  }
};

// Metadata Cache setup
const METADATA_CACHE_FILE = path.join(__dirname, '../cache/metadata_cache.json');
let metadataCache = {};
if (fs.existsSync(METADATA_CACHE_FILE)) {
  try {
    metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8'));
  } catch (_) {}
}

const saveMetadataCache = () => {
  try {
    const cacheDir = path.dirname(METADATA_CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(metadataCache, null, 2), 'utf8');
  } catch (e) {
    console.error('[Metadata Cache Save Error]:', e.message);
  }
};

// User Soul Graph cache setup
const SOUL_GRAPH_FILE = path.join(__dirname, '../cache/user_soul_graph.json');
let userSoulGraph = {};
if (fs.existsSync(SOUL_GRAPH_FILE)) {
  try {
    userSoulGraph = JSON.parse(fs.readFileSync(SOUL_GRAPH_FILE, 'utf8'));
  } catch (_) {}
}

const saveSoulGraph = () => {
  try {
    fs.writeFileSync(SOUL_GRAPH_FILE, JSON.stringify(userSoulGraph, null, 2), 'utf8');
  } catch (e) {
    console.error('[Soul Graph Cache Save Error]:', e.message);
  }
};

// Media Brain cache setup
const MEDIA_BRAIN_FILE = path.join(__dirname, '../cache/media_brain.json');
let mediaBrain = {};
if (fs.existsSync(MEDIA_BRAIN_FILE)) {
  try {
    mediaBrain = JSON.parse(fs.readFileSync(MEDIA_BRAIN_FILE, 'utf8'));
  } catch (_) {}
}

const saveMediaBrain = () => {
  try {
    fs.writeFileSync(MEDIA_BRAIN_FILE, JSON.stringify(mediaBrain, null, 2), 'utf8');
  } catch (e) {
    console.error('[Media Brain Cache Save Error]:', e.message);
  }
};


const getCachedMetadata = async (title, mediaType) => {
  const key = `${mediaType.toLowerCase().replace(/[^a-z0-9]/g, '')}:${title.toLowerCase().trim()}`;
  if (metadataCache[key]) {
    console.log(`[Metadata Cache Hit] serving cached metadata for: "${title}" (${mediaType})`);
    return metadataCache[key];
  }

  console.log(`[Metadata Cache Miss] fetching metadata for: "${title}" (${mediaType})...`);
  let meta = await searchService.fetchMetadataForCandidate(title, mediaType);
  if (!meta || (!meta.genres?.length && !meta.tags?.length)) {
    const llmMeta = await llmService.fetchMetadataViaLLM(title, mediaType);
    if (llmMeta) {
      meta = {
        title: llmMeta.title || title,
        genres: llmMeta.genres || [],
        tags: llmMeta.tags || [],
        description: llmMeta.description || '',
        image: meta?.image || '',
        release_year: llmMeta.release_year || '',
        studio: llmMeta.studio || ''
      };
    }
  }

  if (meta) {
    const cachedMeta = {
      title: meta.title || title,
      genres: meta.genres || [],
      tags: meta.tags || [],
      description: meta.description || '',
      image: meta.image || '',
      release_year: meta.release_year || '',
      studio: meta.studio || ''
    };
    metadataCache[key] = cachedMeta;
    saveMetadataCache();
    return cachedMeta;
  }

  return {
    title: title,
    genres: [],
    tags: [],
    description: '',
    image: '',
    release_year: '',
    studio: ''
  };
};

const getCachedSnippetData = async (key, fetchFn) => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (searchCache[key] && (now - searchCache[key].timestamp < ONE_DAY)) {
    console.log(`[Search Cache Hit] serving cached data for: "${key}"`);
    return searchCache[key].results;
  }
  
  const results = await fetchFn();
  searchCache[key] = {
    timestamp: now,
    results: results
  };
  saveSearchCache();
  return results;
};

// Cached wrapper helpers
const cachedScrapeForums = (query) => getCachedSnippetData(`forum:${query}`, () => searchService.scrapeForums(query));
const cachedFetchMAL = (titles) => getCachedSnippetData(`mal:${titles.join(',')}`, () => searchService.fetchMALRecommendations(titles));
const cachedFetchAniListRecs = (titles) => getCachedSnippetData(`anilist_rec:${titles.join(',')}`, () => searchService.fetchAniListRecommendations(titles));
const cachedFetchKitsu = (query) => getCachedSnippetData(`kitsu:${query}`, () => searchService.fetchKitsuAnimeSnippets(query));
const cachedFetchAniListSearch = (query) => getCachedSnippetData(`anilist_search:${query}`, () => searchService.fetchAniListAnimeSnippets(query));
const cachedFetchVNDBRecs = (titles) => getCachedSnippetData(`vndb_rec:${titles.join(',')}`, () => searchService.fetchVNDBRecommendations(titles));
const cachedFetchVNDBSnippets = (query, limit, platformHint = null) => {
  const platKey = Array.isArray(platformHint) ? platformHint.join(',') : (platformHint || '');
  return getCachedSnippetData(`vndb_search:${query}:${limit}:${platKey}`, () => searchService.fetchVNDBSnippets(query, limit, platformHint));
};
const cachedFetchLetterboxdReviews = (title) => getCachedSnippetData(`letterboxd_reviews:${title}`, () => searchService.scrapeLetterboxdReviews(title));

const runSequentialTasksWithCacheDelay = async (tasks) => {
  const results = [];
  for (const task of tasks) {
    const t0 = Date.now();
    const res = await task();
    results.push(res);
    const elapsed = Date.now() - t0;
    if (elapsed > 100) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return results;
};

router.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  try {
    if (!url) {
      return res.status(400).send('Missing url parameter');
    }
    
    // Hash the URL to get a safe filename
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const cachedFilePath = path.join(IMAGE_CACHE_DIR, hash);
    const metaPath = cachedFilePath + '.json';
    
    if (fs.existsSync(cachedFilePath)) {
      let contentType = 'image/jpeg';
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          contentType = meta.contentType || contentType;
        } catch (_) {}
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
      res.setHeader('Access-Control-Allow-Origin', '*');
      fs.createReadStream(cachedFilePath).pipe(res);
      return;
    }
    
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*'
      },
      timeout: 10000
    });
    
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const buffer = Buffer.from(response.data);
    
    // Save to disk asynchronously
    fs.writeFile(cachedFilePath, buffer, () => {});
    fs.writeFile(metaPath, JSON.stringify({ contentType, url }), () => {});
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (error) {
    console.error('[Proxy Image Error] for URL:', url, ':', error.message);
    res.status(500).send('Failed to proxy image');
  }
});
const normalizeTitle = (title) => {
  if (!title) return '';
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const isExcluded = (candidateTitle, excludedTitles) => {
  if (!candidateTitle) return false;
  const normalizedCandidate = normalizeTitle(candidateTitle);
  if (!normalizedCandidate) return false;

  for (const title of excludedTitles) {
    if (!title) continue;
    const normalizedExcluded = normalizeTitle(title);
    if (!normalizedExcluded) continue;

    // Direct match
    if (normalizedCandidate === normalizedExcluded) return true;

    // Substring match for reasonably long titles (to avoid short word collisions)
    if (normalizedExcluded.length >= 3) {
      if (normalizedCandidate.includes(normalizedExcluded) || normalizedExcluded.includes(normalizedCandidate)) {
        return true;
      }
    }
  }
  return false;
};

// ── Content Guardrail Pre-Filter ─────────────────────────────────────────────
// Deterministically filters candidates based on content signals in the guardrails
// string BEFORE they reach the LLM scorer. No API call — pure tag/genre matching.

// Map of guardrail signal words → genre/tag terms that should be blocked
const CONTENT_SIGNAL_BLOCKLISTS = [
  // Religious/values-based: block explicit sexual/adult content
  {
    signals: ['christian', 'religious', 'faith-based', 'faith based', 'wholesome', 'family-friendly', 'family friendly', 'clean content', 'no adult', 'no explicit', 'no sexual', 'no 18+', 'no mature content'],
    blocked: ['erotica', 'erotic', 'eroge', 'adult', '18+', 'hentai', 'explicit', 'sexual content', 'nudity', 'ecchi', 'sexually explicit', 'pornographic', 'nsfw', 'eroticism', 'softcore', 'hardcore', 'adult content']
  },
  // No gore / violence
  {
    signals: ['no gore', 'no violence', 'no guro', 'avoid violence', 'avoid gore', 'no graphic violence', 'no blood'],
    blocked: ['gore', 'guro', 'graphic violence', 'extreme violence', 'body horror', 'torture', 'snuff', 'splatter']
  },
  // No horror
  {
    signals: ['no horror', 'avoid horror', 'not horror'],
    blocked: ['horror', 'psychological horror', 'survival horror', 'terror', 'disturbing']
  },
  // No NTR / cheating
  {
    signals: ['no ntr', 'no cheating', 'no netorare', 'avoid ntr'],
    blocked: ['ntr', 'netorare', 'netori', 'cheating', 'cuckold']
  },
  // No BL / yaoi
  {
    signals: ['no bl', 'no yaoi', 'no boys love', 'no boyslove', 'no male romance'],
    blocked: ['bl', 'yaoi', 'boys love', 'male x male', 'shounen ai', 'shounen-ai']
  },
  // No GL / yuri
  {
    signals: ['no gl', 'no yuri', 'no girls love', 'no girlslove', 'no female romance'],
    blocked: ['gl', 'yuri', 'girls love', 'shoujo ai', 'shoujo-ai']
  },
];

/**
 * Helper to check if a tag matches a blocked term precisely.
 * Avoids matching substring letters inside larger words (e.g., matching "bl" inside "ensemble").
 * 
 * @param {string} tag 
 * @param {string} blockedTerm 
 * @returns {boolean}
 */
const tagMatchesBlockedTerm = (tag, blockedTerm) => {
  if (tag === blockedTerm) return true;
  if (!tag.includes(blockedTerm)) return false;

  let pos = tag.indexOf(blockedTerm);
  while (pos !== -1) {
    const charBefore = pos > 0 ? tag[pos - 1] : '';
    const charAfter = pos + blockedTerm.length < tag.length ? tag[pos + blockedTerm.length] : '';

    // Treat alphanumeric characters and hyphens as word characters
    const isBeforeAlphanumeric = /[a-z0-9\-]/i.test(charBefore);
    const isAfterAlphanumeric = /[a-z0-9\-]/i.test(charAfter);

    if (!isBeforeAlphanumeric && !isAfterAlphanumeric) {
      return true;
    }
    pos = tag.indexOf(blockedTerm, pos + 1);
  }
  return false;
};

/**
 * Filters candidates using deterministic content signal matching against guardrails.
 * Returns the filtered candidates array and logs removals.
 *
 * @param {Array} candidates - Array of candidate objects with .genres and .tags
 * @param {string} guardrailsString - The user's guardrails as a free-text string
 * @returns {Array} Filtered candidates
 */
const filterByContentGuardrails = (candidates, guardrailsString) => {
  if (!guardrailsString || !candidates || candidates.length === 0) return candidates;

  const guardrailsLower = guardrailsString.toLowerCase();

  // Build the active blocklist for this user based on their guardrail signals
  const activeBlockedTerms = new Set();
  for (const rule of CONTENT_SIGNAL_BLOCKLISTS) {
    const signalTriggered = rule.signals.some(sig => guardrailsLower.includes(sig));
    if (signalTriggered) {
      for (const term of rule.blocked) {
        activeBlockedTerms.add(term.toLowerCase());
      }
    }
  }

  if (activeBlockedTerms.size === 0) return candidates; // No content signals — skip filter

  console.log(`[ContentFilter] Active blocked content terms: ${[...activeBlockedTerms].join(', ')}`);

  const filtered = candidates.filter(candidate => {
    const allTags = [
      ...(candidate.genres || []),
      ...(candidate.tags || []),
    ].map(t => (t || '').toLowerCase());

    const blocked = allTags.find(tag => {
      return [...activeBlockedTerms].some(blockedTerm => tagMatchesBlockedTerm(tag, blockedTerm));
    });

    if (blocked) {
      console.log(`[ContentFilter] ✗ Dropping "${candidate.title}" — tag/genre "${blocked}" violates guardrails.`);
      return false;
    }
    return true;
  });

  const dropped = candidates.length - filtered.length;
  if (dropped > 0) {
    console.log(`[ContentFilter] Dropped ${dropped} candidate(s) for content guardrail violations. ${filtered.length} remain.`);
  }
  return filtered;
};

// ── Slim Routing Payload Builder ──────────────────────────────────────────────
// Builds a trimmed version of the payload for the synthesizeAndRoute LLM call.
// Reduces token count without losing meaningful routing signal.
const MAX_SEEN_FOR_ROUTING = 30;
const MAX_CORE_IDENTITY_CHARS = 1500;
const MAX_GUARDRAILS_CHARS = 500;

const buildSlimRoutingPayload = (payload) => {
  const slim = { ...payload };

  // Watchlist: only title + mediaType (drop posterUrl, ostUrl, description, codaBlurb, addedAt)
  if (Array.isArray(slim.watchlist)) {
    slim.watchlist = slim.watchlist.map(item => ({
      title: item.title || item.Title || '',
      mediaType: item.mediaType || item.media_type || ''
    }));
  }

  // Seen: cap at most recent 30 entries
  if (Array.isArray(slim.seen) && slim.seen.length > MAX_SEEN_FOR_ROUTING) {
    slim.seen = slim.seen.slice(-MAX_SEEN_FOR_ROUTING);
  }

  // Core identity: truncate at 1500 chars (harmonizer output is usually < 800)
  if (typeof slim.core_identity === 'string' && slim.core_identity.length > MAX_CORE_IDENTITY_CHARS) {
    slim.core_identity = slim.core_identity.slice(0, MAX_CORE_IDENTITY_CHARS) + '...';
  }

  // Guardrails: truncate at 500 chars
  if (typeof slim.guardrails === 'string' && slim.guardrails.length > MAX_GUARDRAILS_CHARS) {
    slim.guardrails = slim.guardrails.slice(0, MAX_GUARDRAILS_CHARS) + '...';
  }

  return slim;
};

const runRecommendationPipeline = async (payload) => {
  console.log('\n[Recommend] ═══════════════════════════════════════════════════');
  console.log('[Recommend] Starting recommendation pipeline for media type:', payload.requested_media_type);

  // Compile/Update the User Soul Graph using flat core_identity
  if (payload.core_identity) {
    try {
      console.log('[Recommend] Syncing User Soul Graph...');
      userSoulGraph = await llmService.generateUserSoulGraph(payload.core_identity, userSoulGraph);
      saveSoulGraph();
      console.log('[Recommend] ✅ User Soul Graph synced successfully.');
    } catch (err) {
      console.error('[Recommend] Failed to sync User Soul Graph:', err.message);
    }
  }
  
  const limit = typeof payload.limit === 'number' ? payload.limit : 1;
  const seenList = Array.isArray(payload.seen) ? payload.seen : [];
  const notForMeList = Array.isArray(payload.not_for_me) ? payload.not_for_me : [];
  const watchlist = payload.watchlist || [];
  const requestedType = payload.requested_media_type;

  // Extract loved titles
  const lovedTitles = [];
  if (typeof payload.core_identity === 'string' && !payload.skip_random_seeds) {
    const highlyValuesMatches = payload.core_identity.matchAll(/Highly values:\s*(.*?)\s*\(loved work\)/ig);
    for (const match of highlyValuesMatches) {
      if (match[1]) lovedTitles.push(match[1].trim());
    }
    const lovedMatches = payload.core_identity.matchAll(/Loved:\s*(.*?)\s*\(excellent match\)/ig);
    for (const match of lovedMatches) {
      if (match[1] && !lovedTitles.includes(match[1].trim())) {
        lovedTitles.push(match[1].trim());
      }
    }
  }
  payload.loved_titles = lovedTitles;

  const maxRetries = 3;
  let attempt = 0;
  let finalPicks = [];
  let cleanCandidates = [];
  let media_type = (requestedType || '').toLowerCase();
  let search_queries = [];
  let master_directive = '';
  let scrapedSnippets = [];
  let seed_titles = [];
  let selected_vibe_focus = '';
  let candidateTitles = [];

  // Used seeds to avoid picking the same seed on retry
  const usedSeeds = new Set();

  while (attempt <= maxRetries) {
    console.log(`[Recommend] Running Curation Caching attempt ${attempt + 1}/${maxRetries + 1}...`);
    
    let isDirectWatchlistRecommend = false;
    let directWatchlistTitle = null;
    let directWatchlistItem = null;

    // Reset loop variables
    scrapedSnippets = [];
    cleanCandidates = [];
    finalPicks = [];
    candidateTitles = [];

    // Filter matching watchlist items
    const matchingWatchlistItems = watchlist.filter(item => {
      const itemType = (item.mediaType || item.media_type || '').toLowerCase();
      const normRequested = (requestedType || '').toLowerCase();
      if (normRequested === 'anime' && itemType === 'anime') return true;
      if (normRequested === 'movie' && itemType === 'movie') return true;
      if (normRequested === 'tv' && itemType === 'tv') return true;
      if (normRequested === 'visualnovel' && (itemType === 'visual novel' || itemType === 'visualnovel')) return true;
      if (normRequested === 'manga' && itemType === 'manga') return true;
      if (normRequested === 'book' && itemType === 'book') return true;
      if (normRequested === 'game' && itemType === 'game') return true;
      return itemType === normRequested;
    }).filter(item => !usedSeeds.has(item.title));

    // Dynamic Seed and Vibe Selection based on attempt count
    if (attempt === 0) {
      if (matchingWatchlistItems.length > 0 && !payload.skip_random_seeds) {
        const rand = Math.random();
        if (payload.force_direct_watchlist || (rand < 0.15 && !payload.force_watchlist_blend && !payload.force_loved_seed)) {
          isDirectWatchlistRecommend = true;
          directWatchlistItem = matchingWatchlistItems[Math.floor(Math.random() * matchingWatchlistItems.length)];
          directWatchlistTitle = directWatchlistItem.title;
          usedSeeds.add(directWatchlistTitle);
          recentWatchlistPicks.add(directWatchlistTitle);
        } else if (payload.force_watchlist_blend || (rand < 0.30 && !payload.force_loved_seed)) {
          const seedItem = matchingWatchlistItems[Math.floor(Math.random() * matchingWatchlistItems.length)];
          payload.watchlist_seed_title = seedItem.title;
          usedSeeds.add(seedItem.title);
        }
      }

      if (!isDirectWatchlistRecommend && !payload.watchlist_seed_title && lovedTitles.length > 0 && !payload.skip_random_seeds) {
        const rand = Math.random();
        if (payload.force_loved_seed || rand < 0.25) {
          const unusedLoved = lovedTitles.filter(t => !usedSeeds.has(t));
          if (unusedLoved.length > 0) {
            const lovedSeed = unusedLoved[Math.floor(Math.random() * unusedLoved.length)];
            payload.loved_seed_title = lovedSeed;
            usedSeeds.add(lovedSeed);
          }
        }
      }
    } else {
      // Rotations on subsequent attempts:
      payload.watchlist_seed_title = null;
      payload.loved_seed_title = null;
      payload.force_loved_seed = false;
      payload.force_watchlist_blend = false;
      payload.force_direct_watchlist = false;

      if (payload.skip_random_seeds) {
        payload.force_rotation = true;
        console.log(`[Recommend Rotation] Attempt ${attempt}: Forcing routing LLM to rotate its vibe focus & search queries (skipping random seeds).`);
      } else {
        // Rotate to an unused loved title or watchlist title if possible
        const unusedLoved = lovedTitles.filter(t => !usedSeeds.has(t));
        const unusedWatchlist = matchingWatchlistItems.map(item => item.title).filter(t => !usedSeeds.has(t));

        if (unusedWatchlist.length > 0 && Math.random() < 0.5) {
          const nextWatchlistSeed = unusedWatchlist[Math.floor(Math.random() * unusedWatchlist.length)];
          payload.watchlist_seed_title = nextWatchlistSeed;
          usedSeeds.add(nextWatchlistSeed);
          console.log(`[Recommend Rotation] Attempt ${attempt}: Rotating watchlist seed to: "${nextWatchlistSeed}"`);
        } else if (unusedLoved.length > 0) {
          const nextLovedSeed = unusedLoved[Math.floor(Math.random() * unusedLoved.length)];
          payload.loved_seed_title = nextLovedSeed;
          usedSeeds.add(nextLovedSeed);
          console.log(`[Recommend Rotation] Attempt ${attempt}: Rotating loved title seed to: "${nextLovedSeed}"`);
        } else {
          // Fallback: Rotate vibe focus by telling the LLM to force rotation
          payload.force_rotation = true;
          console.log(`[Recommend Rotation] Attempt ${attempt}: Forcing routing LLM to rotate its vibe focus & search queries.`);
        }
      }
    }

    seed_titles = [];
    selected_vibe_focus = '';

    try {
      if (isDirectWatchlistRecommend) {
        media_type = (directWatchlistItem.mediaType || directWatchlistItem.media_type || requestedType || '').toLowerCase();
        if (media_type === 'visualnovel' || media_type === 'visual novel') {
          media_type = 'visual novel';
        }
        selected_vibe_focus = "Watchlist Curation";
        master_directive = `Recommend and pitch the user's watchlist item '${directWatchlistTitle}'.`;
        search_queries = [`"${directWatchlistTitle}" ${media_type} review site:reddit.com`];
        seed_titles = [];
        scrapedSnippets = await cachedScrapeForums(search_queries[0]);
      } else {
        const routingResult = await llmService.synthesizeAndRoute(buildSlimRoutingPayload(payload));
        media_type = routingResult.media_type;
        search_queries = routingResult.search_queries;
        master_directive = routingResult.master_directive;
        seed_titles = routingResult.seed_titles;
        selected_vibe_focus = routingResult.selected_vibe_focus;

        const resolvedSeeds = (seed_titles && Array.isArray(seed_titles)) ? seed_titles : [];
        const sourceResults = [];

        if (media_type === 'anime') {
          const parallelPromises = [];
          const sequentialTasks = [];

          if (resolvedSeeds.length > 0) {
            parallelPromises.push(cachedFetchAniListRecs(resolvedSeeds).then(r => ({ source: `AniList graph recs (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
            sequentialTasks.push(() => cachedFetchMAL(resolvedSeeds).then(r => ({ source: `MAL community recs (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
            const reviewCacheKey = `mal_reviews:${resolvedSeeds.slice(0,3).join(',')}`;
            sequentialTasks.push(() => getCachedSnippetData(reviewCacheKey, () => searchService.fetchMALReviews(resolvedSeeds)).then(r => ({ source: `MAL user reviews (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
          }

          for (const query of search_queries) {
            if (!query.includes('site:')) {
              parallelPromises.push(cachedFetchAniListSearch(query).then(r => ({ source: `AniList title/tag search: "${query}"`, results: r || [] })));
              sequentialTasks.push(() => cachedFetchKitsu(query).then(r => ({ source: `Jikan/MAL genre search: "${query}"`, results: r || [] })));
            }
            sequentialTasks.push(() => cachedScrapeForums(query).then(r => ({ source: `Web scrape (DDG/Yahoo/Reddit): "${query}"`, results: r || [] })));
          }

          const parallelResults = await Promise.all(parallelPromises);
          sourceResults.push(...parallelResults);

          // Sequential execution of rate-limited tasks with conditional cache delay
          const staggeredResults = await runSequentialTasksWithCacheDelay(sequentialTasks);
          sourceResults.push(...staggeredResults);
        } else if (media_type === 'visual novel') {
          const parallelPromises = [];
          const sequentialTasks = [];

          if (resolvedSeeds.length > 0) {
            parallelPromises.push(cachedFetchVNDBRecs(resolvedSeeds).then(r => ({ source: `VNDB similar-tag recs (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
          }

          for (const query of search_queries) {
            if (!query.includes('site:')) {
              parallelPromises.push(cachedFetchVNDBSnippets(query, 6, payload.platform_hint).then(r => ({ source: `VNDB text search: "${query}"`, results: r || [] })));
            }
            sequentialTasks.push(() => cachedScrapeForums(query).then(r => ({ source: `Web scrape (DDG/Yahoo/Reddit): "${query}"`, results: r || [] })));
          }

          const parallelResults = await Promise.all(parallelPromises);
          sourceResults.push(...parallelResults);

          // Sequential execution of rate-limited tasks with conditional cache delay
          const staggeredResults = await runSequentialTasksWithCacheDelay(sequentialTasks);
          sourceResults.push(...staggeredResults);
        } else if (media_type === 'movie' || media_type === 'tv') {
          // Parallel execution of movie searches and Letterboxd review scraping for seeds
          console.log(`[Recommend] Running movie pipeline with Letterboxd reviews for seeds: ${resolvedSeeds.join(', ')}`);
          const parallelPromises = [];

          // 1. Fetch Letterboxd reviews for the seeds in parallel
          for (const seed of resolvedSeeds) {
            parallelPromises.push(
              cachedFetchLetterboxdReviews(seed).then(r => ({
                source: `Letterboxd reviews for seed: "${seed}"`,
                results: r || []
              }))
            );
          }

          // 2. Fetch search queries in parallel
          for (const query of search_queries) {
            parallelPromises.push(
              cachedScrapeForums(query).then(r => ({
                source: `Web query: "${query}"`,
                results: r || []
              }))
            );
          }

          const settledResults = await Promise.allSettled(parallelPromises);

          let totalFailures = 0;
          for (const outcome of settledResults) {
            if (outcome.status === 'rejected') {
              totalFailures++;
              continue;
            }
            const { source, results } = outcome.value;
            if (results && results.length > 0) {
              const filtered = results.filter(snippet =>
                !isExcluded(snippet.title, seenList) && !isExcluded(snippet.title, notForMeList)
              );
              if (filtered.length > 0) {
                console.log(`[Recommend] ${source} returned ${filtered.length} matching snippets.`);
                scrapedSnippets = scrapedSnippets.concat(filtered);
              }
            } else {
              totalFailures++;
            }
          }

          if (totalFailures >= parallelPromises.length) {
            console.log(`[Recommend] All movie search/review queries failed/returned 0.`);
          }
        } else {
          // Parallel execution of web scraping tasks — all queries fire simultaneously.
          // Promise.allSettled ensures a single slow/blocked query doesn't stall the others.
          console.log(`[Recommend] Running ${search_queries.length} search queries in parallel...`);
          const settledResults = await Promise.allSettled(
            search_queries.map(query => cachedScrapeForums(query).then(r => ({ query, results: r || [] })))
          );

          let totalFailures = 0;
          for (const outcome of settledResults) {
            if (outcome.status === 'rejected') {
              totalFailures++;
              continue;
            }
            const { query, results } = outcome.value;
            if (results.length > 0) {
              const filtered = results.filter(snippet =>
                !isExcluded(snippet.title, seenList) && !isExcluded(snippet.title, notForMeList)
              );
              if (filtered.length > 0) {
                console.log(`[Recommend] Query "${query}" returned ${filtered.length} matching snippets.`);
                scrapedSnippets = scrapedSnippets.concat(filtered);
              }
            } else {
              totalFailures++;
            }
          }

          if (totalFailures >= search_queries.length) {
            console.log(`[Recommend] All search queries failed/returned 0. Likely blocked or offline.`);
          }
        }

        for (const sr of sourceResults) {
          scrapedSnippets = scrapedSnippets.concat(sr.results);
        }
      }

      if (isDirectWatchlistRecommend) {
        let candidateMeta = {
          title: directWatchlistTitle,
          genres: directWatchlistItem.tags || [],
          tags: directWatchlistItem.tags || [],
          description: directWatchlistItem.description || '',
          image: directWatchlistItem.posterUrl || directWatchlistItem.poster_url || ''
        };
        cleanCandidates = [candidateMeta];
      } else {
        // For visual novel (or any other case where candidateTitles was not set by the loop), we do extraction here
        if (candidateTitles.length === 0 && scrapedSnippets.length > 0) {
          const filteredSnippets = scrapedSnippets.filter(snippet => {
            return !isExcluded(snippet.title, seenList) && !isExcluded(snippet.title, notForMeList);
          });
          if (filteredSnippets.length > 0) {
            candidateTitles = await llmService.extractCandidateTitles(filteredSnippets, media_type);
          }
        }

        if (candidateTitles.length === 0) {
          // Fallback: Web search failed, returned 0 results, or yielded no extractable titles. Ask the LLM to directly generate candidate titles.
          const reason = scrapedSnippets.length > 0 ? "returned 0 candidates" : "returned 0 results";
          console.log(`[Recommend] Web search ${reason}. Activating LLM direct fallback to generate candidates for: "${media_type}"`);
          candidateTitles = await llmService.generateDirectCandidates(
            master_directive,
            seed_titles,
            media_type,
            seenList,
            notForMeList
          );
          console.log(`[Recommend] LLM direct fallback generated candidates: ${JSON.stringify(candidateTitles)}`);
        }

        if (candidateTitles.length > 0) {
          // Parallel metadata fetch — all candidates resolved simultaneously.
          // Cache misses are fetched concurrently; 150ms stagger only needed for sequential APIs.
          const metaSettled = await Promise.allSettled(
            candidateTitles.map(title => getCachedMetadata(title, media_type))
          );
          const candidatesWithMetadata = metaSettled
            .filter(o => o.status === 'fulfilled' && o.value)
            .map(o => o.value);

          const seenFiltered = candidatesWithMetadata.filter(candidate => {
            return !isExcluded(candidate.title, seenList) && !isExcluded(candidate.title, notForMeList);
          });

          // Deterministic content pre-filter: removes guardrail violations before LLM scoring
          cleanCandidates = filterByContentGuardrails(seenFiltered, payload.guardrails);
        }
      }

      if (cleanCandidates.length > 0 && !isDirectWatchlistRecommend) {
        console.log(`[Recommend] Running Semantic Resonance Scorer on ${cleanCandidates.length} candidate(s) in parallel...`);
        const sessionContext = {
          time: payload.local_context || 'evening',
          weather: 'any',
          mood: payload.recent_context || 'reflective'
        };

        const evaluateSingle = async (candidate) => {
          try {
            const brainKey = `${media_type}:${candidate.title.toLowerCase().trim()}`;
            let mediaDNA = mediaBrain[brainKey];
            if (!mediaDNA) {
              console.log(`[Media Brain Miss] Extracting DNA for: "${candidate.title}"`);
              let reviewsContext = '';
              if (media_type === 'movie' || media_type === 'tv') {
                const reviews = await searchService.scrapeLetterboxdReviews(candidate.title, 3);
                if (reviews && reviews.length > 0) {
                  reviewsContext = reviews.map(r => r.snippet).join('\n');
                }
              }
              const rawContentForDNA = `Synopsis: ${candidate.description || ''}\nGenres/Tags: ${(candidate.genres || []).concat(candidate.tags || []).join(', ')}\nUser Reviews:\n${reviewsContext}`;
              mediaDNA = await llmService.extractMediaDNA(candidate.title, media_type, rawContentForDNA);
              if (mediaDNA) {
                mediaBrain[brainKey] = mediaDNA;
              }
            } else {
              console.log(`[Media Brain Hit] Loaded DNA for: "${candidate.title}"`);
            }

            if (mediaDNA) {
              const resonance = await llmService.evaluateCandidateResonance(userSoulGraph, mediaDNA, sessionContext);
              console.log(`[Resonance Scorer] 🔍 "${candidate.title}" resonance score: ${resonance.score}/100 - Verdict: ${resonance.verdict}`);
              return { candidate, score: resonance.score || 0 };
            }
          } catch (err) {
            console.error(`[Resonance Scorer Error] Failed for "${candidate.title}":`, err.message);
          }
          return { candidate, score: 50 }; // fallback default
        };

        const scoredResults = await Promise.all(cleanCandidates.map(evaluateSingle));
        
        // Save the updated Media Brain database
        saveMediaBrain();

        // Sort by score descending and take the top 3 (Layer 2 - Arch C filter)
        scoredResults.sort((a, b) => b.score - a.score);
        cleanCandidates = scoredResults
          .filter(sc => sc.score > 40) // must be at least moderately compatible
          .slice(0, 3)
          .map(sc => sc.candidate);

        console.log(`[Recommend] Semantic filter complete. Top candidates selected: ${cleanCandidates.map(c => c.title).join(', ')}`);
      }

      if (cleanCandidates.length > 0) {
        if (limit > 1 && !isDirectWatchlistRecommend) {
          const result = await llmService.scoreAndSelectMultiple(
            master_directive,
            cleanCandidates,
            payload.guardrails,
            seenList,
            notForMeList,
            limit
          );
          if (result && Array.isArray(result.picks)) {
            finalPicks = result.picks.filter(p => p && p.title);
          }
        } else {
          const single = await llmService.scoreAndSelect(
            master_directive,
            cleanCandidates,
            payload.guardrails,
            seenList,
            notForMeList,
            directWatchlistTitle
          );
          if (single && single.title) {
            finalPicks = [single];
          }
        }
      }

      if (finalPicks.length > 0) {
        console.log(`[Recommend] Success! Selected ${finalPicks.length} pick(s) on attempt ${attempt + 1}.`);
        break;
      }
    } catch (err) {
      console.error(`[Recommend attempt ${attempt + 1} Error]:`, err.message);
    }

    attempt++;
  }

  if (finalPicks.length === 0) {
    throw new Error(`Failed to curation-find any recommendations for type "${requestedType}" after ${maxRetries + 1} rotated attempts.`);
  }

  // ── Step 4: Asset Retrieval (Parallelized) ───────────────────────────────
  console.log('[Recommend] → Step 4: Fetching posters, OSTs, metadata in parallel...');
  const resolvedPicks = await Promise.all(finalPicks.map(async (pick) => {
    const candidateMeta = cleanCandidates.find(c => c.title === pick.title);
    try {
      const needsLlmMetadata = !candidateMeta || !candidateMeta.release_year || !candidateMeta.studio;
      const [assetsResult, llmMeta] = await Promise.all([
        mediaService.fetchAssets(pick.title, media_type),
        needsLlmMetadata 
          ? llmService.fetchMetadataViaLLM(pick.title, media_type).catch(() => null) 
          : Promise.resolve(candidateMeta),
      ]);

      let { poster_url, ost_url, trailer_url } = assetsResult;
      
      let finalPosterUrl = poster_url;
      if ((!finalPosterUrl || finalPosterUrl.includes('placeholder')) && candidateMeta?.image) {
        finalPosterUrl = candidateMeta.image;
      }

      if (finalPosterUrl && finalPosterUrl.startsWith('http') && !finalPosterUrl.includes('localhost') && !finalPosterUrl.includes('127.0.0.1')) {
        finalPosterUrl = `/api/recommend/proxy-image?url=${encodeURIComponent(finalPosterUrl)}`;
      }

      return {
        title: pick.title,
        media_type: media_type,
        coda_blurb: pick.coda_blurb,
        pitch_paragraphs: [],
        poster_url: finalPosterUrl,
        ost_url,
        trailer_url: trailer_url || '',
        description: llmMeta?.description || candidateMeta?.description || pick.title,
        genres: llmMeta?.genres || candidateMeta?.genres || [],
        tags: llmMeta?.tags || candidateMeta?.tags || [],
        release_year: llmMeta?.release_year || candidateMeta?.release_year || '',
        studio: llmMeta?.studio || candidateMeta?.studio || ''
      };
    } catch (err) {
      console.error(`Asset fetch failed for "${pick.title}":`, err.message);
      let finalPosterUrl = candidateMeta?.image || '';
      if (finalPosterUrl && finalPosterUrl.startsWith('http') && !finalPosterUrl.includes('localhost') && !finalPosterUrl.includes('127.0.0.1')) {
        finalPosterUrl = `/api/recommend/proxy-image?url=${encodeURIComponent(finalPosterUrl)}`;
      }
      
      const needsLlmMetadata = !candidateMeta || !candidateMeta.release_year || !candidateMeta.studio;
      const llmMeta = needsLlmMetadata 
        ? await llmService.fetchMetadataViaLLM(pick.title, media_type).catch(() => null) 
        : candidateMeta;

      return {
        title: pick.title,
        media_type: media_type,
        coda_blurb: pick.coda_blurb,
        pitch_paragraphs: [],
        poster_url: finalPosterUrl,
        ost_url: '',
        trailer_url: '',
        description: llmMeta?.description || candidateMeta?.description || pick.title,
        genres: llmMeta?.genres || candidateMeta?.genres || [],
        tags: llmMeta?.tags || candidateMeta?.tags || [],
        release_year: llmMeta?.release_year || candidateMeta?.release_year || '',
        studio: llmMeta?.studio || candidateMeta?.studio || ''
      };
    }
  }));

  // Trace Log first pick
  if (resolvedPicks.length > 0) {
    loggerService.logRecommendation({
      payload,
      mediaType: media_type,
      queries: search_queries,
      malAnimeTitles: seed_titles || [],
      vnTitles: [],
      scrapedSnippets,
      masterDirective: master_directive,
      selection: { 
        title: resolvedPicks[0].title, 
        coda_blurb: resolvedPicks[0].coda_blurb, 
        pitch_paragraphs: [] 
      },
      posterUrl: resolvedPicks[0].poster_url,
      ostUrl: resolvedPicks[0].ost_url
    });
  }

  console.log('[Recommend] ✅ Pipeline complete.\n');
  return {
    title: resolvedPicks[0]?.title || '',
    media_type: media_type,
    coda_blurb: resolvedPicks[0]?.coda_blurb || '',
    pitch_paragraphs: [],
    poster_url: resolvedPicks[0]?.poster_url || '',
    ost_url: resolvedPicks[0]?.ost_url || '',
    trailer_url: resolvedPicks[0]?.trailer_url || '',
    description: resolvedPicks[0]?.description || '',
    genres: resolvedPicks[0]?.genres || [],
    tags: resolvedPicks[0]?.tags || [],
    release_year: resolvedPicks[0]?.release_year || '',
    studio: resolvedPicks[0]?.studio || '',
    recommendations: resolvedPicks
  };
};

const populateMediaBrainBackground = (payload, result) => {
  setImmediate(async () => {
    try {
      console.log('[BG Media Brain Ingestion] Starting background ingestion task...');
      const media_type = (payload.requested_media_type || '').toLowerCase();
      const resolvedSeeds = [...(payload.loved_titles || [])];
      if (payload.watchlist_seed_title) resolvedSeeds.push(payload.watchlist_seed_title);
      if (payload.loved_seed_title) resolvedSeeds.push(payload.loved_seed_title);

      const cleanSeeds = Array.from(new Set(resolvedSeeds.filter(Boolean)));
      if (cleanSeeds.length === 0) {
        console.log('[BG Media Brain Ingestion] No seed titles to expand. Aborting.');
        return;
      }

      // Fetch related candidates
      let candidateTitles = [];
      const limitToProcess = 3;

      if (media_type === 'anime') {
        const results = await cachedFetchAniListRecs(cleanSeeds.slice(0, 3)).catch(() => []);
        if (results && results.length > 0) {
          candidateTitles = results.map(r => r.title).filter(Boolean);
        }
      } else if (media_type === 'visual novel' || media_type === 'visualnovel') {
        const results = await cachedFetchVNDBRecs(cleanSeeds.slice(0, 3)).catch(() => []);
        if (results && results.length > 0) {
          candidateTitles = results.map(r => r.title).filter(Boolean);
        }
      } else if (media_type === 'movie' || media_type === 'tv') {
        const seed = cleanSeeds[0];
        const reviews = await searchService.scrapeLetterboxdReviews(seed).catch(() => []);
        if (reviews && reviews.length > 0) {
          const extracted = await llmService.extractCandidateTitles(reviews, media_type).catch(() => []);
          candidateTitles = extracted;
        }
      }

      // Filter to only titles NOT already in the media brain
      const toIngest = candidateTitles.filter(title => {
        const brainKey = `${media_type}:${title.toLowerCase().trim()}`;
        return !mediaBrain[brainKey];
      }).slice(0, limitToProcess);

      if (toIngest.length === 0) {
        console.log('[BG Media Brain Ingestion] All related candidate titles are already cached in Media Brain.');
        return;
      }

      console.log(`[BG Media Brain Ingestion] Found ${toIngest.length} new related title(s) to pre-hydrate: ${JSON.stringify(toIngest)}`);

      for (const title of toIngest) {
        try {
          console.log(`[BG Media Brain Ingestion] Pre-hydrating DNA for: "${title}" (${media_type})`);
          
          // 1. Fetch metadata
          const meta = await getCachedMetadata(title, media_type);
          
          // 2. Scrape reviews/details
          let reviewsContext = '';
          if (media_type === 'movie' || media_type === 'tv') {
            const reviews = await searchService.scrapeLetterboxdReviews(title, 3).catch(() => []);
            if (reviews && reviews.length > 0) {
              reviewsContext = reviews.map(r => r.snippet).join('\n');
            }
          } else {
            const query = `"${title}" ${media_type} review site:reddit.com`;
            const reviews = await cachedScrapeForums(query).catch(() => []);
            if (reviews && reviews.length > 0) {
              reviewsContext = reviews.map(r => r.snippet).join('\n');
            }
          }

          // 3. Generate and cache tags
          const rawContentForDNA = `Synopsis: ${meta.description || ''}\nGenres/Tags: ${(meta.genres || []).concat(meta.tags || []).join(', ')}\nUser Reviews:\n${reviewsContext}`;
          const mediaDNA = await llmService.extractMediaDNA(title, media_type, rawContentForDNA);
          if (mediaDNA) {
            const brainKey = `${media_type}:${title.toLowerCase().trim()}`;
            mediaBrain[brainKey] = mediaDNA;
            saveMediaBrain();
            console.log(`[BG Media Brain Ingestion] ✅ Successfully ingested: "${title}"`);
          }

          // Stagger to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (err) {
          console.error(`[BG Media Brain Ingestion] Failed for "${title}":`, err.message);
        }
      }

      console.log('[BG Media Brain Ingestion] Background ingestion task finished.');
    } catch (err) {
      console.error('[BG Media Brain Ingestion Error]:', err.message);
    }
  });
};

router.post('/', async (req, res) => {
  try {
    const result = await runRecommendationPipeline(req.body);
    res.json(result);
    // Background ingest related works
    populateMediaBrainBackground(req.body, result);
  } catch (error) {
    console.error('[Recommend Route Error]:', error);
    res.status(500).json({ error: 'Recommendation pipeline failed', details: error.message });
  }
});

router.post('/ask', async (req, res) => {
  try {
    const { current_memory, chat_history, user_message } = req.body;
    console.log('\n[Ask Coda Chat] ═══════════════════════════════════════════════════');
    console.log(`[Ask Coda Chat] User message: "${user_message}"`);

    const parsed = await llmService.handleAskChat(
      current_memory || {},
      chat_history || [],
      user_message
    );

    console.log('[Ask Coda Chat] Coda chat status:', parsed.status);
    console.log('[Ask Coda Chat] Coda message:', parsed.message);

    if (parsed.status === 'success' && parsed.media_type && parsed.recommendation_query) {
      console.log(`[Ask Coda Chat] Ready to pick! Running recommendation pipeline for "${parsed.recommendation_query}" (${parsed.media_type})...`);
      
      let finalMediaType = parsed.media_type;
      const queryLower = parsed.recommendation_query.toLowerCase();
      // Route anime movie queries to the anime pipeline instead of movies/tv
      if ((finalMediaType === 'movie' || finalMediaType === 'tv') && 
          (queryLower.includes('anime') || queryLower.includes('ghibli') || queryLower.includes('miyazaki') || queryLower.includes('shinkai') || queryLower.includes('hosoda'))) {
        console.log(`[Ask Coda Chat] Re-routing movie/tv recommendation request to anime: "${parsed.recommendation_query}"`);
        finalMediaType = 'anime';
      }

      // 1. Extract user messages from history (all user messages) + current message
      const recentUserTexts = (chat_history || [])
        .filter(msg => msg.isUser)
        .map(msg => msg.text);
      recentUserTexts.push(user_message);
      const combinedUserText = recentUserTexts.join('\n');

      // 2. Extract specific media titles mentioned by the user
      const userMentionedTitles = await llmService.extractTitlesFromText(combinedUserText);
      console.log(`[Ask Coda Chat] Extracted user-mentioned titles: ${JSON.stringify(userMentionedTitles)}`);

      // 3. Perform synchronous web research on user-mentioned titles sequentially
      let askResearchContext = "";
      if (userMentionedTitles && userMentionedTitles.length > 0) {
        try {
          console.log(`[Ask Coda Chat] Performing sequential theme research on: ${JSON.stringify(userMentionedTitles)}`);
          for (let i = 0; i < userMentionedTitles.length; i++) {
            const title = userMentionedTitles[i];
            const t0 = Date.now();
            const researchText = await llmService.researchMediaThemes(title);
            if (researchText) {
              askResearchContext += `Title: ${title}\nResearch:\n${researchText}\n\n---\n\n`;
            }
            const elapsed = Date.now() - t0;
            if (elapsed > 100 && i < userMentionedTitles.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
        } catch (e) {
          console.error('[Ask Coda Chat] Theme research failed:', e.message);
        }
      }

      // 4. Extract previously recommended Coda titles from chat history
      const prevRecommendedTitles = [];
      if (chat_history && Array.isArray(chat_history)) {
        for (const msg of chat_history) {
          if (!msg.isUser && msg.text) {
            const match = msg.text.match(/\[System: Coda recommended the work: "(.*?)"(?:\s+\(.*?\))?\]/);
            if (match && match[1]) {
              prevRecommendedTitles.push(match[1]);
            }
          }
        }
      }
      if (prevRecommendedTitles.length > 0) {
        console.log(`[Ask Coda Chat] Found previously recommended titles to exclude: ${JSON.stringify(prevRecommendedTitles)}`);
      }

      // 5. Build the exclusions seenList combining user-mentioned, previously recommended, and profile seen lists
      const profileSeen = current_memory.seen || [];
      const combinedExclusions = [...profileSeen];
      
      // Add user mentioned titles to exclusions (as they are works they watched/finished/loved)
      for (const title of userMentionedTitles) {
        if (title && !combinedExclusions.some(e => e.toLowerCase() === title.toLowerCase())) {
          combinedExclusions.push(title);
        }
      }
      // Add previously recommended titles in this chat session to exclusions
      for (const title of prevRecommendedTitles) {
        if (title && !combinedExclusions.some(e => e.toLowerCase() === title.toLowerCase())) {
          combinedExclusions.push(title);
        }
      }

      const payload = {
        core_identity: Object.values(current_memory.globalIdentity || []).join('. '),
        recent_context: parsed.recommendation_query,
        requested_media_type: finalMediaType,
        seen: combinedExclusions,
        not_for_me: current_memory.notForMe || [],
        guardrails: [Object.values(current_memory.guardrails || []).join(', '), (parsed.hard_constraints || []).join('. ')].filter(Boolean).join('. '),
        platform_hint: parsed.hard_constraints || [],
        hard_constraints: parsed.hard_constraints || [],
        ask_research_context: askResearchContext || null,
        skip_random_seeds: true
      };

      const rec = await runRecommendationPipeline(payload);
      
      res.json({
        status: 'success',
        message: parsed.message,
        recommendation: rec
      });

      // Background ingest related works using the ask payload
      populateMediaBrainBackground(payload, rec);
      return;
    }

    res.json({
      status: 'chatting',
      message: parsed.message,
      recommendation: null
    });
  } catch (error) {
    console.error('[Ask Coda Chat Route Error]:', error);
    res.status(500).json({ error: 'Ask Coda Chat failed', details: error.message });
  }
});
router.post('/pitch', async (req, res) => {
  try {
    const { core_identity, recent_context, guardrails, title, requested_media_type } = req.body;
    console.log('\n[Pitch] ═══════════════════════════════════════════════════');
    console.log(`[Pitch] Generating lazy pitch for: "${title}" (${requested_media_type})`);

    const fromWatchlist = recentWatchlistPicks.has(title);
    if (fromWatchlist) {
      console.log(`[Pitch] Title "${title}" was recommended from watchlist. Instructing pitch generator...`);
      recentWatchlistPicks.delete(title); // consume it
    }

    const directive = `User core identity: ${core_identity}. Current craving/recent context: ${recent_context}.`;
    
    // Target the right subreddit per media type for human discussion scraping
    const pitchSubredditMap = {
      anime: 'anime', visualnovel: 'visualnovels', visualNovels: 'visualnovels',
      movie: 'movies', book: 'books', manga: 'manga', tv: 'television'
    };
    const subredditKey = Object.keys(pitchSubredditMap).find(k =>
      (requested_media_type || '').toLowerCase().replace(/\s+/g, '').includes(k.toLowerCase())
    );
    const pitchSubreddit = pitchSubredditMap[subredditKey] || 'all';
    const query = `"${title}" ${requested_media_type} review site:reddit.com/r/${pitchSubreddit}`;

    let scrapedSnippets = [];
    const mediaTypeLower = (requested_media_type || '').toLowerCase();
    if (mediaTypeLower === 'movie' || mediaTypeLower === 'tv') {
      console.log(`[Pitch] Scraping Letterboxd reviews for: "${title}"`);
      scrapedSnippets = await getCachedSnippetData(
        `letterboxd_reviews:${title}`,
        () => searchService.scrapeLetterboxdReviews(title)
      );
      if (!scrapedSnippets || scrapedSnippets.length === 0) {
        console.log(`[Pitch] Letterboxd reviews empty. Falling back to forum scraping for: "${query}"`);
        scrapedSnippets = await searchService.scrapeForums(query);
      }
    } else {
      console.log(`[Pitch] Scraping human discussions for query: "${query}"`);
      scrapedSnippets = await searchService.scrapeForums(query);
    }

    const { pitch_paragraphs } = await llmService.generatePitch(
      directive,
      title,
      scrapedSnippets,
      guardrails,
      fromWatchlist
    );

    console.log(`[Pitch] Successfully generated ${pitch_paragraphs.length} paragraphs.`);
    console.log('[Pitch] ✅ Generation complete.\n');

    res.json({ pitch_paragraphs });
  } catch (error) {
    console.error('[Pitch Route Error]:', error);
    res.status(500).json({ error: 'Pitch generation failed', details: error.message });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { current_memory, recommendation_title, media_type, feedback_reason } = req.body;
    console.log('\n[Feedback] ═══════════════════════════════════════════════════');
    console.log(`[Feedback] Received rejection for "${recommendation_title}" (${media_type})`);
    console.log(`[Feedback] Reason: "${feedback_reason}"`);

    const updates = await llmService.refineTasteFromFeedback(
      current_memory,
      recommendation_title,
      media_type,
      feedback_reason
    );

    console.log('[Feedback] Generated updates:', JSON.stringify(updates));
    console.log('[Feedback] ✅ Refinement complete.\n');

    res.json(updates);
  } catch (error) {
    console.error('[Feedback Route Error]:', error);
    res.status(500).json({ error: 'Feedback refinement failed', details: error.message });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { current_memory, title, media_type, coda_blurb, pitch_paragraphs, chat_history, user_message } = req.body;
    console.log('\n[Discuss Chat] ═══════════════════════════════════════════════════');
    console.log(`[Discuss Chat] Discussing "${title}" (${media_type})`);
    console.log(`[Discuss Chat] User message: "${user_message}"`);

    const response = await llmService.discussRecommendation(
      current_memory || {},
      title,
      media_type,
      coda_blurb || "",
      pitch_paragraphs || [],
      chat_history || [],
      user_message
    );

    console.log('[Discuss Chat] Coda response generated successfully.');
    console.log('[Discuss Chat] ✅ Discussion complete.\n');

    res.json({
      message: response.message,
      one_line_summary: response.one_line_summary,
      memory_updates: response.memory_updates
    });
  } catch (error) {
    console.error('[Discuss Chat Route Error]:', error);
    res.status(500).json({ error: 'Recommendation discussion failed', details: error.message });
  }
});

module.exports = router;
