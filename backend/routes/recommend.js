const express = require('express');
const router = express.Router();
const axios = require('axios');
const llmService = require('../services/llmService');
const searchService = require('../services/searchService');
const mediaService = require('../services/mediaService');
const loggerService = require('../services/loggerService');


router.get('/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('Missing url parameter');
    }
    
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*'
      },
      timeout: 10000
    });
    
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    response.data.pipe(res);
  } catch (error) {
    console.error('[Proxy Image Error]:', error.message);
    res.status(500).send('Failed to proxy image');
  }
});


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

    // ── Step 2: Data Gathering ───────────────────────────────────────────────
    console.log('[Recommend] → Step 2: Gathering data from APIs and web search...');
    let scrapedSnippets = [];

    if (media_type === 'anime') {
      // 2a. MAL/Jikan — community recommendation votes for anchor titles
      if (mal_anime_titles?.length > 0) {
        console.log('[Recommend]   2a. Fetching MAL community recommendations...');
        const malSnippets = await searchService.fetchMALRecommendations(mal_anime_titles);
        scrapedSnippets = scrapedSnippets.concat(malSnippets);
        console.log(`[Recommend]   MAL: ${malSnippets.length} snippets`);

        // 2b. AniList — recommendation graph for same anchor titles
        console.log('[Recommend]   2b. Fetching AniList recommendation graph...');
        const aniListRecs = await searchService.fetchAniListRecommendations(mal_anime_titles);
        scrapedSnippets = scrapedSnippets.concat(aniListRecs);
        console.log(`[Recommend]   AniList Recs: ${aniListRecs.length} snippets`);
      }

      // 2c. Kitsu — structured title search with ratings + synopsis
      console.log('[Recommend]   2c. Searching Kitsu...');
      for (const query of search_queries.slice(0, 3)) {
        const kitsuSnippets = await searchService.fetchKitsuAnimeSnippets(query);
        scrapedSnippets = scrapedSnippets.concat(kitsuSnippets);
        console.log(`[Recommend]   Kitsu "${query}": ${kitsuSnippets.length} snippets`);
        if (scrapedSnippets.length >= 16) break;
      }

      // 2d. AniList search — score, genres, tags, similar titles
      console.log('[Recommend]   2d. Searching AniList...');
      for (const query of search_queries.slice(0, 3)) {
        const aniListSnippets = await searchService.fetchAniListAnimeSnippets(query);
        scrapedSnippets = scrapedSnippets.concat(aniListSnippets);
        console.log(`[Recommend]   AniList Search "${query}": ${aniListSnippets.length} snippets`);
        if (scrapedSnippets.length >= 20) break;
      }

      // 2e. Web search (DDG → Yahoo → Bing) — for broader discovery
      if (scrapedSnippets.length < 15) {
        console.log('[Recommend]   2e. Web search for broader discovery...');
        for (const query of search_queries) {
          const webSnippets = await searchService.scrapeForums(query);
          scrapedSnippets = scrapedSnippets.concat(webSnippets);
          console.log(`[Recommend]   Web "${query}": ${webSnippets.length} snippets`);
          if (scrapedSnippets.length >= 20) break;
        }
      }

    } else if (media_type === 'visual novel') {
      // ── Visual Novel pipeline: VNDB structured data + web search ─────────

      // 2a. VNDB Recommendations — based on known liked VN titles from profile
      //     vn_titles was extracted by the LLM router in Step 1
      const resolvedVnTitles = (vn_titles && Array.isArray(vn_titles)) ? vn_titles : [];

      if (resolvedVnTitles.length > 0) {
        console.log('[Recommend]   2a. Fetching VNDB recommendations based on liked titles...');
        const vndbRecs = await searchService.fetchVNDBRecommendations(resolvedVnTitles);
        scrapedSnippets = scrapedSnippets.concat(vndbRecs);
        console.log(`[Recommend]   VNDB Recs: ${vndbRecs.length} snippets`);
      }


      // 2b. VNDB Tag Search — discover top-rated VNs matching profile vibe
      console.log('[Recommend]   2b. Fetching VNDB tag-based discovery...');
      for (const query of search_queries.slice(0, 3)) {
        const vndbSnippets = await searchService.fetchVNDBSnippets(query, 6);
        scrapedSnippets = scrapedSnippets.concat(vndbSnippets);
        console.log(`[Recommend]   VNDB "${query}": ${vndbSnippets.length} snippets`);
        if (scrapedSnippets.length >= 15) break;
      }

      // 2c. Web search — Reddit/community threads as a supplement
      console.log('[Recommend]   2c. Web search for community VN opinions...');
      for (const query of search_queries) {
        const webSnippets = await searchService.scrapeForums(query);
        scrapedSnippets = scrapedSnippets.concat(webSnippets);
        console.log(`[Recommend]   Web "${query}": ${webSnippets.length} snippets`);
        if (scrapedSnippets.length >= 25) break;
      }

    } else {
      // All other media types — web search only
      console.log('[Recommend]   Web search for non-anime media type...');
      for (const query of search_queries) {
        const webSnippets = await searchService.scrapeForums(query);
        scrapedSnippets = scrapedSnippets.concat(webSnippets);
        console.log(`[Recommend]   Web "${query}": ${webSnippets.length} snippets`);
        if (scrapedSnippets.length >= 20) break;
      }
    }

    console.log(`[Recommend]   Total snippets: ${scrapedSnippets.length}`);

    // ── Step 3: Scoring & Pitching ───────────────────────────────────────────
    console.log('[Recommend] → Step 3: Scoring candidates and generating pitch...');
    const { title, coda_blurb, pitch_paragraphs } = await llmService.scoreAndPitch(master_directive, scrapedSnippets, payload.guardrails);
    console.log(`[Recommend]   Selected: "${title}"`);

    // ── Step 4: Asset Retrieval ──────────────────────────────────────────────
    console.log('[Recommend] → Step 4: Fetching poster and OST...');
    const { poster_url, ost_url } = await mediaService.fetchAssets(title, media_type);
    console.log(`[Recommend]   Poster: ${poster_url}`);

    // ── Trace Log ────────────────────────────────────────────────────────────
    loggerService.logRecommendation({
      payload,
      mediaType: media_type,
      queries: search_queries,
      malAnimeTitles: mal_anime_titles || [],
      vnTitles: vn_titles || [],
      scrapedSnippets,
      masterDirective: master_directive,
      selection: { title, coda_blurb, pitch_paragraphs },
      posterUrl: poster_url,
      ostUrl: ost_url
    });

    console.log('[Recommend] ✅ Pipeline complete.\n');

    let finalPosterUrl = poster_url;
    if (poster_url && poster_url.startsWith('http') && !poster_url.includes('localhost') && !poster_url.includes('127.0.0.1')) {
      finalPosterUrl = `/api/recommend/proxy-image?url=${encodeURIComponent(poster_url)}`;
    }

    res.json({
      title,
      media_type,
      coda_blurb,
      pitch_paragraphs,
      poster_url: finalPosterUrl,
      ost_url
    });

  } catch (error) {
    console.error('[Recommend Route Error]:', error);
    res.status(500).json({ error: 'Recommendation pipeline failed', details: error.message });
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
