const express = require('express');
const router = express.Router();
const { PCA } = require('ml-pca');
const qdrantService = require('../services/qdrantService');
const userSoulService = require('../services/userSoulService');
const embeddingService = require('../services/embeddingService');
const llmService = require('../services/llmService');

// In-memory cache for PCA model and points
let globalPcaModel = null;
let cachedGalaxy3D = null;

async function fetchAllMediaPoints() {
  const allPoints = [];
  let offset = null;
  do {
    const res = await qdrantService.client.scroll('media_brain', {
      offset: offset,
      limit: 100,
      with_vector: true,
      with_payload: true,
    });
    if (res.points) {
      allPoints.push(...res.points);
    }
    offset = res.next_page_offset;
  } while (offset !== null && offset !== undefined);
  return allPoints;
}

// Generate the 3D map of the Media Brain
router.get('/galaxy', async (req, res) => {
  try {
    const points = await fetchAllMediaPoints();
    if (points.length === 0) {
      return res.json([]);
    }

    const vectors = points.map(p => p.vector);
    
    // Fit PCA model
    globalPcaModel = new PCA(vectors);
    const projected = globalPcaModel.predict(vectors).to2DArray();

    cachedGalaxy3D = points.map((p, i) => ({
      id: p.id,
      title: p.payload.title,
      media_type: p.payload.media_type,
      genres: p.payload.genres || [],
      semantic_description: p.payload.semantic_description,
      coords: [projected[i][0], projected[i][1], projected[i][2]]
    }));

    res.json(cachedGalaxy3D);
  } catch (e) {
    console.error("[Visualize Galaxy Error]", e);
    res.status(500).json({ error: e.message });
  }
});

// Calculate Soul and Craving positions
router.post('/soul', async (req, res) => {
  try {
    const { current_memory } = req.body;
    if (!current_memory) return res.status(400).json({ error: 'Missing current_memory' });

    if (!globalPcaModel) {
      // Fit it real quick if missing
      const points = await fetchAllMediaPoints();
      const vectors = points.map(p => p.vector);
      globalPcaModel = new PCA(vectors);
    }

    // 1. Calculate Soul Vector
    const globalIdentity = (current_memory.globalIdentity || []).join('. ');
    let categoryTastes = '';
    const profiles = current_memory.categoryProfiles || {};
    for (const [cat, tastes] of Object.entries(profiles)) {
      if (tastes && tastes.length > 0) categoryTastes += `\n${cat}: ${tastes.join('. ')}`;
    }
    let personalReflections = '';
    if (current_memory.media_reflections && current_memory.media_reflections.length > 0) {
      personalReflections = `\nPersonal Media Reflections:\n- ` + current_memory.media_reflections.join('\n- ');
    }
    const fullSoulText = `Core Identity: ${globalIdentity}\nCategory Tastes: ${categoryTastes}${personalReflections}`;
    const textVector = await embeddingService.embed(fullSoulText);

    let soulVector = textVector;
    const lovedTitles = llmService.extractLovedTitles(current_memory);
    let lovedIds = [];
    
    if (lovedTitles.length > 0) {
      const mediaVectors = [];
      for (const title of lovedTitles) {
        const sr = await qdrantService.client.scroll('media_brain', {
          filter: { must: [{ key: 'title', match: { value: title } }] },
          with_vector: true, limit: 1
        });
        if (sr.points && sr.points.length > 0) {
          mediaVectors.push(sr.points[0].vector);
          lovedIds.push(sr.points[0].id); // keep track for connecting lines
        }
      }
      if (mediaVectors.length > 0) {
        const centroid = new Array(1536).fill(0);
        for (const vec of mediaVectors) {
          for (let i = 0; i < 1536; i++) centroid[i] += vec[i];
        }
        for (let i = 0; i < 1536; i++) centroid[i] /= mediaVectors.length;

        soulVector = new Array(1536);
        for (let i = 0; i < 1536; i++) soulVector[i] = (textVector[i] + centroid[i]) / 2.0;
      }
    }

    // 2. Calculate Transient Craving
    const recentContext = current_memory.recentContext || '';
    const cravingVector = await embeddingService.embed(`Recent Craving/Context: ${recentContext}`);

    // Project both to 3D
    const projectedSoul = globalPcaModel.predict([soulVector]).to2DArray()[0];
    const projectedCraving = globalPcaModel.predict([cravingVector]).to2DArray()[0];

    res.json({
      soul_coords: [projectedSoul[0], projectedSoul[1], projectedSoul[2]],
      craving_coords: [projectedCraving[0], projectedCraving[1], projectedCraving[2]],
      loved_ids: lovedIds
    });
  } catch (e) {
    console.error("[Visualize Soul Error]", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
