const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const llmService = require('../services/llmService');
const qdrantService = require('../services/qdrantService');
const embeddingService = require('../services/embeddingService');
const userSoulService = require('../services/userSoulService');
const mediaService = require('../services/mediaService');
const searchService = require('../services/searchService');

// ── Image Proxy ──────────────────────────────────────────────────────────────
const IMAGE_CACHE_DIR = path.join(__dirname, '../cache/images');
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

router.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  try {
    if (!url) return res.status(400).send('Missing url parameter');
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const cachedFilePath = path.join(IMAGE_CACHE_DIR, hash);
    const metaPath = cachedFilePath + '.json';
    
    if (fs.existsSync(cachedFilePath)) {
      let contentType = 'image/jpeg';
      if (fs.existsSync(metaPath)) {
        try { contentType = JSON.parse(fs.readFileSync(metaPath, 'utf8')).contentType; } catch (_) {}
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return fs.createReadStream(cachedFilePath).pipe(res);
    }
    
    const isMangaDex = url.includes('mangadex.org') || url.includes('uploads.mangadex.org');
    const response = await axios({
      method: 'get', url, responseType: 'arraybuffer',
      headers: {
        'User-Agent': isMangaDex
          ? 'CodaApp/2.0 (contact@mycodaapp.net)'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        ...(isMangaDex ? { 'Referer': 'https://mangadex.org/' } : {}),
      },
      timeout: 15000
    });
    
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const buffer = Buffer.from(response.data);
    fs.writeFile(cachedFilePath, buffer, () => {});
    fs.writeFile(metaPath, JSON.stringify({ contentType, url }), () => {});
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (error) {
    res.status(500).send('Failed to proxy image');
  }
});

// ── 6. Format Output Helper ───────────────────────────────────────────────────
const mapCandidateToResponse = async (candidate, pitch = null, blurb = null) => {
  const meta = await mediaService.fetchAssets(candidate.payload.title, candidate.payload.media_type);
  
  // Attempt to fetch runtime/length tags dynamically
  let runtimeTag = null;
  let fetchedMeta = null;
  try {
    fetchedMeta = await searchService.fetchMetadataForCandidate(candidate.payload.title, candidate.payload.media_type);
    if (fetchedMeta) {
      const formatRuntime = (val) => {
        const mins = parseInt(val, 10);
        if (isNaN(mins)) return val;
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m === 0 ? `${h}h` : `${h}h ${m}m`;
      };

      if (fetchedMeta.runtime) runtimeTag = formatRuntime(fetchedMeta.runtime);
      else if (fetchedMeta.length_minutes) runtimeTag = formatRuntime(fetchedMeta.length_minutes);
      else if (fetchedMeta.episodes) runtimeTag = `${fetchedMeta.episodes} eps`;
      else if (fetchedMeta.pageCount) runtimeTag = `${fetchedMeta.pageCount} pages`;
    }
  } catch (e) {
    console.warn(`[Recommend] Failed to fetch detailed meta for candidate:`, e.message);
  }
  
  let finalTags = [...(candidate.payload.tags || [])];
  if (fetchedMeta && fetchedMeta.tags) {
    finalTags = [...new Set([...finalTags, ...fetchedMeta.tags])];
  }
  if (runtimeTag) finalTags.unshift(runtimeTag);

  let description = '';
  if (fetchedMeta && fetchedMeta.description && fetchedMeta.description.length > 30) {
    description = fetchedMeta.description.split('\n').map(s => s.trim()).filter(s => s.length > 0)[0].replace(/<[^>]*>?/gm, '').trim();
  } else if (fetchedMeta && fetchedMeta.synopsis && fetchedMeta.synopsis.length > 30) {
    description = fetchedMeta.synopsis.split('\n').map(s => s.trim()).filter(s => s.length > 0)[0].replace(/<[^>]*>?/gm, '').trim();
  }

  if (!description) {
    const synopsisRaw = candidate.payload.semantic_description || '';
    const plotMatch = synopsisRaw.match(/\[Story & Plot Type\]:\s*(.*?)(?=\n\[|$)/s);
    if (plotMatch && plotMatch[1]) {
      // Just take the first paragraph of the plot match to keep it concise
      description = plotMatch[1].trim().split('\n')[0];
    } else {
      description = synopsisRaw.split('\n')[0];
    }
  }

  let payloadGenres = candidate.payload.genres || [];
  if (payloadGenres.length === 0 || payloadGenres[0] === 'Unknown') {
    payloadGenres = (fetchedMeta && fetchedMeta.genres) ? fetchedMeta.genres : payloadGenres;
  }

  let payloadRelease = candidate.payload.release_year || '';
  if (!payloadRelease || payloadRelease === 'Unknown') {
    payloadRelease = (fetchedMeta && fetchedMeta.release_year && fetchedMeta.release_year !== 'Unknown') 
      ? fetchedMeta.release_year 
      : '';
  }

  let payloadStudio = candidate.payload.studio || '';
  if (!payloadStudio || payloadStudio === 'Unknown') {
    if (fetchedMeta) {
      payloadStudio = fetchedMeta.studio || fetchedMeta.developer || fetchedMeta.director || fetchedMeta.author || payloadStudio;
    }
  }

  return {
    id: candidate.id,
    title: candidate.payload.title,
    media_type: candidate.payload.media_type,
    coda_blurb: blurb || null,
    pitch_paragraphs: pitch || [],
    poster_url: meta.poster_url || '',
    ost_url: meta.ost_url || '',
    trailer_url: meta.trailer_url || '',
    description: description,
    genres: payloadGenres,
    tags: finalTags.slice(0, 10),
    release_year: payloadRelease,
    studio: payloadStudio
  };
};

const areFranchiseTitles = (a, b) => {
  if (!a || !b) return false;
  const cleanA = a.toLowerCase().replace(/^the\s+/, '').replace(/[^\w\s:]/g, '').trim();
  const cleanB = b.toLowerCase().replace(/^the\s+/, '').replace(/[^\w\s:]/g, '').trim();

  if (cleanA === cleanB) return true;

  // Substring check for longer titles
  if (cleanA.length >= 5 && cleanB.length >= 5) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  }

  // Colon prefix check (e.g. "ef: a tale of...")
  const partsA = cleanA.split(':');
  const partsB = cleanB.split(':');
  if (partsA.length > 1 && partsB.length > 1) {
    const rootA = partsA[0].trim();
    const rootB = partsB[0].trim();
    if (rootA === rootB && rootA.length >= 2) return true;
  }

  // Shared word prefix check (e.g. "ef a tale of...")
  const wordsA = cleanA.split(/\s+/);
  const wordsB = cleanB.split(/\s+/);
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    if (wordsA[0] === wordsB[0] && wordsA[1] === wordsB[1]) return true;
  }

  return false;
};

