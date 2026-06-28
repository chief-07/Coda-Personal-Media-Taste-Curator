const crypto = require('crypto');
const qdrantService = require('./qdrantService');
const embeddingService = require('./embeddingService');
const llmService = require('./llmService');

const centroidCache = {
  key: '',
  vector: null
};

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
      soul_vector: soulPoint ? soulPoint.vector : null,
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

    let useStructured = false;
    if (sg) {
      const parts = [];
      
      // 1. Psychological Profile
      const psych = sg.psychological_profile;
      if (psych) {
        if (psych.temperament) parts.push(`Temperament: ${psych.temperament}`);
        if (psych.core_struggles?.length > 0) parts.push(`Core struggles: ${psych.core_struggles.join(', ')}`);
        if (psych.worldview_lens) parts.push(`Worldview: ${psych.worldview_lens}`);
        if (psych.relational_dynamics?.length > 0) parts.push(`Relational dynamics: ${psych.relational_dynamics.join(', ')}`);
        if (psych.implicit_deductions?.likely_likes?.length > 0) {
          parts.push(`Likely likes: ${psych.implicit_deductions.likely_likes.join(', ')}`);
        }
        if (psych.implicit_deductions?.likely_dislikes?.length > 0) {
          parts.push(`Likely dislikes: ${psych.implicit_deductions.likely_dislikes.join(', ')}`);
        }
      }

      // 2. Isolated Media Profiles
      const media = sg.media_profiles;
      if (media) {
        for (const [mediaType, profile] of Object.entries(media)) {
          if (!profile) continue;
          parts.push(`\n=== TASTE PROFILE FOR ${mediaType.toUpperCase()} ===`);
          
          if (profile.themes) {
            const sorted = Object.entries(profile.themes).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) parts.push(`  Themes: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
          }
          if (profile.emotional_resonances) {
            const sorted = Object.entries(profile.emotional_resonances).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) parts.push(`  Emotional resonances: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
          }
          if (profile.aesthetic_affinities) {
            const sorted = Object.entries(profile.aesthetic_affinities).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) parts.push(`  Aesthetic affinities: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
          }
          if (profile.creative_anchors) {
            for (const [anchorType, anchors] of Object.entries(profile.creative_anchors)) {
              if (anchors && typeof anchors === 'object') {
                const sorted = Object.entries(anchors).sort((a, b) => b[1] - a[1]);
                if (sorted.length > 0) parts.push(`  ${anchorType}: ${sorted.map(([k, v]) => `${k}:${v}`).join(', ')}`);
              }
            }
          }
          if (profile.pacing) {
            parts.push(`  Pacing preference: ${profile.pacing}`);
          }
        }
      }

      // 3. Guardrails
      if (sg.guardrails?.length > 0) {
        parts.push(`\nGuardrails: ${sg.guardrails.join(', ')}`);
      }
      
      if (livingMemoryJson.media_reflections?.length > 0) {
        parts.push(`\nPersonal media reflections: ${livingMemoryJson.media_reflections.join('. ')}`);
      }
      
      if (parts.length > 0) {
        fullSoulText = parts.join('\n');
        useStructured = true;
        console.log(`[Soul Mapping] Using structured Soul Graph for embedding (${parts.length} dimensions)`);
      }
    }

    if (!useStructured) {
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
      console.log(`[Soul Mapping] No Soul Graph yet or graph is empty — using text-based fallback for embedding`);
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
      let mediaVectors = [];
      let missingTitles = [];
      const cacheKey = [...lovedTitles].sort().join('|');

      if (centroidCache.key === cacheKey && centroidCache.vector) {
        mediaVectors = [centroidCache.vector];
        console.log(`[Soul Mapping] Centroid cache HIT. Reusing cached centroid.`);
      } else {
        try {
          const ids = await qdrantService.findIdsByTitles('media_brain', lovedTitles);
          if (ids.length > 0) {
            const points = await qdrantService.client.retrieve('media_brain', {
              ids: ids,
              with_payload: false,
              with_vector: true
            });
            mediaVectors = points.map(p => p.vector).filter(Boolean);
            console.log(`[Soul Mapping] Fetched ${mediaVectors.length} vectors for centroid in one batch.`);
          }
        } catch(e) {
          console.warn(`[Soul Mapping] Failed to fetch loved vectors for centroid:`, e.message);
        }
      }

      // Enrichment bypassed for testing

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

        if (centroidCache.key !== cacheKey) {
          centroidCache.key = cacheKey;
          centroidCache.vector = centroid;
        }

        // Normalize centroid before blending
        let centroidMag = 0;
        for (let i = 0; i < 1536; i++) centroidMag += centroid[i] * centroid[i];
        centroidMag = Math.sqrt(centroidMag);
        if (centroidMag > 0) {
          for (let i = 0; i < 1536; i++) centroid[i] /= centroidMag;
        }

        // Normalize textVector as well to be completely safe
        let textMag = 0;
        for (let i = 0; i < 1536; i++) textMag += textVector[i] * textVector[i];
        textMag = Math.sqrt(textMag);
        if (textMag > 0) {
          for (let i = 0; i < 1536; i++) textVector[i] /= textMag;
        }

        // Apply dynamic weighting (actions speak louder than words)
        let centroidWeight = 0.5;
        let textWeight = 0.5;
        if (mediaVectors.length >= 10) {
          centroidWeight = 0.7;
          textWeight = 0.3;
        }

        finalVector = new Array(1536);
        for (let i = 0; i < 1536; i++) {
          finalVector[i] = (textVector[i] * textWeight) + (centroid[i] * centroidWeight);
        }

        // Re-normalize final vector
        let finalMag = 0;
        for (let i = 0; i < 1536; i++) finalMag += finalVector[i] * finalVector[i];
        finalMag = Math.sqrt(finalMag);
        if (finalMag > 0) {
          for (let i = 0; i < 1536; i++) finalVector[i] /= finalMag;
        }

        console.log(`[Soul Mapping] Blended text persona (${textWeight*100}%) with ${mediaVectors.length} media vectors (${centroidWeight*100}%) (${missingTitles.length} titles still enriching).`);
      }

      // Removed: Autonomous Mycelium Crawl previously looped over all lovedTitles here, causing massive re-queueing.
    }

    // ── FAIL 2 FIX: Store soul_graph as structured Qdrant payload (NOT stringified) ──
    await qdrantService.upsert('user_souls', uuid, finalVector, {
      userId,
      globalIdentity: livingMemoryJson.globalIdentity || [],
      categoryProfiles: livingMemoryJson.categoryProfiles || {},
      guardrails: livingMemoryJson.guardrails || [],
      media_reflections: livingMemoryJson.media_reflections || [],
      soul_graph: sg,   // ← stored as a proper structured JSON object
      loved_titles: livingMemoryJson.loved_titles || [], // ← persist loved_titles array
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
      recentVibes: livingMemoryJson.recentVibes || [],
      recentlyRecommended: livingMemoryJson.recentlyRecommended || [],
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
