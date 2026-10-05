const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const llmService = require('../services/llmService');
const userSoulService = require('../services/userSoulService');
const walrusMemoryService = require('../services/walrusMemoryService');

// ── Image Proxy ──────────────────────────────────────────────────────────────
const IMAGE_CACHE_DIR = path.join(__dirname, '../cache/images');
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

router.get('/proxy-image', async (req, res) => {
  let { url } = req.query;
  try {
    if (!url) return res.status(400).send('Missing url parameter');
    if (url.includes('thumb.wikimedia.org') && !url.includes('/thumb/')) {
      url = url.replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/');
    }
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

// ── Content Guardrail Blocklists & Helpers ──────────────────────────────────
const CONTENT_SIGNAL_BLOCKLISTS = [
  {
    signals: ['christian', 'religious', 'faith-based', 'faith based', 'wholesome', 'family-friendly', 'family friendly', 'clean content', 'no adult', 'no explicit', 'no sexual', 'no 18+', 'no mature content'],
    blocked: ['erotica', 'erotic', 'eroge', 'adult', '18+', 'hentai', 'explicit', 'sexual content', 'nudity', 'ecchi', 'sexually explicit', 'pornographic', 'nsfw', 'eroticism', 'softcore', 'hardcore', 'adult content']
  },
  {
    signals: ['no gore', 'no violence', 'no guro', 'avoid violence', 'avoid gore', 'no graphic violence', 'no blood'],
    blocked: ['gore', 'guro', 'graphic violence', 'extreme violence', 'body horror', 'torture', 'snuff', 'splatter']
  },
  {
    signals: ['no horror', 'avoid horror', 'not horror'],
    blocked: ['horror', 'psychological horror', 'survival horror', 'terror', 'disturbing']
  },
  {
    signals: ['no ntr', 'no cheating', 'no netorare', 'avoid ntr'],
    blocked: ['ntr', 'netorare', 'netori', 'cheating', 'cuckold']
  },
  {
    signals: ['no bl', 'no yaoi', 'no boys love', 'no boyslove', 'no male romance'],
    blocked: ['bl', 'yaoi', 'boys love', 'male x male', 'shounen ai', 'shounen-ai']
  },
  {
    signals: ['no gl', 'no yuri', 'no girls love', 'no girlslove', 'no female romance'],
    blocked: ['gl', 'yuri', 'girls love', 'shoujo ai', 'shoujo-ai']
  },
];

const DEFAULT_BLOCKED_TERMS = [
  'erotica', 'erotic', 'eroge', 'adult', '18+', 'hentai', 'explicit', 'sexual content', 'nudity', 'ecchi', 'sexually explicit', 'pornographic', 'nsfw', 'eroticism', 'softcore', 'hardcore', 'adult content'
];

const tagMatchesBlockedTerm = (tag, blockedTerm) => {
  if (tag === blockedTerm) return true;
  if (!tag.includes(blockedTerm)) return false;
  let pos = tag.indexOf(blockedTerm);
  while (pos !== -1) {
    const charBefore = pos > 0 ? tag[pos - 1] : '';
    const charAfter = pos + blockedTerm.length < tag.length ? tag[pos + blockedTerm.length] : '';
    const isBeforeAlphanumeric = /[a-z0-9\\-]/i.test(charBefore);
    const isAfterAlphanumeric = /[a-z0-9\\-]/i.test(charAfter);
    if (!isBeforeAlphanumeric && !isAfterAlphanumeric) return true;
    pos = tag.indexOf(blockedTerm, pos + 1);
  }
  return false;
};

// ── Route Handlers ───────────────────────────────────────────────────────────

/**
 * Primary Recommendation Endpoint.
 * Powered by Walrus Memory Protocol: semantic recall across multi-tenant namespaces
 * (core, category, guardrails, session) synthesized into bespoke recommendations via Google Gemini.
 */
router.post('/', async (req, res) => {
  try {
    const { userId, contextualState, current_memory, watchlist_only, memories_enabled } = req.body;
    const requested_media_type = (req.body.requested_media_type || req.body.type || req.body.media_type || 'movie').toLowerCase();
    const isWatchlist = watchlist_only === true || watchlist_only === 'true';
    const isMemoriesEnabled = memories_enabled !== false && memories_enabled !== 'false';

    console.log(`\n[Recommend] ════════ Pure Walrus Protocol Request: ${userId} for ${requested_media_type} (Watchlist Mode: ${isWatchlist}, Memories: ${isMemoriesEnabled}) ════════`);
    
    const walrusRec = await walrusMemoryService.curateWithWalrusMemory({
      userId: isMemoriesEnabled ? userId : null,
      mediaType: requested_media_type,
      currentMemory: isMemoriesEnabled ? current_memory : (isWatchlist ? { watchlist: current_memory?.watchlist || [] } : {}),
      contextualState: isMemoriesEnabled ? contextualState : null,
      watchlistOnly: isWatchlist,
      memoriesEnabled: isMemoriesEnabled
    });

    if (!walrusRec) {
      return res.json({
        status: isWatchlist ? 'empty_watchlist' : 'empty',
        recommendations: []
      });
    }

    res.json({
      status: 'success',
      recommendations: [walrusRec]
    });
  } catch (error) {
    console.error('[Recommend Route Error]:', error);
    res.status(500).json({ error: 'Recommendation failed', details: error.message });
  }
});

/**
 * Lazy Pitch Generation Endpoint.
 * Generates an evocative, aesthetic pitch and blurb for a title anchored in the user's authentic Walrus memory.
 */
router.post('/pitch', async (req, res) => {
  try {
    const { userId, title, requested_media_type, memories_enabled } = req.body;
    const isMemoriesEnabled = memories_enabled !== false && memories_enabled !== 'false';
    console.log(`\n[Pitch] Generating Walrus-backed pitch for: "${title}" (${requested_media_type}) [Memories: ${isMemoriesEnabled}]`);

    let walrusMemories = [];
    if (userId && isMemoriesEnabled) {
      try {
        const normType = walrusMemoryService.normalizeCategory(requested_media_type || 'movie');
        const recallRes = await walrusMemoryService.recallForRecommendation(userId, normType, title);
        walrusMemories = recallRes.allMemories || [];
      } catch (e) {
        console.warn('[Pitch] Walrus recall warning:', e.message);
      }
    }

    const memoriesContext = (walrusMemories.length > 0 && isMemoriesEnabled)
      ? walrusMemories.map((m, i) => `${i + 1}. [${m.category || m.namespace}]: "${m.text || m.content || JSON.stringify(m)}"`).join('\n')
      : '';

    const prompt = (!isMemoriesEnabled)
      ? `
You are Coda. Memory personalization is currently turned OFF.
You have NO prior memories, taste profile, or knowledge of this user.
Write a compelling, objective 2-paragraph pitch and 1-line blurb for why someone should experience "${title}" (${requested_media_type || 'media'}).
Focus strictly on the work itself—its narrative craft, directing, pacing, cinematography, and themes. Do NOT say "you" or "based on your taste".

Return JSON strictly formatted as:
{
  "coda_blurb": "One punchy, poetic sentence capturing the essence of the work.",
  "pitch_paragraphs": [
    "Paragraph 1 establishing the tonal atmosphere, aesthetic conviction, and premise.",
    "Paragraph 2 exploring what makes the execution and storytelling notable."
  ]
}
`
      : `
You are Coda, an intimate, razor-sharp media curator.
Write an evocative, bespoke 2-paragraph pitch and 1-line blurb for why the user should experience "${title}" (${requested_media_type || 'media'}).
Connect it deeply to the user's authentic taste anchors recalled from Walrus Memory:
${memoriesContext || 'Open to profound, memorable storytelling.'}

Return JSON strictly formatted as:
{
  "coda_blurb": "One punchy, poetic sentence capturing why this exists for them right now.",
  "pitch_paragraphs": [
    "Paragraph 1 establishing the tonal atmosphere, aesthetic conviction, and emotional hook.",
    "Paragraph 2 explaining specifically why this speaks to their taste profile and what lingering feeling it leaves."
  ]
}
`;

    const { callGeminiChat } = require('../services/geminiClient');
    const geminiRes = await callGeminiChat({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' }
    });

    const parsed = JSON.parse(geminiRes.choices[0].message.content.trim());
    res.json({
      pitch_paragraphs: Array.isArray(parsed.pitch_paragraphs) ? parsed.pitch_paragraphs : [parsed.pitch_paragraphs].filter(Boolean),
      coda_blurb: parsed.coda_blurb || ''
    });
  } catch (error) {
    console.error('[Pitch Route Error]:', error);
    res.status(500).json({ error: 'Pitch generation failed', details: error.message });
  }
});

/**
 * Feedback Endpoint.
 * Ingests user feedback on a recommendation and persists guardrails to Walrus Protocol.
 */
router.post('/feedback', async (req, res) => {
  try {
    const { userId, current_memory, recommendation_title, media_type, feedback_reason } = req.body;

    let authoritativeMemory = current_memory || {};
    if (userId) {
      try {
        const freshSoul = await userSoulService.getUserMemory(userId);
        authoritativeMemory = {
          ...(freshSoul.permanent_soul || {}),
          ...(freshSoul.transient_memory || {}),
        };
        console.log(`[Feedback Engine] Synchronizing feedback with memory for user ${userId}`);
      } catch (e) {
        console.warn('[Feedback Engine] Memory fetch warning:', e.message);
      }
    }

    const updates = await llmService.refineTasteFromFeedback(
      authoritativeMemory, recommendation_title, media_type, feedback_reason
    );

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

    // Persist directly to Walrus Protocol guardrails namespace
    let savedMemoryStr = `Avoided: "${recommendation_title}" (${feedback_reason})`;
    if (userId && recommendation_title && feedback_reason) {
      try {
        const walrusRes = await walrusMemoryService.rememberFeedbackGuardrail(userId, recommendation_title, media_type, feedback_reason);
        if (walrusRes?.savedMemory) savedMemoryStr = walrusRes.savedMemory;
        console.log(`[Feedback Engine] Persisted guardrail to Walrus for user ${userId}: "${savedMemoryStr}"`);
      } catch (err) {
        console.warn('[Feedback Engine] Walrus guardrail save warning:', err.message);
      }
    }

    res.json({
      ...(updates || {}),
      saved_memory: savedMemoryStr
    });
  } catch (error) {
    console.error('[Feedback Error]:', error);
    res.status(500).json({ error: 'Feedback failed' });
  }
});

/**
 * Swipe Action Endpoint.
 * Ingests user swipes ('loved', 'not_for_me', 'seen') and persists directly to Walrus Protocol.
 */
router.post('/swipe', async (req, res) => {
  try {
    const { userId, title, action } = req.body;
    
    if (!userId || !title || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const soul = await userSoulService.getUserMemory(userId);
    const livingMemoryJson = {
      ...(soul.permanent_soul || {}),
      ...(soul.transient_memory || {})
    };

    let savedMemoryStr = '';

    if (action === 'loved') {
      livingMemoryJson.loved_titles = livingMemoryJson.loved_titles || [];
      if (!livingMemoryJson.loved_titles.includes(title)) {
        livingMemoryJson.loved_titles.push(title);
      }

      livingMemoryJson.globalIdentity = livingMemoryJson.globalIdentity || [];
      const entry = `Highly values: ${title} (loved work)`;
      if (!livingMemoryJson.globalIdentity.includes(entry)) {
        livingMemoryJson.globalIdentity.push(entry);
      }
      livingMemoryJson.seen = livingMemoryJson.seen || [];
      if (!livingMemoryJson.seen.includes(title)) {
        livingMemoryJson.seen.push(title);
      }

      await userSoulService.syncLivingMemory(userId, livingMemoryJson);

      // Persist directly to Walrus Protocol
      try {
        const mediaType = req.body.media_type || req.body.mediaType || 'movie';
        const walrusRes = await walrusMemoryService.rememberLovedTitle(userId, title, mediaType);
        if (walrusRes?.savedMemory) savedMemoryStr = walrusRes.savedMemory;
      } catch (err) {
        console.warn('[Swipe Engine] Walrus loved memory error:', err.message);
      }
    } else if (action === 'not_for_me') {
      livingMemoryJson.notForMe = livingMemoryJson.notForMe || [];
      if (!livingMemoryJson.notForMe.includes(title)) {
        livingMemoryJson.notForMe.push(title);
      }
      await userSoulService.syncLivingMemory(userId, livingMemoryJson);

      try {
        const mediaType = req.body.media_type || req.body.mediaType || 'movie';
        const walrusRes = await walrusMemoryService.rememberFeedbackGuardrail(userId, title, mediaType, 'Not for me');
        if (walrusRes?.savedMemory) savedMemoryStr = walrusRes.savedMemory;
      } catch (err) {
        console.warn('[Swipe Engine] Walrus not_for_me error:', err.message);
      }
    } else if (action === 'seen') {
      livingMemoryJson.seen = livingMemoryJson.seen || [];
      if (!livingMemoryJson.seen.includes(title)) {
        livingMemoryJson.seen.push(title);
      }
      await userSoulService.syncLivingMemory(userId, livingMemoryJson);

      try {
        const walrusRes = await walrusMemoryService.rememberSeenTitle(userId, title);
        if (walrusRes?.savedMemory) savedMemoryStr = walrusRes.savedMemory;
      } catch (err) {
        console.warn('[Swipe Engine] Walrus seen error:', err.message);
      }
    } else {
      return res.status(400).json({ error: 'Invalid action parameter' });
    }
    
    console.log(`[Swipe Engine] Processed '${action}' for ${title} (User: ${userId}, Walrus: "${savedMemoryStr}")`);
    res.json({ status: 'success', action, title, saved_memory: savedMemoryStr });
  } catch (error) {
    console.error('[Swipe Error]:', error);
    res.status(500).json({ error: 'Swipe processing failed' });
  }
});

/**
 * Recommendation Discussion Chat Endpoint.
 * Recalls authentic Walrus Protocol memories for the title and chat context.
 * Employs a strict server-side firewall to prevent exploratory questions from creating false-positive memory saves.
 */
router.post('/chat', async (req, res) => {
  try {
    const { userId, current_memory, title, media_type, coda_blurb, pitch_paragraphs, chat_history, user_message, memories_enabled } = req.body;
    const isMemoriesEnabled = memories_enabled !== false && memories_enabled !== 'false';
    
    let walrusMemories = [];
    let recalledMemoryStr = null;
    let chatRecallQuery = null;
    if (userId && isMemoriesEnabled) {
      try {
        const normType = walrusMemoryService.normalizeCategory(media_type || 'movie');
        const isWhyQuestion = /why\s+(?:did\s+you|would\s+i|do\s+you\s+think|pick|recommend)/i.test(user_message || '');
        chatRecallQuery = isWhyQuestion
          ? `"${title}" ${coda_blurb || ''} themes aesthetics why user loves this`
          : `"${title}" ${user_message}`;

        const [catHits, coreHits, guardHits] = await Promise.all([
          walrusMemoryService.recallMemories({
            query: chatRecallQuery,
            namespace: walrusMemoryService.formatNamespace(userId, normType),
            limit: 4,
            maxDistance: 0.82
          }).catch(() => []),
          walrusMemoryService.recallMemories({
            query: isWhyQuestion ? `${coda_blurb || ''} intellectual storytelling` : user_message,
            namespace: walrusMemoryService.formatNamespace(userId, 'core'),
            limit: 3,
            maxDistance: 0.82
          }).catch(() => []),
          walrusMemoryService.recallMemories({
            query: user_message,
            namespace: walrusMemoryService.formatNamespace(userId, 'guardrails'),
            limit: 2,
            maxDistance: 0.88
          }).catch(() => [])
        ]);
        walrusMemories = [...catHits, ...coreHits, ...guardHits].map(m => ({
          ...m,
          blob_id: m.blob_id || m.blobId || null,
          namespace: m.namespace || walrusMemoryService.formatNamespace(userId, normType),
          category: m.category || (m.namespace && m.namespace.includes('guardrails') ? 'Guardrail Protocol' : m.namespace && m.namespace.includes('core') ? 'Core Emotional DNA' : `${normType.toUpperCase()} Taste Anchor`),
        }));
        if (walrusMemories.length > 0) {
          recalledMemoryStr = walrusMemories[0].text || walrusMemories[0].content || null;
        }
      } catch (err) {
        console.warn('[Chat Engine] Walrus recall warning:', err.message);
      }
    }

    const response = await llmService.discussRecommendation(
      isMemoriesEnabled ? (current_memory || {}) : {}, title, media_type, coda_blurb || "",
      pitch_paragraphs || [], chat_history || [], user_message, isMemoriesEnabled ? walrusMemories : []
    );

    let savedMemoryStr = null;
    let chatWalrusWrites = [];

    // Strict Server-Side Firewall: Exploratory or curious questions must NEVER write to memory
    const isExploratory = /^(?:why|what|who|when|where|how|is\s+it|is\s+this|tell\s+me|can\s+you)\b/i.test((user_message || '').trim()) && 
                          !/(?:i\s+(?:love|like|hate|dislike|finished|watched|saw)|my\s+favorite)/i.test(user_message || '');
    if ((isExploratory || !isMemoriesEnabled) && response.memory_updates) {
      response.memory_updates = {
        global_identity_appends: [],
        category_appends: {},
        guardrails_appends: [],
        media_reflections_appends: [],
        seen_appends: [],
        not_for_me_appends: []
      };
    }

    if (userId && isMemoriesEnabled && response.memory_updates) {
      const updates = response.memory_updates;
      
      // Save directly to Walrus Protocol
      try {
        const walrusWrites = await walrusMemoryService.routeAndSaveLivingMemory(userId, updates);
        chatWalrusWrites = walrusWrites || [];
        if (walrusWrites && walrusWrites.length > 0) {
          savedMemoryStr = walrusWrites[0].text ||
                           updates.guardrails_appends?.[0] || 
                           (updates.category_appends ? Object.values(updates.category_appends).flat()[0] : null) ||
                           updates.global_identity_appends?.[0];
        }
      } catch (err) {
        console.warn('[Chat Engine] Walrus save warning:', err.message);
      }

      if (current_memory) {
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
        
        await userSoulService.syncLivingMemory(userId, current_memory);
      }
    }

    res.json({
      message: response.message,
      one_line_summary: response.one_line_summary,
      memory_updates: isMemoriesEnabled ? response.memory_updates : null,
      saved_memory: isMemoriesEnabled ? savedMemoryStr : null,
      recalled_memory: isMemoriesEnabled ? recalledMemoryStr : null,
      recalled_memories: isMemoriesEnabled ? walrusMemories : [],
      walrus_writes: isMemoriesEnabled ? chatWalrusWrites : [],
      query_used: isMemoriesEnabled ? chatRecallQuery : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Chat failed' });
  }
});

/**
 * Ask Coda Conversational Curation Endpoint.
 * Recalls memories from Walrus Protocol and curates matches or recommendations via Google Gemini.
 */
router.post('/ask', async (req, res) => {
  try {
    const { current_memory, chat_history, user_message, userId, contextualState, watchlist_only, memories_enabled } = req.body;
    const isMemoriesEnabled = memories_enabled !== false && memories_enabled !== 'false';
    const isWatchlist = watchlist_only === true || watchlist_only === 'true';

    let walrusMemories = [];
    let askRecalledMemory = null;
    if (userId && isMemoriesEnabled) {
      try {
        const [coreMem, sessionMem] = await Promise.all([
          walrusMemoryService.recallMemories({
            query: user_message,
            namespace: walrusMemoryService.formatNamespace(userId, 'core'),
            limit: 3,
            maxDistance: 0.82
          }).catch(() => []),
          walrusMemoryService.recallMemories({
            query: user_message,
            namespace: walrusMemoryService.formatNamespace(userId, 'session'),
            limit: 2,
            maxDistance: 0.82
          }).catch(() => [])
        ]);
        walrusMemories = [...coreMem, ...sessionMem].map(m => ({
          ...m,
          blob_id: m.blob_id || m.blobId || null,
          namespace: m.namespace || walrusMemoryService.formatNamespace(userId, 'core'),
          category: (m.namespace && m.namespace.includes('session')) ? 'Active Craving' : 'Core Emotional DNA',
        }));
        if (walrusMemories.length > 0) {
          askRecalledMemory = walrusMemories[0].text || walrusMemories[0].content || null;
        }
      } catch (err) {
        console.warn('[Ask Engine] Walrus recall warning:', err.message);
      }
    }

    const parsed = await llmService.handleAskChat(
      isMemoriesEnabled ? (current_memory || {}) : {},
      chat_history || [],
      user_message,
      isWatchlist,
      isMemoriesEnabled ? walrusMemories : []
    );

    let savedMemoryStr = null;
    let askWalrusWrites = [];

    // Strict Server-Side Firewall: Exploratory or recommendation questions must NEVER write to memory
    const isAskExploratory = /^(?:why|what|who|when|where|how|is\s+it|is\s+this|tell\s+me|can\s+you|recommend)\b/i.test((user_message || '').trim()) && 
                             !/(?:i\s+(?:love|like|hate|dislike|finished|watched|saw)|my\s+favorite)/i.test(user_message || '');
    if ((isAskExploratory || !isMemoriesEnabled) && parsed.memory_updates) {
      parsed.memory_updates = {
        guardrails_appends: [],
        category_appends: {},
        global_identity_appends: []
      };
    }

    if (userId && isMemoriesEnabled && parsed.memory_updates) {
      try {
        const walrusWrites = await walrusMemoryService.routeAndSaveLivingMemory(userId, parsed.memory_updates);
        askWalrusWrites = walrusWrites || [];
        if (walrusWrites && walrusWrites.length > 0) {
          savedMemoryStr = walrusWrites[0].text ||
                           parsed.memory_updates.guardrails_appends?.[0] || 
                           (parsed.memory_updates.category_appends ? Object.values(parsed.memory_updates.category_appends).flat()[0] : null) ||
                           parsed.memory_updates.global_identity_appends?.[0];
        }
      } catch (err) {
        console.warn('[Ask Engine] Walrus save warning:', err.message);
      }
    }

    if (parsed.status === 'success' && parsed.media_type) {
      console.log(`[Ask Engine] Pure Walrus Curation for "${parsed.media_type}": "${parsed.recommendation_query}"`);
      const walrusRec = await walrusMemoryService.curateWithWalrusMemory({
        userId: isMemoriesEnabled ? userId : null,
        mediaType: parsed.media_type,
        currentMemory: isMemoriesEnabled ? current_memory : (isWatchlist ? { watchlist: current_memory?.watchlist || [] } : {}),
        contextualState: isMemoriesEnabled ? contextualState : null,
        specificAsk: parsed.recommendation_query,
        watchlistOnly: isWatchlist,
        memoriesEnabled: isMemoriesEnabled
      });

      if (userId && parsed.recommendation_query && isMemoriesEnabled) {
        const sessionWrite = await walrusMemoryService.rememberFact(
          `[Active Mood & Situational Craving] Recent Ask Coda request: "${parsed.recommendation_query}"`,
          walrusMemoryService.formatNamespace(userId, 'session'),
          2,
          'Active Craving'
        ).catch(() => null);
        if (sessionWrite) askWalrusWrites.push(sessionWrite);
      }

      return res.json({
        status: 'success',
        message: parsed.message,
        recommendation: walrusRec,
        recalled_memory: isMemoriesEnabled ? (walrusRec?.attributed_memory || askRecalledMemory) : null,
        recalled_memories: isMemoriesEnabled ? (walrusRec?.recalled_memories || walrusMemories) : [],
        walrus_writes: isMemoriesEnabled ? askWalrusWrites : [],
        query_used: isMemoriesEnabled ? (walrusRec?.query_used || user_message) : null,
        saved_memory: isMemoriesEnabled ? (savedMemoryStr || (parsed.recommendation_query ? `Saved session request: "${parsed.recommendation_query}"` : null)) : null
      });
    }

    if (parsed.status === 'match' && parsed.match_target) {
      const matchTarget = parsed.match_target;
      let allMemories = [];
      if (userId && isMemoriesEnabled) {
        const recall = await walrusMemoryService.recallForRecommendation(userId, 'movie', matchTarget, contextualState);
        allMemories = recall.allMemories || [];
      }
      const memContext = allMemories.map(m => m.text).join('\n');
      
      const evalPrompt = (!isMemoriesEnabled)
        ? `
You are Coda. Memory personalization is currently turned OFF.
The user asks if "${matchTarget}" is worth watching.
Evaluate objectively based purely on cinematic acclaim, pacing, and premise.
Return JSON:
{
  "is_match": true,
  "conviction_statement": "1-2 punchy sentences in Coda's voice evaluating this work objectively."
}
`
        : `
You are Coda. The user asks if "${matchTarget}" is for them.
User's authentic memories from Walrus Protocol:
${memContext || 'Open to compelling artistic works.'}

Evaluate whether they would love "${matchTarget}".
Return JSON:
{
  "is_match": true,
  "conviction_statement": "1-2 punchy sentences in Coda's voice explaining why this work fits their taste or why to skip it."
}
`;
      const { callGeminiChat } = require('../services/geminiClient');
      const evalRes = await callGeminiChat({
        messages: [{ role: 'user', content: evalPrompt }],
        responseFormat: { type: 'json_object' }
      });
      const evalData = JSON.parse(evalRes.choices[0].message.content.trim());

      const walrusRec = await walrusMemoryService.curateWithWalrusMemory({
        userId: isMemoriesEnabled ? userId : null,
        mediaType: 'movie',
        currentMemory: isMemoriesEnabled ? current_memory : (isWatchlist ? { watchlist: current_memory?.watchlist || [] } : {}),
        contextualState: isMemoriesEnabled ? contextualState : null,
        specificAsk: matchTarget,
        watchlistOnly: isWatchlist,
        memoriesEnabled: isMemoriesEnabled
      });

      return res.json({
        status: 'match',
        message: evalData.conviction_statement,
        is_match: evalData.is_match,
        recommendation: walrusRec,
        recalled_memory: isMemoriesEnabled ? (allMemories[0]?.text || askRecalledMemory) : null,
        recalled_memories: isMemoriesEnabled ? (walrusRec?.recalled_memories || allMemories) : [],
        walrus_writes: isMemoriesEnabled ? askWalrusWrites : [],
        query_used: isMemoriesEnabled ? (walrusRec?.query_used || matchTarget) : null,
        saved_memory: isMemoriesEnabled ? savedMemoryStr : null
      });
    }

    res.json({
      status: 'chatting',
      message: parsed.message,
      recommendation: null,
      recalled_memory: isMemoriesEnabled ? askRecalledMemory : null,
      recalled_memories: isMemoriesEnabled ? walrusMemories : [],
      walrus_writes: isMemoriesEnabled ? askWalrusWrites : [],
      query_used: isMemoriesEnabled ? user_message : null,
      saved_memory: isMemoriesEnabled ? savedMemoryStr : null
    });
  } catch (error) {
    console.error('[Ask Route Error]:', error);
    res.status(500).json({ error: 'Ask chat failed' });
  }
});

/**
 * Live Walrus Protocol Inspector Endpoint.
 * Returns actual live recorded blobs, resolved blob_ids, pending job_ids, and real user namespaces
 * directly from the Walrus Protocol relayer (https://relayer.memory.walrus.xyz).
 */
router.post('/walrus-live', async (req, res) => {
  try {
    const { userId, jobIds, query, category } = req.body || {};
    const liveData = await walrusMemoryService.inspectLiveWalrus({
      userId,
      jobIds: Array.isArray(jobIds) ? jobIds : [],
      query,
      category,
    });
    res.json(liveData);
  } catch (error) {
    console.error('[Walrus Live Inspect Error]:', error);
    res.status(500).json({ error: 'Failed to inspect live Walrus state', details: error.message });
  }
});

router.get('/walrus-live', async (req, res) => {
  try {
    const { userId, query, category } = req.query || {};
    const liveData = await walrusMemoryService.inspectLiveWalrus({
      userId,
      jobIds: [],
      query,
      category,
    });
    res.json(liveData);
  } catch (error) {
    console.error('[Walrus Live Inspect Error]:', error);
    res.status(500).json({ error: 'Failed to inspect live Walrus state', details: error.message });
  }
});

/**
 * Vibe Check Endpoint.
 * Evaluates whether a title fits the user's authentic taste anchors recalled from Walrus Protocol.
 */
router.post('/vibe-check', async (req, res) => {
  try {
    const { title, userId, media_type } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    console.log(`[Vibe Check] Evaluating "${title}" against Walrus memory for user: ${userId || 'anon'}`);
    
    let walrusMemories = [];
    if (userId) {
      try {
        const normType = walrusMemoryService.normalizeCategory(media_type || 'movie');
        const recallRes = await walrusMemoryService.recallForRecommendation(userId, normType, title);
        walrusMemories = recallRes.allMemories || [];
      } catch (e) {
        console.warn('[Vibe Check] Walrus recall warning:', e.message);
      }
    }

    const memoriesContext = walrusMemories.length > 0
      ? walrusMemories.map((m, i) => `${i + 1}. [${m.category || m.namespace}]: "${m.text || m.content || JSON.stringify(m)}"`).join('\n')
      : 'Open to rich, compelling storytelling.';

    const evalPrompt = `
You are Coda, an intimate, razor-sharp media curator.
The user wants a "vibe check" on the title: "${title}".
User's authentic decentralized memories from Walrus Protocol:
${memoriesContext}

Evaluate whether this work matches their personal taste, aesthetic inclinations, and pacing preferences.
Return JSON:
{
  "is_match": true,
  "conviction_statement": "1-2 punchy sentences in Coda's voice with sharp aesthetic conviction explaining why this work fits their taste or why they should skip it."
}
`;

    const { callGeminiChat } = require('../services/geminiClient');
    const geminiRes = await callGeminiChat({
      messages: [{ role: 'user', content: evalPrompt }],
      responseFormat: { type: 'json_object' },
      temperature: 0.2
    });

    const evalData = JSON.parse(geminiRes.choices[0].message.content.trim());
    res.json({
      is_match: evalData.is_match,
      conviction_statement: evalData.conviction_statement
    });
  } catch (error) {
    console.error('[Vibe Check Error]:', error);
    res.status(500).json({ error: 'Vibe check failed', details: error.message });
  }
});

/**
 * Promote Media Endpoint.
 * Promotes a title to the user's primary recommendation, curating rich assets and pitch via Walrus Protocol.
 */
router.post('/promote', async (req, res) => {
  try {
    const { title, userId, current_memory, media_type } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const type = (media_type || req.body.requested_media_type || 'movie').toLowerCase();
    console.log(`[Promote] Curating promoted title "${title}" (${type}) via Walrus Protocol for user: ${userId || 'anon'}`);

    const walrusRec = await walrusMemoryService.curateWithWalrusMemory({
      userId,
      mediaType: type,
      currentMemory: current_memory,
      specificAsk: title
    });

    res.json({
      status: 'success',
      recommendation: walrusRec
    });
  } catch (error) {
    console.error('[Promote Error]:', error);
    res.status(500).json({ error: 'Promote failed', details: error.message });
  }
});

module.exports = router;