const isShortOrMusicVideo = (r, requestedMediaType) => {
  if (requestedMediaType !== 'anime') return false;
  
  const genres = (r.payload.genres || []).map(g => g.toLowerCase());
  const tags = (r.payload.tags || []).map(t => t.toLowerCase());
  const desc = (r.payload.semantic_description || '').toLowerCase();
  const title = (r.payload.title || '').toLowerCase();

  // 1. Check for explicit Music/Music Video indicators
  if (genres.includes('music') || tags.includes('music')) {
    return true;
  }
  
  // 2. Check description and title for short runtime indicators (under 10 minutes)
  const shortPatterns = [
    /runtime of (just )?\d minute/i,
    /runtime of (just )?[1-9] minute/i,
    /\b[1-9]-minute short\b/i,
    /\b[1-9] minute short\b/i,
    /short runtime of (just )?[1-9] minute/i,
    /short film of (just )?[1-9] minute/i,
    /music video/i,
    /\bcommercial\b/i,
    /promotional short/i,
    /anime music video/i,
    /amv/i,
    /runtime of (just )?one (minute|second)/i,
    /runtime of (just )?two (minute|second)/i,
    /runtime of (just )?three (minute|second)/i,
    /runtime of (just )?four (minute|second)/i,
    /runtime of (just )?five (minute|second)/i,
    /runtime of (just )?six (minute|second)/i,
    /runtime of (just )?seven (minute|second)/i,
    /runtime of (just )?eight (minute|second)/i,
    /runtime of (just )?nine (minute|second)/i,
    /runtime of (just )?ten (minute|second)/i
  ];

  for (const pattern of shortPatterns) {
    if (pattern.test(desc) || pattern.test(title)) {
      return true;
    }
  }

  return false;
};



