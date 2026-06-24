const crypto = require('crypto');
const qdrantService = require('./qdrantService');
const embeddingService = require('./embeddingService');
const llmService = require('./llmService');

/**
 * Service to manage the User Soul (Two-Tier Memory).
 */
class UserSoulService {
  /**
   * Helper to generate a consistent UUID for a given userId.
   */
  generateUserUuid(userId) {
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      hash.substring(12, 16),
      hash.substring(16, 20),
      hash.substring(20, 32)
    ].join('-');
  }

  /**
   * Fetches the user's full two-tier memory payload.
   */
  async getUserMemory(userId) {
    const uuid = this.generateUserUuid(userId);
    
    const [soulPoint, memoryPoint] = await Promise.all([
      qdrantService.getPoint('user_souls', uuid),
      qdrantService.getPoint('user_memory', uuid)
    ]);

    return {
      userId,
      permanent_soul: soulPoint ? soulPoint.payload : null,
      transient_memory: memoryPoint ? memoryPoint.payload : null,
    };
  }

  /**
   * Updates the Permanent Soul Identity.
   * Uses the structured Soul Graph float weights to build the embedding text.
   * Stores soul_graph as a proper structured Qdrant payload field.
   */
  async updatePermanentSoul(userId, livingMemoryJson) {
    const uuid = this.generateUserUuid(userId);
    
    // ── FAIL 1+2+3 FIX: Use soul_graph float weights to build embedding text ──
    let fullSoulText = '';
    const sg = livingMemoryJson.soul_graph || null;

    if (sg) {
      const parts = [];
      if (sg.demographics?.stage_in_life) {
        parts.push(`Life stage: ${sg.demographics.stage_in_life}`);
      }
      if (sg.demographics?.struggles?.length > 0) {
        parts.push(`Core struggles: ${sg.demographics.struggles.join(', ')}`);
      }
      if (sg.emotional_resonances) {
        const sorted = Object.entries(sg.emotional_resonances).sort((a, b) => b[1] - a[1]);
        parts.push(`Emotional resonances: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
      }
      if (sg.aesthetic_affinities) {
        const sorted = Object.entries(sg.aesthetic_affinities).sort((a, b) => b[1] - a[1]);
        parts.push(`Aesthetic affinities: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
      }
      if (sg.creative_anchors) {
        for (const [type, anchors] of Object.entries(sg.creative_anchors)) {
          if (anchors && typeof anchors === 'object') {
            const sorted = Object.entries(anchors).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) {
              parts.push(`${type}: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
            }
          }
        }
      }
      if (sg.themes) {
        const sorted = Object.entries(sg.themes).sort((a, b) => b[1] - a[1]);
        parts.push(`Themes: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
      }
      if (sg.tropes) {
        const sorted = Object.entries(sg.tropes).sort((a, b) => b[1] - a[1]);
        parts.push(`Tropes: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
      }
      if (sg.pacing_preference) {
        const sorted = Object.entries(sg.pacing_preference).sort((a, b) => b[1] - a[1]);
        parts.push(`Pacing: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
      }
      if (sg.guardrails?.length > 0) {
        parts.push(`Guardrails: ${sg.guardrails.join(', ')}`);
      }
      // Append media reflections for extra personal grounding
      if (livingMemoryJson.media_reflections?.length > 0) {
        parts.push(`Personal media reflections: ${livingMemoryJson.media_reflections.join('. ')}`);
      }
      fullSoulText = parts.join('\n');
      console.log(`[Soul Mapping] Using structured Soul Graph for embedding (${parts.length} dimensions)`);
    } else {
      // Fallback: old text-based approach for users without a soul graph yet
      const globalIdentity = (livingMemoryJson.globalIdentity || []).join('. ');
      let categoryTastes = '';
      const profiles = livingMemoryJson.categoryProfiles || {};
      for (const [cat, tastes] of Object.entries(profiles)) {
        if (tastes && tastes.length > 0) {
          categoryTastes += `\n${cat}: ${tastes.join('. ')}`;
        }
      }
      let personalReflections = '';
      if (livingMemoryJson.media_reflections?.length > 0) {
        personalReflections = `\nPersonal Media Reflections:\n- ` + livingMemoryJson.media_reflections.join('\n- ');
      }
      fullSoulText = `Core Identity: ${globalIdentity}\nCategory Tastes: ${categoryTastes}${personalReflections}`;
      console.log(`[Soul Mapping] No Soul Graph yet — using text-based fallback for embedding`);
    }

    // Generate the base text vector
    const textVector = await embeddingService.embed(fullSoulText);

    // ── Centroid Calculation from Loved Media vectors ──
    let finalVector = textVector;
    
    let lovedTitles = [];
    try {
      const llmService = require('./llmService');
      if (llmService.extractLovedTitles) {
        lovedTitles = llmService.extractLovedTitles(livingMemoryJson);
      }
    } catch(e) {}

    if (lovedTitles.length > 0) {
      console.log(`[Soul Mapping] Calculating centroid for Loved Media:`, lovedTitles);
      const mediaVectors = [];
      const missingTitles = [];

      for (const title of lovedTitles) {
        try {
          const res = await qdrantService.client.scroll('media_brain', {
            filter: {
              must: [{ key: 'title', match: { value: title } }]
            },
            with_vector: true,
            limit: 1
          });
          if (res.points && res.points.length > 0 && res.points[0].vector) {
            mediaVectors.push(res.points[0].vector);
          } else {
            missingTitles.push(title);
          }
        } catch(e) {
          console.warn(`[Soul Mapping] Failed to fetch vector for ${title}`);
          missingTitles.push(title);
        }
      }

      // ── FAIL 4 FIX: Immediately trigger enrichment for missing loved titles ──
      if (missingTitles.length > 0) {
        console.log(`[Soul Mapping] ${missingTitles.length} loved titles missing from Media Brain — triggering immediate enrichment:`, missingTitles);
        try {
          const mediaEnrichmentService = require('./mediaEnrichmentService');
          for (const title of missingTitles) {
            // Determine media type from soul_graph or category profiles
            let mediaType = 'movie'; // safe default
            if (livingMemoryJson.categoryProfiles) {
              if (livingMemoryJson.categoryProfiles.anime?.some(t => t.toLowerCase().includes(title.toLowerCase()))) mediaType = 'anime';
              else if (livingMemoryJson.categoryProfiles.visual_novels?.length > 0) mediaType = 'visual novel';
            }
            mediaEnrichmentService.enrichSingleTitle(title, mediaType).catch(err => {
              console.warn(`[Soul Mapping] Enrichment failed for ${title}:`, err.message);
            });
          }
        } catch (e) {
          console.warn(`[Soul Mapping] Could not trigger enrichment for missing titles:`, e.message);
        }
      }

      if (mediaVectors.length > 0) {
        const centroid = new Array(1536).fill(0);
        for (const vec of mediaVectors) {
          for (let i = 0; i < 1536; i++) {
            centroid[i] += vec[i];
          }
        }
        for (let i = 0; i < 1536; i++) {
          centroid[i] /= mediaVectors.length;
        }
        finalVector = new Array(1536);
        for (let i = 0; i < 1536; i++) {
          finalVector[i] = (textVector[i] + centroid[i]) / 2.0;
        }
        console.log(`[Soul Mapping] Blended text persona with ${mediaVectors.length} media vectors (${missingTitles.length} titles still enriching).`);
      }

      // ── TRIGGER AUTONOMOUS MYCELIUM CRAWL ──
      try {
        const mediaEnrichmentService = require('./mediaEnrichmentService');
        for (const title of lovedTitles) {
          // Determine correct media type from soul_graph / categoryProfiles
          let mediaType = 'movie';
          if (sg?.creative_anchors?.studios && Object.keys(sg.creative_anchors.studios).some(s => ['shaft', 'kyoani', 'mappa', 'bones', 'ufotable'].includes(s.toLowerCase()))) {
            mediaType = 'anime';
          }
          if (livingMemoryJson.categoryProfiles?.anime?.length > 0) mediaType = 'anime';
          console.log(`[Soul Mapping] Triggering Mycelium Crawl for loved work: ${title} (${mediaType})`);
          mediaEnrichmentService.enrichTitleAndNeighbors(title, mediaType).catch(err => {
            console.warn(`[Soul Mapping] Async crawl failed for ${title}:`, err.message);
          });
        }
      } catch (e) {
        console.warn(`[Soul Mapping] Failed to trigger Mycelium crawl:`, e.message);
      }
    }

    // ── FAIL 2 FIX: Store soul_graph as structured Qdrant payload (NOT stringified) ──
    await qdrantService.upsert('user_souls', uuid, finalVector, {
      userId,
      globalIdentity: livingMemoryJson.globalIdentity || [],
      categoryProfiles: livingMemoryJson.categoryProfiles || {},
      guardrails: livingMemoryJson.guardrails || [],
      media_reflections: livingMemoryJson.media_reflections || [],
      soul_graph: sg,   // ← stored as a proper structured JSON object
      updatedAt: new Date().toISOString()
    });

    return true;
  }


  /**
   * Updates the Transient Session Memory.
   * Keeps track of the rolling active context and explicitly seen/rejected lists.
   */
  async updateTransientMemory(userId, livingMemoryJson) {
    const uuid = this.generateUserUuid(userId);

    const recentContext = livingMemoryJson.recentContext || '';
    const activeText = `Recent Craving/Context: ${recentContext}`;

    // Generate vector for the transient craving
    const vector = await embeddingService.embed(activeText);

    await qdrantService.upsert('user_memory', uuid, vector, {
      userId,
      recentContext: recentContext,
      contextualState: livingMemoryJson.contextualState || null,
      seen: livingMemoryJson.seen || [],
      notForMe: livingMemoryJson.notForMe || [],
      watchlist: livingMemoryJson.watchlist || [],
      updatedAt: new Date().toISOString()
    });

    return true;
  }

  /**
   * Called to synchronize both tiers, typically after Onboarding or a chat session.
   */
  async syncLivingMemory(userId, livingMemoryJson) {
    await Promise.all([
      this.updatePermanentSoul(userId, livingMemoryJson),
      this.updateTransientMemory(userId, livingMemoryJson)
    ]);
  }
}

module.exports = new UserSoulService();
