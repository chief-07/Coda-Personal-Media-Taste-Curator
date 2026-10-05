const express = require('express');
const router = express.Router();
const llmService = require('../services/llmService');

router.post('/', async (req, res) => {
  try {
    const { userId, title, media_type } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: "Missing userId or title." });
    }

    console.log(`[Match Route] User ${userId} requested match analysis for: ${title}`);

    // 1. Fetch Walrus Memories for this title & category
    const walrusMemoryService = require('../services/walrusMemoryService');
    const { allMemories } = await walrusMemoryService.recallForRecommendation(userId, media_type || 'movie', title);
    const walrusContext = allMemories.map(m => `- [${m.category || m.namespace}]: ${m.text}`).join('\n');

    // 2. Fetch Media info via mediaService/OMDB/AniList
    const mediaService = require('../services/mediaService');
    let mediaInfo = { description: '' };
    try {
      mediaInfo = await mediaService.fetchAssets(title, media_type || 'movie');
    } catch (_) {}

    // 3. LLM Match Analysis
    const prompt = `
You are Coda, a deeply perceptive, emotionally intelligent media curator.
A user has asked you: "Would I like ${title}?"
You need to analyze the media against the user's decentralized memory stored on Walrus Protocol.

USER'S AUTHENTIC WALRUS MEMORIES:
${walrusContext || 'Prefers rich storytelling, authentic pacing, and thoughtful characters.'}

MEDIA (${title}):
Description: ${mediaInfo.description || title}
Category: ${media_type || 'movie'}


INSTRUCTIONS:
You must provide a brutal, honest, visceral analysis. Do they match? Where is the friction?
CRITICAL: If the media contains things the user has placed in their 'guardrails', YOU MUST FLAG IT LOUDLY.

Return a JSON object with the following exact keys:
- "match_score": A number from 0 to 100.
- "match_verdict": A short 2-4 word verdict (e.g. "Strong Match", "Hard Pass").
- "what_you_will_love": A short, raw paragraph on what specific facets of this media perfectly align with their soul.
- "potential_friction": Honest warnings about aspects that might not land.
- "guardrail_flags": A list of strings. If it violates their guardrails, describe how. If none, return an empty array [].
- "coda_verdict": A short paragraph written in your distinctive Coda voice (visceral, perceptive, emotional) giving your final opinion. Do not use AI buzzwords.
    `;

    const matchAnalysis = await llmService.structuredCompletion([
      { role: "system", content: "You are a JSON-only API. You must return exactly the requested JSON structure." },
      { role: "user", content: prompt }
    ]);

    res.json(matchAnalysis);

  } catch (error) {
    console.error('[Match Route] Error in match route:', error);
    res.status(500).json({ error: "Internal server error during match analysis." });
  }
});

module.exports = router;