// ── Core Recommendation Pipeline (Phase 3) ───────────────────────────────────
// specificAsk: optional string from /ask route — the user's explicit request text
// contextualState: optional object representing "The Now" (time, mood, etc)
// similarToTitle: optional string — the title of a reference media work for direct vector similarity queries
async function runQdrantPipeline(userId, requestedMediaType, specificAsk = null, contextualState = null, fallbackMemory = null, watchlistOnly = false, similarToTitle = null) {
  // 1. Fetch User Soul (Core Identity + Active State)
  let soul = { permanent_soul: {}, transient_memory: {} };
  if (userId) {
    try {
      soul = await userSoulService.getUserMemory(userId);
    } catch (e) {
      console.warn('[Recommend] Could not fetch User Soul, falling back to empty.', e.message);
    }
  }

  if ((!soul.permanent_soul || !soul.transient_memory) && fallbackMemory) {
    console.log('[Recommend] Qdrant memory missing or partial; using client memory snapshot as fallback.');
    soul = {
      permanent_soul: soul.permanent_soul || {
        globalIdentity: fallbackMemory.globalIdentity || [],
        categoryProfiles: fallbackMemory.categoryProfiles || {},
        guardrails: fallbackMemory.guardrails || [],
        media_reflections: fallbackMemory.media_reflections || [],
        soul_graph: fallbackMemory.soul_graph || null,
      },
      transient_memory: soul.transient_memory || {
        recentContext: fallbackMemory.recentContext || '',
        seen: fallbackMemory.seen || [],
        notForMe: fallbackMemory.notForMe || fallbackMemory.not_for_me || [],
        watchlist: fallbackMemory.watchlist || [],
        recentlyRecommended: fallbackMemory.recentlyRecommended || [],
      }
    };
  }

  soul.permanent_soul = soul.permanent_soul || {};
  soul.transient_memory = soul.transient_memory || {};

  if (fallbackMemory?.seen?.length > 0) {
    const seenSet = new Set([...(soul.transient_memory.seen || []), ...fallbackMemory.seen]);
    soul.transient_memory.seen = Array.from(seenSet);
  }
  const fallbackNotForMe = fallbackMemory?.notForMe || fallbackMemory?.not_for_me || [];
  if (fallbackNotForMe.length > 0) {
    const notForMeSet = new Set([...(soul.transient_memory.notForMe || []), ...fallbackNotForMe]);
    soul.transient_memory.notForMe = Array.from(notForMeSet);
  }

  // ── FAIL 6 FIX: If a specific ask exists, inject it as the active recentContext ──
  // This ensures the Search Brief prioritizes the explicit request over the permanent soul
  if (specificAsk) {
    soul.transient_memory.recentContext = specificAsk;
    console.log(`[Recommend] Specific ask injected as recentContext: "${specificAsk}"`);
  }

  // ── Inject Contextual State (The Now) ──
  if (contextualState) {
    soul.transient_memory.contextualState = contextualState;
    console.log(`[Recommend] Contextual State injected:`, JSON.stringify(contextualState));
  }

  const seen = soul.transient_memory?.seen || [];
  const notForMe = soul.transient_memory?.notForMe || [];
  const recentlyRecommended = soul.transient_memory?.recentlyRecommended || [];
  
  // Exclude the reference title itself if we are doing a similar-to search
  const baseExclude = [...seen, ...notForMe];
  if (similarToTitle) {
    baseExclude.push(similarToTitle);
  }
  const excludeList = [...baseExclude, ...recentlyRecommended].map(t => t.toLowerCase());

  let queryVector = null;
  let selected_vibe_focus = '';
  let directMatchFound = false;

  if (similarToTitle) {
    console.log(`[Recommend] Direct vector similarity query requested for: "${similarToTitle}". Checking database...`);
    const pointInfo = await qdrantService.getVectorAndPayloadByTitle('media_brain', similarToTitle);
    if (pointInfo && pointInfo.vector) {
      queryVector = pointInfo.vector;
      selected_vibe_focus = `Direct vector similarity search based on "${pointInfo.payload.title}"`;
      directMatchFound = true;
      console.log(`[Recommend] Found vector for "${pointInfo.payload.title}". Skipping LLM search brief synthesis.`);
    } else {
      console.log(`[Recommend] Vector for "${similarToTitle}" not found in DB. Falling back to LLM brief synthesis.`);
    }
  }

  if (!directMatchFound) {
    console.log(`[Recommend] Generating brief for ${requestedMediaType}...`);
    // 2. Synthesize Search Brief
    const briefResult = await llmService.synthesizeSearchBrief(soul, requestedMediaType);
    selected_vibe_focus = briefResult.selected_vibe_focus;
    const search_brief = briefResult.search_brief;
    console.log(`[Recommend] Vibe Focus: "${selected_vibe_focus}"`);
    console.log(`[Recommend] Brief: "${search_brief}"`);

    // 3. Vector Search
    queryVector = await embeddingService.embed(search_brief);

    // Blend with user's permanent soul_vector (the fence) if available to guide the search
    if (soul.soul_vector && Array.isArray(soul.soul_vector) && soul.soul_vector.length === queryVector.length) {
      console.log(`[Recommend] Blending search brief vector with User Soul Vector (70/30) to ground candidates in Taste Space.`);
      for (let i = 0; i < queryVector.length; i++) {
        queryVector[i] = 0.7 * queryVector[i] + 0.3 * soul.soul_vector[i];
      }
    }
  }
  
  const qdrantMediaType = requestedMediaType === 'visualNovel' ? 'visual novel' : requestedMediaType;
  const filter = {
    must: [
      { key: "media_type", match: { value: qdrantMediaType } }
    ]
  };

  if (watchlistOnly) {
    const watchlist = soul.transient_memory?.watchlist || [];
    if (watchlist.length > 0) {
      const watchlistTitles = watchlist.map(w => typeof w === 'string' ? w : w.title).filter(Boolean);
      // Resolve titles to actual Qdrant UUIDs by scanning the collection
      const watchlistIds = await qdrantService.findIdsByTitles('media_brain', watchlistTitles);
      if (watchlistIds.length > 0) {
        // Keep the media_type filter so we only show watchlist items for the currently selected tab
        filter.must.push({ has_id: watchlistIds });
        console.log(`[Recommend] Watchlist mode: resolved ${watchlistTitles.length} titles -> ${watchlistIds.length} Qdrant IDs.`);
      } else {
        // None of the watchlist items are in the brain yet — queue them all and return empty
        console.warn(`[Recommend] Watchlist mode: none of the ${watchlistTitles.length} watchlist items found in media_brain.`);
        for (const t of watchlistTitles) {
          await qdrantService.pushToQueue(t, 'unknown', 1);
        }
        throw new Error('EMPTY_WATCHLIST');
      }
    } else {
      console.warn(`[Recommend] Watchlist mode enabled, but user's watchlist is empty.`);
      throw new Error('EMPTY_WATCHLIST');
    }
  }

  // We fetch up to 30 candidates from the vector DB, but if watchlistOnly is true, we might just get exactly the watchlist
  const rawResults = await qdrantService.search('media_brain', queryVector, 30, filter);
  
  // 4. Filter Results
  // 4.1 Filter out items the user has seen, rejected, or are sequels of seen/rejected items
  const baseFiltered = rawResults.filter(r => {
    const candidateTitle = r.payload.title;
    // Check direct exclusion first
    if (excludeList.includes(candidateTitle.toLowerCase())) return false;
    
    // Check franchise/sequel match against user's seen and notForMe lists
    for (const excludedTitle of [...seen, ...notForMe]) {
      if (areFranchiseTitles(candidateTitle, excludedTitle)) {
        console.log(`[Recommend Filter] Excluded sequel/franchise "${candidateTitle}" based on seen/rejected: "${excludedTitle}"`);
        return false;
      }
    }
    return true;
  });

  // 4.2 Separate into regular and short/music pools to prevent shorts/MVs from crowding out full-length titles
  const queryText = (specificAsk || selected_vibe_focus || '').toLowerCase();
  const userWantsMusicOrShort = queryText.includes('music') || 
                                queryText.includes('song') || 
                                queryText.includes('short') || 
                                queryText.includes('mv') || 
                                queryText.includes('video');

  const regularPool = [];
  const shortOrMusicPool = [];

  for (const r of baseFiltered) {
    if (!userWantsMusicOrShort && isShortOrMusicVideo(r, requestedMediaType)) {
      shortOrMusicPool.push(r);
    } else {
      regularPool.push(r);
    }
  }

  // Deduplicate and select top 10, prioritizing regular pool
  const candidates = [];
  const combinedPool = [...regularPool, ...shortOrMusicPool];

  for (const candidate of combinedPool) {
    let isDuplicate = false;
    for (const kept of candidates) {
      if (areFranchiseTitles(candidate.payload.title, kept.payload.title)) {
        console.log(`[Recommend Filter] Intra-pool duplicate excluded: "${candidate.payload.title}" (already kept: "${kept.payload.title}")`);
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      candidates.push(candidate);
      if (candidates.length === 10) break; // Take top 10
    }
  }


  if (candidates.length === 0) {
    throw new Error("No matching candidates found in Media Brain.");
  }

  console.log(`[Recommend] Filtered to ${candidates.length} strong candidates. Passing to Editorial Director with vibe focus: "${selected_vibe_focus}"...`);

  // 5. Deep Evaluation — pass the declared vibe focus so the Director judges against it
  const editorialDecision = await llmService.evaluateCandidates(candidates, soul, selected_vibe_focus);

  
  const topCandidate = candidates.find(c => c.id === editorialDecision.top_pick.id) || candidates[0];
  const runnerUps = editorialDecision.runner_ups
    .map(id => candidates.find(c => c.id === id))
    .filter(Boolean);

  // Formatting helper moved to module level
  const topResponse = await mapCandidateToResponse(
    topCandidate,
    editorialDecision.top_pick.pitch_paragraphs,
    editorialDecision.top_pick.coda_blurb
  );
  const runnerUpResponses = (await Promise.all(
    (editorialDecision.runner_ups || []).map(async ru => {
      const parsedId = typeof ru === 'string' ? ru : ru?.id;
      const parsedBlurb = typeof ru === 'string' ? null : ru?.coda_blurb;
      if (!parsedId) return null;
      
      const candidate = candidates.find(c => c.id === parsedId);
      if (!candidate) return null; // Skip if LLM hallucinated an ID

      return await mapCandidateToResponse(candidate, null, parsedBlurb);
    })
  )).filter(Boolean);

  // ── Persist selected_vibe_focus to recentVibes[] and recommendations to recentlyRecommended[] ──
  const newlyRecommended = [topResponse?.title, ...runnerUpResponses.map(r => r.title)].filter(Boolean);
  if (userId && selected_vibe_focus) {
    setImmediate(async () => {
      try {
        const freshSoul = await userSoulService.getUserMemory(userId);
        const recentVibes = freshSoul.transient_memory?.recentVibes || [];
        const recentRecs = freshSoul.transient_memory?.recentlyRecommended || [];
        
        // Prepend current focus, cap at 5
        const updatedVibes = [selected_vibe_focus, ...recentVibes].slice(0, 5);
        // Prepend current recommendations, cap at 15
        const updatedRecs = [...new Set([...newlyRecommended, ...recentRecs])].slice(0, 15);
        
        const updatedMemory = {
          ...(freshSoul.permanent_soul || {}),
          ...(freshSoul.transient_memory || {}),
          recentVibes: updatedVibes,
          recentlyRecommended: updatedRecs,
        };
        await userSoulService.syncLivingMemory(userId, updatedMemory);
        console.log(`[Recommend] Saved vibe focus to recentVibes (${updatedVibes.length} tracked) and ${newlyRecommended.length} recommended titles to recentlyRecommended.`);
      } catch (e) {
        console.warn('[Recommend] Failed to persist recentVibes / recentlyRecommended:', e.message);
      }
    });
  }

  return [topResponse, ...runnerUpResponses];
}

// ── Route Handlers ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { userId, requested_media_type, contextualState, current_memory, watchlist_only } = req.body;
    console.log(`\n[Recommend] ════════ Request from user: ${userId} for ${requested_media_type} (Watchlist Mode: ${watchlist_only}) ════════`);
    
    const recommendations = await runQdrantPipeline(userId, requested_media_type, null, contextualState, current_memory, watchlist_only);
    
    res.json({
      status: 'success', recommendations });
    
  } catch (error) {
    console.error('[Recommend Route Error]:', error);
    res.status(500).json({ error: 'Recommendation failed', details: error.message });
  }
});

