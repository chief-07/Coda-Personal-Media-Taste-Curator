const express = require('express');
const router = express.Router();
const mediaBrainService = require('../services/mediaBrainService');
const userSoulService = require('../services/userSoulService');
const llmService = require('../services/llmService');
const qdrantService = require('../services/qdrantService');
const embeddingService = require('../services/embeddingService');

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

    // 2. Fetch Media Soul and Vector
    let pointInfo = await qdrantService.getVectorAndPayloadByTitle('media_brain', title);
    if (!pointInfo) {
      console.log(`[Match Route] "${title}" not found in brain. Triggering enrichment...`);
      await mediaBrainService.getMediaSoulByTitle(title, media_type);
      pointInfo = await qdrantService.getVectorAndPayloadByTitle('media_brain', title);
    }

    const mediaSoul = pointInfo ? pointInfo.payload : await mediaBrainService.getMediaSoulByTitle(title, media_type);
    
    if (!mediaSoul) {
      return res.status(404).json({ error: `Could not find or enrich profile for ${title}.` });
    }

    // 2.1 Calculate Cosine Similarity for Vector guidance
    let vectorGuidance = "";
    if (userSoul.soul_vector && pointInfo && pointInfo.vector) {
      const similarity = embeddingService.calculateCosineSimilarity(userSoul.soul_vector, pointInfo.vector);
      if (similarity !== null) {
        vectorGuidance = `
MATHEMATICAL TASTE SPACE CHECK (FENCE):
- Cosine Similarity Score: ${similarity.toFixed(4)}
(Guidance Context: This represents the mathematical similarity between the user's permanent taste center—their soul text + loved centroid—and this media in vector space. A score >= 0.75 indicates the media is mathematically close to their taste cluster. A score <= 0.70 indicates it is distant or outside their core taste sphere. Use this score to ground your verdict.)
`;
      }
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
${vectorGuidance}
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
