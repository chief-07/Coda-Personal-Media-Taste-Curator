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
    
    const response = await axios({
      method: 'get', url, responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' }, timeout: 10000
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

// ── Core Recommendation Pipeline (Phase 3) ───────────────────────────────────
// specificAsk: optional string from /ask route — the user's explicit request text
// contextualState: optional object representing "The Now" (time, mood, etc)
async function runQdrantPipeline(userId, requestedMediaType, specificAsk = null, contextualState = null, fallbackMemory = null, watchlistOnly = false) {
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
  const excludeList = [...seen, ...notForMe].map(t => t.toLowerCase());

  console.log(`[Recommend] Generating brief for ${requestedMediaType}...`);
  // 2. Synthesize Search Brief (now returns both the facet declaration AND the paragraph)
  const { selected_vibe_focus, search_brief } = await llmService.synthesizeSearchBrief(soul, requestedMediaType);
  console.log(`[Recommend] Vibe Focus: "${selected_vibe_focus}"`);
  console.log(`[Recommend] Brief: "${search_brief}"`);

  // 3. Vector Search
  const queryVector = await embeddingService.embed(search_brief);
  const filter = {
    must: [
      { key: "media_type", match: { value: requestedMediaType } }
    ]
  };

  if (watchlistOnly) {
    const watchlist = soul.transient_memory?.watchlist || [];
    if (watchlist.length > 0) {
      filter.must.push({
        key: "title",
        match: { any: watchlist }
      });
      console.log(`[Recommend] Watchlist mode enabled. Restricting Qdrant search to ${watchlist.length} titles.`);
    } else {
      console.warn(`[Recommend] Watchlist mode enabled, but user's watchlist is empty.`);
    }
  }

  // We fetch up to 30 candidates from the vector DB, but if watchlistOnly is true, we might just get exactly the watchlist
  const rawResults = await qdrantService.search('media_brain', queryVector, 30, filter);
  
  // 4. Filter Results
  const candidates = rawResults.filter(r => {
    // Filter out items the user has seen or rejected
    if (excludeList.includes(r.payload.title.toLowerCase())) return false;
    return true;
  }).slice(0, 10); // Take top 10 valid candidates for evaluation

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

  // 6. Format Output
  const mapCandidateToResponse = async (candidate, pitch = null, blurb = null) => {
    const meta = await mediaService.fetchAssets(candidate.payload.title, candidate.payload.media_type);
    
    // Attempt to fetch runtime/length tags dynamically
    let runtimeTag = null;
    try {
      const detailedMeta = await searchService.fetchMetadataForCandidate(candidate.payload.title, candidate.payload.media_type);
      if (detailedMeta) {
        if (detailedMeta.runtime) runtimeTag = detailedMeta.runtime;
        else if (detailedMeta.length_minutes) runtimeTag = `${detailedMeta.length_minutes}m`;
        else if (detailedMeta.episodes) runtimeTag = `${detailedMeta.episodes} eps`;
        else if (detailedMeta.pageCount) runtimeTag = `${detailedMeta.pageCount} pages`;
      }
    } catch (e) {
      console.warn(`[Recommend] Failed to fetch detailed meta for runtime tag:`, e.message);
    }
    
    const finalTags = [...(candidate.payload.tags || [])];
    if (runtimeTag) finalTags.unshift(runtimeTag);

    return {
      id: candidate.id,
      title: candidate.payload.title,
      media_type: candidate.payload.media_type,
      coda_blurb: blurb || null,
      pitch_paragraphs: pitch || [],
      poster_url: meta.posterUrl || '',
      ost_url: '',
      trailer_url: meta.trailerUrl || '',
      description: candidate.payload.semantic_description,
      genres: candidate.payload.genres || [],
      tags: finalTags,
      release_year: candidate.payload.release_year || '',
      studio: candidate.payload.studio || ''
    };
  };

  const topResponse = await mapCandidateToResponse(
    topCandidate,
    editorialDecision.top_pick.pitch_paragraphs,
    editorialDecision.top_pick.coda_blurb
  );
  const runnerUpResponses = await Promise.all(runnerUps.map(c => mapCandidateToResponse(c)));

  // ── FAIL 11 FIX: Persist selected_vibe_focus to recentVibes[] so next run drifts ──
  if (userId && selected_vibe_focus) {
    setImmediate(async () => {
      try {
        const freshSoul = await userSoulService.getUserMemory(userId);
        const recentVibes = freshSoul.transient_memory?.recentVibes || [];
        // Prepend current focus, cap at 5
        const updatedVibes = [selected_vibe_focus, ...recentVibes].slice(0, 5);
        const updatedMemory = {
          ...(freshSoul.permanent_soul || {}),
          ...(freshSoul.transient_memory || {}),
          recentVibes: updatedVibes,
        };
        await userSoulService.syncLivingMemory(userId, updatedMemory);
        console.log(`[Recommend] Saved vibe focus to recentVibes (${updatedVibes.length} tracked): "${selected_vibe_focus}"`);
      } catch (e) {
        console.warn('[Recommend] Failed to persist recentVibes:', e.message);
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
       res.json({ pitch_paragraphs: pitch });
    } else {
       res.json({ pitch_paragraphs: [] });
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
      livingMemoryJson.globalIdentity = livingMemoryJson.globalIdentity || [];
      const entry = `Highly values: ${title} (loved work)`;
      if (!livingMemoryJson.globalIdentity.includes(entry)) {
        livingMemoryJson.globalIdentity.push(entry);
      }
      livingMemoryJson.seen = livingMemoryJson.seen || [];
      if (!livingMemoryJson.seen.includes(title)) {
        livingMemoryJson.seen.push(title);
      }
    } else if (action === 'not_for_me') {
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

    // Syncing living memory re-computes the Centroid and triggers the Mycelium Crawler if it was "loved"
    await userSoulService.syncLivingMemory(userId, livingMemoryJson);
    
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
        // ── FAIL 6 FIX PART 1: Pass the specific ask into the pipeline so it shapes the Search Brief ──
        recommendations = await runQdrantPipeline(userId, parsed.media_type, parsed.recommendation_query, contextualState, current_memory, watchlist_only);
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
      
      // 1. Fetch exact match from Qdrant
      const exactHits = await qdrantService.searchByTitle('media_brain', parsed.match_target);
      const hit = exactHits && exactHits.length > 0 ? exactHits[0] : null;

      if (!hit) {
        res.json({
          status: 'chatting',
          message: `I actually don't have ${parsed.match_target} in my core database yet, so I can't give you a true vibe check on it! Let me know if you want something else.`,
          recommendation: null
        });
        return;
      }

      // 2. Evaluate the match against the user's soul
      const evaluation = await llmService.evaluateMatch(hit, current_memory || {});

      // 3. We still need to generate the full recommendation payload so it can be promoted to the home screen
      // We can run evaluateCandidates with just this one candidate to generate the pitch and blurb
      const candidates = [hit];
      const recommendationResponse = await llmService.evaluateCandidates(candidates, current_memory || {}, "Checking if this is for you...");
      
      // Merge the match conviction into the response
      res.json({
        status: 'match',
        message: evaluation.conviction_statement,
        is_match: evaluation.is_match,
        recommendation: recommendationResponse.top_pick
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
    const exactHits = await qdrantService.searchByTitle('media_brain', title);
    const hit = exactHits && exactHits.length > 0 ? exactHits[0] : null;

    if (!hit) {
      return res.json({
        is_match: null,
        conviction_statement: `I don't have enough data on ${title} yet to give you a true vibe check!`
      });
    }

    let memoryToUse = current_memory || {};
    if (userId && !current_memory) {
      const freshSoul = await userSoulService.getUserMemory(userId);
      memoryToUse = {
        ...(freshSoul.permanent_soul || {}),
        ...(freshSoul.transient_memory || {})
      };
    }

    const evaluation = await llmService.evaluateMatch(hit, memoryToUse);
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
    const hit = exactHits && exactHits.length > 0 ? exactHits[0] : null;

    if (!hit) {
      return res.status(404).json({ error: `Could not find ${title} in the database to promote.` });
    }

    const candidates = [hit];
    // We generate the full pitch and blurb for the promoted item
    const recommendationResponse = await llmService.evaluateCandidates(
      candidates, 
      current_memory || {}, 
      "Promoted to Home Screen"
    );

    res.json({
      status: 'success',
      recommendation: recommendationResponse.top_pick
    });
  } catch (error) {
    console.error('[Promote Error]:', error);
    res.status(500).json({ error: 'Promote failed' });
  }
});

module.exports = router;