router.post('/pitch', async (req, res) => {
  try {
    const { userId, title, requested_media_type } = req.body;
    console.log(`\n[Pitch] Generating lazy pitch for: "${title}"`);

    let soul = { permanent_soul: {}, transient_memory: {} };
    if (userId) {
      soul = await userSoulService.getUserMemory(userId);
    }

    // Hash the key to find the item in Qdrant
    const key = `${requested_media_type}:${title.toLowerCase()}`;
    const uuid = crypto.createHash('md5').update(key).digest('hex');
    const formattedUuid = [
      uuid.substring(0, 8), uuid.substring(8, 12), uuid.substring(12, 16),
      uuid.substring(16, 20), uuid.substring(20, 32)
    ].join('-');

    let candidatePoint;
    try {
      candidatePoint = await qdrantService.getPoint('media_brain', formattedUuid);
    } catch (e) {
      console.warn('[Pitch] Candidate not found in Qdrant, returning empty pitch.');
    }

    if (candidatePoint) {
       // Deep Evaluation just for one candidate to write the pitch
       const candidates = [candidatePoint];
       const editorialDecision = await llmService.evaluateCandidates(candidates, soul);
       const pitch = editorialDecision.top_pick.pitch_paragraphs || [];
       const blurb = editorialDecision.top_pick.coda_blurb || '';
       res.json({ pitch_paragraphs: pitch, coda_blurb: blurb });
    } else {
       res.json({ pitch_paragraphs: [], coda_blurb: '' });
    }
  } catch (error) {
    console.error('[Pitch Route Error]:', error);
    res.status(500).json({ error: 'Pitch generation failed', details: error.message });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { userId, current_memory, recommendation_title, media_type, feedback_reason } = req.body;

    // ── FAIL 7 FIX: Fetch authoritative memory from Qdrant — don't trust stale client state ──
    let authoritativeMemory = current_memory || {};
    if (userId) {
      try {
        const freshSoul = await userSoulService.getUserMemory(userId);
        authoritativeMemory = {
          ...(freshSoul.permanent_soul || {}),
          ...(freshSoul.transient_memory || {}),
        };
        console.log(`[Feedback Engine] Fetched authoritative memory from Qdrant for user ${userId}`);
      } catch (e) {
        console.warn('[Feedback Engine] Could not fetch from Qdrant, falling back to client memory:', e.message);
      }
    }

    const updates = await llmService.refineTasteFromFeedback(
      authoritativeMemory, recommendation_title, media_type, feedback_reason
    );

    // Apply feedback updates on top of the authoritative memory and save
    if (userId && updates) {
      if (updates.global_identity_appends?.length > 0) {
        authoritativeMemory.globalIdentity = [...(authoritativeMemory.globalIdentity || []), ...updates.global_identity_appends];
      }
      if (updates.guardrails_appends?.length > 0) {
        authoritativeMemory.guardrails = [...(authoritativeMemory.guardrails || []), ...updates.guardrails_appends];
      }
      if (updates.category_appends) {
        authoritativeMemory.categoryProfiles = authoritativeMemory.categoryProfiles || {};
        for (const [cat, items] of Object.entries(updates.category_appends)) {
          authoritativeMemory.categoryProfiles[cat] = [...(authoritativeMemory.categoryProfiles[cat] || []), ...items];
        }
      }
      if (updates.recent_context_overwrite) {
        authoritativeMemory.recentContext = updates.recent_context_overwrite;
      }
      
      await userSoulService.syncLivingMemory(userId, authoritativeMemory);
      console.log(`[Feedback Engine] Context shift applied for user ${userId}: "${updates.recent_context_overwrite || 'guardrail/identity update'}"`);
    }

    res.json(updates);
  } catch (error) {
    console.error('[Feedback Error]:', error);
    res.status(500).json({ error: 'Feedback failed' });
  }
});


