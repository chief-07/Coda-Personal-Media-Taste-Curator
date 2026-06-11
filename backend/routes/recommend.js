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

const runRecommendationPipeline = async (payload) => {
  console.log('\n[Recommend] ═══════════════════════════════════════════════════');
  console.log('[Recommend] Starting recommendation pipeline for media type:', payload.requested_media_type);
  console.log('[Profile]   core_identity:', payload.core_identity);
  console.log('[Profile]   guardrails:', payload.guardrails);
  console.log('[Profile]   seen (' + (payload.seen?.length || 0) + '):', JSON.stringify(payload.seen));
  console.log('[Profile]   not_for_me:', JSON.stringify(payload.not_for_me));
  console.log('[Profile]   recent_context:', payload.recent_context);

  // Extract seen and not-for-me lists early so they are available everywhere
  const seenList = Array.isArray(payload.seen) ? payload.seen : [];
  const notForMeList = Array.isArray(payload.not_for_me) ? payload.not_for_me : [];

  // ── Step 0: Watchlist Checking & Blending (15% direct recommend, 15% seed blend) ──
  const watchlist = payload.watchlist || [];
  const requestedType = payload.requested_media_type;
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
  });

  let isDirectWatchlistRecommend = false;
  let directWatchlistTitle = null;
  let directWatchlistItem = null;

  // Extract loved titles for the active media type from core_identity
  const lovedTitles = [];
  if (typeof payload.core_identity === 'string') {
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
  console.log('[Recommend] Extracted loved titles for active category:', lovedTitles);

  if (matchingWatchlistItems.length > 0) {
    const rand = Math.random();
    if (payload.force_direct_watchlist || (rand < 0.15 && !payload.force_watchlist_blend && !payload.force_loved_seed)) {
      // Direct Watchlist Recommendation (15% chance, or forced)
      isDirectWatchlistRecommend = true;
      directWatchlistItem = matchingWatchlistItems[Math.floor(Math.random() * matchingWatchlistItems.length)];
      directWatchlistTitle = directWatchlistItem.title;
      console.log(`[Recommend] 🎲 Direct Watchlist Recommendation triggered! Selecting: "${directWatchlistTitle}"`);
      recentWatchlistPicks.add(directWatchlistTitle);
    } else if (payload.force_watchlist_blend || (rand < 0.30 && !payload.force_loved_seed)) {
      // Watchlist Blending (15% chance, or forced)
      const seedItem = matchingWatchlistItems[Math.floor(Math.random() * matchingWatchlistItems.length)];
      console.log(`[Recommend] 🎲 Watchlist blending triggered! Seeding from: "${seedItem.title}"`);
      payload.watchlist_seed_title = seedItem.title;
    }
  }

  // Loved Seed Blending (25% chance if watchlist triggers didn't run and loved titles exist)
  if (!isDirectWatchlistRecommend && !payload.watchlist_seed_title && lovedTitles.length > 0) {
    const rand = Math.random();
    if (payload.force_loved_seed || rand < 0.25) {
      const lovedSeed = lovedTitles[Math.floor(Math.random() * lovedTitles.length)];
      payload.loved_seed_title = lovedSeed;
      console.log(`[Recommend] 🎲 Loved seed blending triggered! Seeding from: "${lovedSeed}"`);
    }
  }

  let media_type;
  let search_queries;
  let master_directive;
  let seed_titles;
  let selected_vibe_focus;
  let scrapedSnippets = [];

  if (isDirectWatchlistRecommend) {
    console.log('[Recommend] → Bypassing Step 1 (Direct Watchlist Mode)');
    media_type = (directWatchlistItem.mediaType || directWatchlistItem.media_type || requestedType || '').toLowerCase();
    if (media_type === 'visualnovel' || media_type === 'visual novel') {
      media_type = 'visual novel';
    }
    selected_vibe_focus = "Watchlist Curation";
    master_directive = `Recommend and pitch the user's watchlist item '${directWatchlistTitle}'.`;
    search_queries = [`"${directWatchlistTitle}" ${media_type} review site:reddit.com`];
    seed_titles = [];

    console.log(`[Recommend] → Step 2: Gathering discussion context specifically for: "${directWatchlistTitle}"`);
    scrapedSnippets = await cachedScrapeForums(search_queries[0]);
    console.log(`[Recommend]   Gathered ${scrapedSnippets.length} discussion snippets for pitch context.`);
  } else {
    // ── Step 1: Synthesis & Routing ─────────────────────────────────────────
    console.log('[Recommend] → Step 1: Synthesizing context and routing...');
    const routingResult = await llmService.synthesizeAndRoute(payload);
    media_type = routingResult.media_type;
    search_queries = routingResult.search_queries;
    master_directive = routingResult.master_directive;
    seed_titles = routingResult.seed_titles;
    selected_vibe_focus = routingResult.selected_vibe_focus;

    console.log(`[Recommend]   Media type: ${media_type}`);
    console.log(`[Recommend]   Selected vibe focus: ${selected_vibe_focus}`);
    console.log(`[Recommend]   Queries: ${JSON.stringify(search_queries)}`);
    if (seed_titles?.length > 0) {
      console.log(`[Recommend]   Seed titles: ${JSON.stringify(seed_titles)}`);
    }

    // ── Step 2: Data Gathering (Parallelized & Cached) ───────────────────────
    console.log('[Recommend] → Step 2: Gathering data from APIs and web search...');
    const resolvedSeeds = (seed_titles && Array.isArray(seed_titles)) ? seed_titles : [];
    const sourceResults = [];

    if (media_type === 'anime') {
      const taggedPromises = [];
      if (resolvedSeeds.length > 0) {
        taggedPromises.push(cachedFetchMAL(resolvedSeeds).then(r => ({ source: `MAL community recs (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
        taggedPromises.push(cachedFetchAniListRecs(resolvedSeeds).then(r => ({ source: `AniList graph recs (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
        const reviewCacheKey = `mal_reviews:${resolvedSeeds.slice(0,3).join(',')}`;
        taggedPromises.push(getCachedSnippetData(reviewCacheKey, () => searchService.fetchMALReviews(resolvedSeeds)).then(r => ({ source: `MAL user reviews (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
      }
      for (const query of search_queries) {
        if (!query.includes('site:')) {
          taggedPromises.push(cachedFetchKitsu(query).then(r => ({ source: `Jikan/MAL genre search: "${query}"`, results: r || [] })));
          taggedPromises.push(cachedFetchAniListSearch(query).then(r => ({ source: `AniList title/tag search: "${query}"`, results: r || [] })));
        }
        taggedPromises.push(cachedScrapeForums(query).then(r => ({ source: `Web scrape (DDG/Yahoo/Reddit): "${query}"`, results: r || [] })));
      }
      const resolved = await Promise.all(taggedPromises);
      sourceResults.push(...resolved);

    } else if (media_type === 'visual novel') {
      const taggedPromises = [];
      if (resolvedSeeds.length > 0) {
        taggedPromises.push(cachedFetchVNDBRecs(resolvedSeeds).then(r => ({ source: `VNDB similar-tag recs (seeds: ${resolvedSeeds.join(', ')})`, results: r || [] })));
      }
      for (const query of search_queries) {
        if (!query.includes('site:')) {
          taggedPromises.push(cachedFetchVNDBSnippets(query, 6, payload.platform_hint).then(r => ({ source: `VNDB text search: "${query}"`, results: r || [] })));
        }
        taggedPromises.push(cachedScrapeForums(query).then(r => ({ source: `Web scrape (DDG/Yahoo/Reddit): "${query}"`, results: r || [] })));
      }
      const resolved = await Promise.all(taggedPromises);
      sourceResults.push(...resolved);

    } else {
      const taggedPromises = search_queries.map(query =>
        cachedScrapeForums(query).then(r => ({ source: `Web scrape (DDG/Yahoo/Reddit): "${query}"`, results: r || [] }))
      );
      const resolved = await Promise.all(taggedPromises);
      sourceResults.push(...resolved);
    }

    // Log per-source breakdown
    console.log('[Recommend]   ── Source breakdown ──');
    for (const sr of sourceResults) {
      const titles = sr.results.map(r => `"${r.title}"`).join(', ') || '(none)';
      console.log(`[Source] ${sr.source} → ${sr.results.length} snippets: ${titles}`);
      scrapedSnippets = scrapedSnippets.concat(sr.results);
    }
    console.log(`[Recommend]   Total snippets across all sources: ${scrapedSnippets.length}`);
  }

  // ── Step 2.5: Candidate Extraction & Metadata Resolution ─────────────────
  let cleanCandidates = [];

  if (isDirectWatchlistRecommend) {
    console.log('[Recommend] → Step 2.5: Resolving metadata for direct watchlist item...');
    let candidateMeta = {
      title: directWatchlistTitle,
      genres: directWatchlistItem.tags || [],
      tags: directWatchlistItem.tags || [],
      description: directWatchlistItem.description || '',
      image: directWatchlistItem.posterUrl || directWatchlistItem.poster_url || ''
    };

    if (!candidateMeta.description || (!candidateMeta.genres.length && !candidateMeta.tags.length)) {
      console.log(`[Recommend]   Direct watchlist item "${directWatchlistTitle}" has incomplete metadata. Fetching...`);
      try {
        let meta = await searchService.fetchMetadataForCandidate(directWatchlistTitle, media_type);
        if (!meta || (!meta.genres?.length && !meta.tags?.length)) {
          const llmMeta = await llmService.fetchMetadataViaLLM(directWatchlistTitle, media_type);
          if (llmMeta) {
            meta = {
              title: llmMeta.title || directWatchlistTitle,
              genres: llmMeta.genres || [],
              tags: llmMeta.tags || [],
              description: llmMeta.description || '',
              image: meta?.image || ''
            };
          }
        }
        if (meta) {
          candidateMeta.title = meta.title || candidateMeta.title;
          candidateMeta.genres = meta.genres?.length ? meta.genres : candidateMeta.genres;
          candidateMeta.tags = meta.tags?.length ? meta.tags : candidateMeta.tags;
          candidateMeta.description = meta.description || candidateMeta.description;
          candidateMeta.image = meta.image || candidateMeta.image;
        }
      } catch (err) {
        console.error(`Metadata fetch failed for direct watchlist item "${directWatchlistTitle}":`, err.message);
      }
    }
    cleanCandidates = [candidateMeta];
  } else {
    // Filter snippets: hard exclusion of already-seen/not-for-me titles only
    const filteredSnippets = scrapedSnippets.filter(snippet => {
      const excluded = isExcluded(snippet.title, seenList) || isExcluded(snippet.title, notForMeList);
      if (excluded) {
        console.log(`[Recommend]   ✗ Excluding snippet (seen/not-for-me): "${snippet.title}"`);
      }
      return !excluded;
    });

    console.log(`[Recommend]   Snippets after seen/not-for-me exclusion: ${filteredSnippets.length}`);

    console.log('[Recommend] → Step 2.5: Extracting candidates and resolving metadata...');
    
    // 1. Extract candidate titles from the snippets using LLM
    const candidateTitles = await llmService.extractCandidateTitles(filteredSnippets, media_type);
    console.log(`[Recommend]   LLM extracted ${candidateTitles.length} candidate titles: ${JSON.stringify(candidateTitles)}`);

    // 2. Fetch real metadata for each candidate in parallel
    const candidatesWithMetadata = await Promise.all(candidateTitles.map(async (title) => {
      let meta = await searchService.fetchMetadataForCandidate(title, media_type);
      if (!meta || (!meta.genres?.length && !meta.tags?.length)) {
        console.log(`[Recommend]   ⚠ API metadata empty for "${title}" — using LLM fallback...`);
        const llmMeta = await llmService.fetchMetadataViaLLM(title, media_type);
        if (llmMeta) {
          meta = {
            title: llmMeta.title || title,
            genres: llmMeta.genres || [],
            tags: llmMeta.tags || [],
            description: llmMeta.description || '',
            image: meta?.image || ''
          };
        }
      }
      const resolved = {
        title: meta?.title || title,
        genres: meta?.genres || [],
        tags: meta?.tags || [],
        description: meta?.description || '',
        image: meta?.image || ''
      };
      console.log(`[Metadata] "${resolved.title}" → genres: [${resolved.genres.join(', ')}] | tags: [${resolved.tags.slice(0,6).join(', ')}]`);
      return resolved;
    }));

    // 3. Hard-filter only seen/not-for-me titles — guardrail nuance left to LLM
    cleanCandidates = candidatesWithMetadata.filter(candidate => {
      if (isExcluded(candidate.title, seenList) || isExcluded(candidate.title, notForMeList)) {
        console.log(`[Recommend]   ✗ Hard-excluding seen/not-for-me candidate: "${candidate.title}"`);
        return false;
      }
      return true;
    });
  }

  console.log(`[Recommend]   ${cleanCandidates.length} verified candidates passed to LLM scoring: ${JSON.stringify(cleanCandidates.map(c => c.title))}`);

  // ── Step 3: Scoring & Selection (Single Pick) ─────────────────────────
  console.log('[Recommend] → Step 3: Scoring candidates and selecting top pick...');
  let finalPicks = [];
  try {
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
  } catch (err) {
    console.error('[Recommend] scoreAndSelect failed:', err.message);
  }
  
  console.log(`[Recommend]   Selected picks: ${JSON.stringify(finalPicks.map(p => p.title))}`);

  // ── Step 4: Asset Retrieval (Parallelized) ───────────────────────────────
  console.log('[Recommend] → Step 4: Fetching posters and OSTs in parallel...');
  const resolvedPicks = await Promise.all(finalPicks.map(async (pick) => {
    try {
      let { poster_url, ost_url } = await mediaService.fetchAssets(pick.title, media_type);
      
      // Watchlist item fallbacks if assets are empty or placeholder
      if (isDirectWatchlistRecommend && directWatchlistItem && directWatchlistItem.title === pick.title) {
        if (!poster_url || poster_url.includes('placeholder')) {
          poster_url = directWatchlistItem.posterUrl || directWatchlistItem.poster_url || poster_url;
        }
        if (!ost_url) {
          ost_url = directWatchlistItem.ostUrl || directWatchlistItem.ost_url || ost_url;
        }
      }

      let finalPosterUrl = poster_url;
      // Fallback: If mediaService did not find a poster or returned placeholder, use the metadata API image
      const candidateMeta = cleanCandidates.find(c => c.title === pick.title);
      if ((!finalPosterUrl || finalPosterUrl.includes('placeholder')) && candidateMeta?.image) {
        finalPosterUrl = candidateMeta.image;
        console.log(`[Recommend]   Using metadata cover image fallback for "${pick.title}": ${finalPosterUrl}`);
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
        ost_url
      };
    } catch (err) {
      console.error(`Asset fetch failed for "${pick.title}":`, err.message);
      
      let finalPosterUrl = '';
      let finalOstUrl = '';

      if (isDirectWatchlistRecommend && directWatchlistItem && directWatchlistItem.title === pick.title) {
        finalPosterUrl = directWatchlistItem.posterUrl || directWatchlistItem.poster_url || '';
        finalOstUrl = directWatchlistItem.ostUrl || directWatchlistItem.ost_url || '';
        console.log(`[Recommend]   Direct watchlist asset fallback triggered: poster=${finalPosterUrl}, ost=${finalOstUrl}`);
      }

      const candidateMeta = cleanCandidates.find(c => c.title === pick.title);
      if (!finalPosterUrl && candidateMeta?.image) {
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
        ost_url: finalOstUrl
      };
    }
  }));

  // ── Trace Log (using first pick for logging compatibility) ────────────────
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
    recommendations: resolvedPicks
  };
};

router.post('/', async (req, res) => {
  try {
    const result = await runRecommendationPipeline(req.body);
    res.json(result);
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

      const payload = {
        core_identity: Object.values(current_memory.globalIdentity || []).join('. '),
        recent_context: parsed.recommendation_query,
        requested_media_type: finalMediaType,
        seen: current_memory.seen || [],
        not_for_me: current_memory.notForMe || [],
        guardrails: [Object.values(current_memory.guardrails || []).join(', '), (parsed.hard_constraints || []).join('. ')].filter(Boolean).join('. '),
        platform_hint: parsed.hard_constraints || [],
        hard_constraints: parsed.hard_constraints || []
      };

      const rec = await runRecommendationPipeline(payload);
      
      return res.json({
        status: 'success',
        message: parsed.message,
        recommendation: rec
      });
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
    console.log(`[Pitch] Scraping human discussions for query: "${query}"`);
    const scrapedSnippets = await searchService.scrapeForums(query);

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

    res.json({ message: response });
  } catch (error) {
    console.error('[Discuss Chat Route Error]:', error);
    res.status(500).json({ error: 'Recommendation discussion failed', details: error.message });
  }
});

module.exports = router;
