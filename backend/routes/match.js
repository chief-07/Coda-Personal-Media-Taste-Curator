const express = require('express');
const router = express.Router();
const mediaBrainService = require('../services/mediaBrainService');
const userSoulService = require('../services/userSoulService');
const llmService = require('../services/llmService');

router.post('/', async (req, res) => {
  try {
    const { userId, title, media_type } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: "Missing userId or title." });
    }

    console.log(`[Match Route] User ${userId} requested match analysis for: ${title}`);

    // 1. Fetch User Soul
    const userSoul = await userSoulService.getUserMemory(userId);
    const permanentSoul = userSoul.permanent_soul;

    // 2. Fetch Media Soul
    const mediaSoul = await mediaBrainService.getMediaSoulByTitle(title, media_type);
    
    if (!mediaSoul) {
      return res.status(404).json({ error: `Could not find or enrich profile for ${title}.` });
    }

    // 3. LLM Match Analysis
    const prompt = `
You are Coda, a deeply perceptive, emotionally intelligent media curator.
A user has asked you: "Would I like ${title}?"
You need to analyze the media's "soul" against the user's permanent "soul".

USER'S PERMANENT SOUL (Tastes, Themes, Guardrails):
${JSON.stringify(permanentSoul.soul_graph || permanentSoul, null, 2)}
User's explicit media reflections:
${JSON.stringify(permanentSoul.media_reflections || [])}

MEDIA SOUL (${title}):
${mediaSoul.semantic_description || JSON.stringify(mediaSoul)}

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