router.post('/swipe', async (req, res) => {
  try {
    const { userId, title, action } = req.body;
    // Actions correspond strictly to UI mechanics: 'loved', 'not_for_me', 'seen'
    
    if (!userId || !title || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const soul = await userSoulService.getUserMemory(userId);
    const livingMemoryJson = {
      ...(soul.permanent_soul || {}),
      ...(soul.transient_memory || {})
    };

    if (action === 'loved') {
      // 1. Maintain dedicated loved_titles array
      livingMemoryJson.loved_titles = livingMemoryJson.loved_titles || [];
      if (!livingMemoryJson.loved_titles.includes(title)) {
        livingMemoryJson.loved_titles.push(title);
      }

      // 2. Backward compatible globalIdentity entry
      livingMemoryJson.globalIdentity = livingMemoryJson.globalIdentity || [];
      const entry = `Highly values: ${title} (loved work)`;
      if (!livingMemoryJson.globalIdentity.includes(entry)) {
        livingMemoryJson.globalIdentity.push(entry);
      }
      livingMemoryJson.seen = livingMemoryJson.seen || [];
      if (!livingMemoryJson.seen.includes(title)) {
        livingMemoryJson.seen.push(title);
      }

      // Sync living memory immediately to update the centroid
      await userSoulService.syncLivingMemory(userId, livingMemoryJson);

      // Trigger targeted Mycelium Crawl for the newly loved title
      try {
        const mediaEnrichmentService = require('../services/mediaEnrichmentService');
        await mediaEnrichmentService.enrichTitleAndNeighbors(title, 'unknown');
      } catch(e) {
        console.warn(`[Swipe] Failed to trigger Mycelium crawl:`, e.message);
      }

      // Re-run the global harmonization pass in the background to grow the Soul Graph
      setImmediate(async () => {
        try {
          console.log(`[Swipe Engine] Triggering background Soul Graph harmonization for user ${userId} after loving "${title}"`);
          const harmonized = await llmService.harmonizeAllMemory(livingMemoryJson);
          if (harmonized && harmonized.soul_graph) {
            // Fetch the latest state to avoid race conditions
            const freshSoul = await userSoulService.getUserMemory(userId);
            const freshMemory = {
              ...(freshSoul.permanent_soul || {}),
              ...(freshSoul.transient_memory || {})
            };
            freshMemory.soul_graph = harmonized.soul_graph;
            if (harmonized.global_identity_overwrite) {
              freshMemory.globalIdentity = harmonized.global_identity_overwrite;
            }
            if (harmonized.category_profiles_overwrite) {
              freshMemory.categoryProfiles = harmonized.category_profiles_overwrite;
            }
            await userSoulService.syncLivingMemory(userId, freshMemory);
            console.log(`[Swipe Engine] Background Soul Graph harmonization completed successfully for user ${userId}`);
          }
        } catch (err) {
          console.error(`[Swipe Engine] Background Soul Graph harmonization failed:`, err.message);
        }
      });
    } else {
      if (action === 'not_for_me') {
        livingMemoryJson.notForMe = livingMemoryJson.notForMe || [];
        if (!livingMemoryJson.notForMe.includes(title)) {
          livingMemoryJson.notForMe.push(title);
        }
      } else if (action === 'seen') {
        livingMemoryJson.seen = livingMemoryJson.seen || [];
        if (!livingMemoryJson.seen.includes(title)) {
          livingMemoryJson.seen.push(title);
        }
      } else {
        return res.status(400).json({ error: 'Invalid action parameter' });
      }
      // Sync living memory for other actions
      await userSoulService.syncLivingMemory(userId, livingMemoryJson);
    }
    
    console.log(`[Swipe Engine] Processed '${action}' for ${title} (User: ${userId})`);
    res.json({ status: 'success', action, title });
  } catch (error) {
    console.error('[Swipe Error]:', error);
    res.status(500).json({ error: 'Swipe processing failed' });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { userId, current_memory, title, media_type, coda_blurb, pitch_paragraphs, chat_history, user_message } = req.body;
    const response = await llmService.discussRecommendation(
      current_memory || {}, title, media_type, coda_blurb || "",
      pitch_paragraphs || [], chat_history || [], user_message
    );

    // Apply memory updates directly if user is logged in
    if (userId && response.memory_updates && current_memory) {
      const updates = response.memory_updates;
      
      if (updates.global_identity_appends) {
        current_memory.globalIdentity = [...(current_memory.globalIdentity || []), ...updates.global_identity_appends];
      }
      if (updates.guardrails_appends) {
        current_memory.guardrails = [...(current_memory.guardrails || []), ...updates.guardrails_appends];
      }
      if (updates.media_reflections_appends) {
        current_memory.media_reflections = [...(current_memory.media_reflections || []), ...updates.media_reflections_appends];
      }
      if (updates.seen_appends) {
        current_memory.seen = [...(current_memory.seen || []), ...updates.seen_appends];
      }
      if (updates.not_for_me_appends) {
        current_memory.notForMe = [...(current_memory.notForMe || []), ...updates.not_for_me_appends];
      }
      if (updates.recent_context_overwrite) {
        current_memory.recentContext = updates.recent_context_overwrite;
      }
      
      const userSoulService = require('../services/userSoulService');
      await userSoulService.syncLivingMemory(userId, current_memory);
      if (updates.recent_context_overwrite) {
        console.log(`[Chat Engine] Applied context shift for user ${userId}: "${updates.recent_context_overwrite}"`);
      }
    }

    res.json({
      message: response.message,
      one_line_summary: response.one_line_summary,
      memory_updates: response.memory_updates
    });
  } catch (error) {
    res.status(500).json({ error: 'Chat failed' });
  }
});

router.post('/ask', async (req, res) => {
  try {
    const { current_memory, chat_history, user_message, userId, contextualState, watchlist_only } = req.body;
    const parsed = await llmService.handleAskChat(current_memory || {}, chat_history || [], user_message, watchlist_only);

    if (parsed.status === 'success' && parsed.media_type && parsed.recommendation_query) {
      let recommendations = [];
      try {
        // ── Pass the specific ask and any reference title into the pipeline ──
        recommendations = await runQdrantPipeline(userId, parsed.media_type, parsed.recommendation_query, contextualState, current_memory, watchlist_only, parsed.similar_to_title);
      } catch (pipelineError) {
        console.error('[Ask Engine] Qdrant Pipeline Failed. Falling back to LLM internal knowledge:', pipelineError.message);
        const fallbackMessage = await llmService.fallbackAskChat(current_memory || {}, chat_history || [], user_message, parsed.recommendation_query);
        return res.json({
          status: 'success',
          message: fallbackMessage,
          recommendation: null // No structured recommendation object since pipeline failed
        });
      }

      // ── FAIL 6 FIX PART 2: Persist the specific ask as recentContext in Qdrant ──
      if (userId) {
        try {
          const freshSoul = await userSoulService.getUserMemory(userId);
          const updatedMemory = {
            ...(freshSoul.permanent_soul || {}),
            ...(freshSoul.transient_memory || {}),
            recentContext: parsed.recommendation_query,
          };
          await userSoulService.syncLivingMemory(userId, updatedMemory);
          console.log(`[Ask Engine] Saved specific ask to recentContext: "${parsed.recommendation_query}"`);
        } catch (e) {
          console.warn('[Ask Engine] Failed to persist recentContext:', e.message);
        }
      }

      res.json({
        status: 'success',
        message: parsed.message,
        recommendation: recommendations[0]
      });
      return;
    }

    if (parsed.status === 'match' && parsed.match_target) {
      // Direct Match Request: "Is Severance for me?"
      const qdrantService = require('../services/qdrantService');
      const embeddingService = require('../services/embeddingService');
      
      const pointInfo = await qdrantService.getVectorAndPayloadByTitle('media_brain', parsed.match_target);
      const hit = pointInfo ? { id: parsed.match_target.toLowerCase().replace(/[^a-z0-9]/g, ''), payload: pointInfo.payload } : null;

      if (!hit) {
        // Fallback: Queue it for enrichment!
        await qdrantService.pushToQueue(parsed.match_target, "unknown", 1); // Tier 1 (Highest priority)
        
        res.json({
          status: 'chatting',
          message: `I actually don't have ${parsed.match_target} in my core database yet! I've just added it to my immediate study queue, so check back in a couple of minutes!`,
          recommendation: null
        });
        return;
      }

      // 2. Evaluate the match against the user's soul
      let soulVector = null;
      let memoryToUse = current_memory || {};
      if (userId) {
        try {
          const freshSoul = await userSoulService.getUserMemory(userId);
          soulVector = freshSoul.soul_vector;
          memoryToUse = {
            ...(freshSoul.permanent_soul || {}),
            ...(freshSoul.transient_memory || {}),
            ...memoryToUse
          };
        } catch (e) {
          console.warn('[Ask Match] Failed to fetch user memory:', e.message);
        }
      }

      let similarity = null;
      if (soulVector && pointInfo && pointInfo.vector) {
        similarity = embeddingService.calculateCosineSimilarity(soulVector, pointInfo.vector);
      }

      const evaluation = await llmService.evaluateMatch(hit, memoryToUse, similarity);

      // 3. We still need to generate the full recommendation payload so it can be promoted to the home screen
      // We can run evaluateCandidates with just this one candidate to generate the pitch and blurb
      const candidates = [hit];
      const recommendationResponse = await llmService.evaluateCandidates(candidates, memoryToUse, "Checking if this is for you...");
      
      const finalRecommendation = await mapCandidateToResponse(
        hit,
        recommendationResponse.top_pick.pitch_paragraphs,
        recommendationResponse.top_pick.coda_blurb
      );

      // Merge the match conviction into the response
      res.json({
        status: 'match',
        message: evaluation.conviction_statement,
        is_match: evaluation.is_match,
        recommendation: finalRecommendation
      });
      return;
    }

    res.json({ status: 'chatting', message: parsed.message, recommendation: null });
  } catch (error) {
    console.error('[Ask Route Error]:', error);
    res.status(500).json({ error: 'Ask chat failed' });
  }
});

router.post('/vibe-check', async (req, res) => {
  try {
    const { title, userId, current_memory } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const qdrantService = require('../services/qdrantService');
    const embeddingService = require('../services/embeddingService');

    const pointInfo = await qdrantService.getVectorAndPayloadByTitle('media_brain', title);
    const hit = pointInfo ? { id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), payload: pointInfo.payload } : null;

    if (!hit) {
      await qdrantService.pushToQueue(title, req.body.media_type || "unknown", 1); // Tier 1

      return res.json({
        is_match: null,
        conviction_statement: `I don't have enough data on ${title} yet! I've added it to my immediate study queue, so check back in a few minutes.`
      });
    }

    let soulVector = null;
    let memoryToUse = current_memory || {};
    if (userId) {
      try {
        const freshSoul = await userSoulService.getUserMemory(userId);
        soulVector = freshSoul.soul_vector;
        memoryToUse = {
          ...(freshSoul.permanent_soul || {}),
          ...(freshSoul.transient_memory || {}),
          ...memoryToUse
        };
      } catch (e) {
        console.warn('[Vibe Check] Failed to fetch user memory:', e.message);
      }
    }

    let similarity = null;
    if (soulVector && pointInfo && pointInfo.vector) {
      similarity = embeddingService.calculateCosineSimilarity(soulVector, pointInfo.vector);
    }

    const evaluation = await llmService.evaluateMatch(hit, memoryToUse, similarity);
    res.json(evaluation);
  } catch (error) {
    console.error('[Vibe Check Error]:', error);
    res.status(500).json({ error: 'Vibe check failed' });
  }
});

