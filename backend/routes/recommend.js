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
const cachedFetchVNDBSnippets = (query, limit) => getCachedSnippetData(`vndb_search:${query}:${limit}`, () => searchService.fetchVNDBSnippets(query, limit));

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

router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    console.log('\n[Recommend] ═══════════════════════════════════════════════════');
    console.log('[Recommend] Starting recommendation pipeline for media type:', payload.requested_media_type);

    // ── Step 1: Synthesis & Routing ─────────────────────────────────────────
    console.log('[Recommend] → Step 1: Synthesizing context and routing...');
    const { media_type, search_queries, master_directive, mal_anime_titles, vn_titles } = await llmService.synthesizeAndRoute(payload);
    console.log(`[Recommend]   Media type: ${media_type}`);
    console.log(`[Recommend]   Queries: ${JSON.stringify(search_queries)}`);
    if (mal_anime_titles?.length > 0) {
      console.log(`[Recommend]   MAL anchor titles: ${JSON.stringify(mal_anime_titles)}`);
    }
    if (vn_titles?.length > 0) {
      console.log(`[Recommend]   VNDB anchor titles: ${JSON.stringify(vn_titles)}`);
    }

    // ── Step 2: Data Gathering (Parallelized & Cached) ───────────────────────
    console.log('[Recommend] → Step 2: Gathering data from APIs and web search...');
    let scrapedSnippets = [];

    if (media_type === 'anime') {
      const promises = [];
      if (mal_anime_titles?.length > 0) {
        promises.push(cachedFetchMAL(mal_anime_titles));
        promises.push(cachedFetchAniListRecs(mal_anime_titles));
      }
      for (const query of search_queries.slice(0, 3)) {
        promises.push(cachedFetchKitsu(query));
        promises.push(cachedFetchAniListSearch(query));
      }
      for (const query of search_queries.slice(0, 3)) {
        promises.push(cachedScrapeForums(query));
      }
      
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res) scrapedSnippets = scrapedSnippets.concat(res);
      }

    } else if (media_type === 'visual novel') {
      const promises = [];
      const resolvedVnTitles = (vn_titles && Array.isArray(vn_titles)) ? vn_titles : [];
      if (resolvedVnTitles.length > 0) {
        promises.push(cachedFetchVNDBRecs(resolvedVnTitles));
      }
      for (const query of search_queries.slice(0, 3)) {
        promises.push(cachedFetchVNDBSnippets(query, 6));
        promises.push(cachedScrapeForums(query));
      }
      
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res) scrapedSnippets = scrapedSnippets.concat(res);
      }

    } else {
      const promises = search_queries.slice(0, 4).map(query => cachedScrapeForums(query));
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res) scrapedSnippets = scrapedSnippets.concat(res);
      }
    }

    console.log(`[Recommend]   Total snippets: ${scrapedSnippets.length}`);

    // Extract seen and not-for-me lists
    const seenList = Array.isArray(payload.seen) ? payload.seen : [];
    const notForMeList = Array.isArray(payload.not_for_me) ? payload.not_for_me : [];

    // Filter scrapedSnippets early
    const filteredSnippets = scrapedSnippets.filter(snippet => {
      const excluded = isExcluded(snippet.title, seenList) || isExcluded(snippet.title, notForMeList);
      if (excluded) {
        console.log(`[Recommend] Programmatically filtering out snippet matching seen/not-for-me: "${snippet.title}"`);
      }
      return !excluded;
    });

    console.log(`[Recommend] Snippets after exclusion filtering: ${filteredSnippets.length}`);

    // ── Step 3: Scoring & Selection (Single Pick) ─────────────────────────
    console.log('[Recommend] → Step 3: Scoring candidates and selecting top pick...');
    let finalPicks = [];
    try {
      const single = await llmService.scoreAndSelect(
        master_directive,
        filteredSnippets,
        payload.guardrails,
        seenList,
        notForMeList
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
        const { poster_url, ost_url } = await mediaService.fetchAssets(pick.title, media_type);
        let finalPosterUrl = poster_url;
        if (poster_url && poster_url.startsWith('http') && !poster_url.includes('localhost') && !poster_url.includes('127.0.0.1')) {
          finalPosterUrl = `/api/recommend/proxy-image?url=${encodeURIComponent(poster_url)}`;
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
        return {
          title: pick.title,
          media_type: media_type,
          coda_blurb: pick.coda_blurb,
          pitch_paragraphs: [],
          poster_url: '',
          ost_url: ''
        };
      }
    }));

    // ── Trace Log (using first pick for logging compatibility) ────────────────
    if (resolvedPicks.length > 0) {
      loggerService.logRecommendation({
        payload,
        mediaType: media_type,
        queries: search_queries,
        malAnimeTitles: mal_anime_titles || [],
        vnTitles: vn_titles || [],
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

    res.json({
      title: resolvedPicks[0]?.title || '',
      media_type: media_type,
      coda_blurb: resolvedPicks[0]?.coda_blurb || '',
      pitch_paragraphs: [],
      poster_url: resolvedPicks[0]?.poster_url || '',
      ost_url: resolvedPicks[0]?.ost_url || '',
      recommendations: resolvedPicks
    });

  } catch (error) {
    console.error('[Recommend Route Error]:', error);
    res.status(500).json({ error: 'Recommendation pipeline failed', details: error.message });
  }
});
router.post('/pitch', async (req, res) => {
  try {
    const { core_identity, recent_context, guardrails, title, requested_media_type } = req.body;
    console.log('\n[Pitch] ═══════════════════════════════════════════════════');
    console.log(`[Pitch] Generating lazy pitch for: "${title}" (${requested_media_type})`);

    const directive = `User core identity: ${core_identity}. Current craving/recent context: ${recent_context}.`;
    
    // Quick search for title discussions to build human pitch context
    const query = `"${title}" ${requested_media_type} review site:reddit.com`;
    console.log(`[Pitch] Scraping human discussions for query: "${query}"`);
    const scrapedSnippets = await searchService.scrapeForums(query);

    const { pitch_paragraphs } = await llmService.generatePitch(
      directive,
      title,
      scrapedSnippets,
      guardrails
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

module.exports = router;