router.post('/promote', async (req, res) => {
  try {
    const { title, current_memory } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const qdrantService = require('../services/qdrantService');
    const exactHits = await qdrantService.searchByTitle('media_brain', title);
    const hit = exactHits ? { id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), payload: exactHits } : null;

    if (!hit) {
      await qdrantService.pushToQueue(title, "unknown", 1);
      
      const syntheticHit = {
        id: title.toLowerCase().replace(/[^a-z0-9]/g, ''),
        payload: {
          title: title,
          media_type: "unknown",
          genres: [],
          description: "I don't have this in my brain yet, but I've added it to my immediate study queue. Once I finish analyzing it, it will have a full personalized profile. For now, you can still add it to your loved media, and I'll make sure to learn from it!",
          semantic_description: ""
        }
      };

      const finalRecommendation = await mapCandidateToResponse(
        syntheticHit,
        [
          "I'm still studying this one! I've added it to my immediate study queue and will have a full breakdown ready shortly.",
          "Even though I don't know much about it yet, you can still add it to your loved media so I can learn from your tastes."
        ],
        "Currently studying this..."
      );

      return res.json({
        status: 'promoted_synthetic',
        message: 'Promoted as a synthetic placeholder.',
        recommendation: finalRecommendation
      });
    }

    const candidates = [hit];
    // We generate the full pitch and blurb for the promoted item
    const recommendationResponse = await llmService.evaluateCandidates(
      candidates, 
      current_memory || {}, 
      "Promoted to Home Screen"
    );

    const finalRecommendation = await mapCandidateToResponse(
      hit,
      recommendationResponse.top_pick.pitch_paragraphs,
      recommendationResponse.top_pick.coda_blurb
    );

    res.json({
      status: 'success',
      recommendation: finalRecommendation
    });
  } catch (error) {
    console.error('[Promote Error]:', error);
    res.status(500).json({ error: 'Promote failed' });
  }
});

module.exports = router;
