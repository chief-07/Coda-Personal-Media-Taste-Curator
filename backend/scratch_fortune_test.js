const llmService = require('./services/llmService');
const userSoulService = require('./services/userSoulService');
const embeddingService = require('./services/embeddingService');
const qdrantService = require('./services/qdrantService');
const fs = require('fs');
const path = require('path');
require('./loadEnv');

const lovedTitles = [
  "Oshi No Ko", "Rascal Does Not Dream of Bunny Girl Senpai", "Kokoro Connect",
  "Love Letter", "Death Note", "Norwegian Wood", "My Teen Romantic Comedy SNAFU",
  "Sisterhood", "The Pet Girl of Sakurasou", "Bakemonogatari",
  "Colorless Tsukuru Tazaki and His Years of Pilgrimage", "Perfect Blue",
  "The Melancholy of Haruhi Suzumiya", "Freiren", "Kaguya-sama: Love is War",
  "No Longer Human", "All About Lily Chou-Chou", "My Tomorrow, Your Yesterday",
  "Your Name.", "Violet Evergarden", "I Want to Eat Your Pancreas",
  "Welcome to the N-H-K", "Sputnik Sweetheart", "Blue Spring", "Katawa Shoujo",
  "Hyouka", "Anohana: The Flower We Saw That Day", "Charlotte",
  "Maquia: When the Promised Flower Blooms", "Chuunibyou demo Koi ga Shitai!",
  "DARLING in the FRANXX", "Takopi's Original Sin", "Dororo", "Kafka on the Shore",
  "Attack on Titan", "Wolf Children", "The Girl Who Leapt Through Time",
  "Plastic Memories", "Ride Your Wave", "The Wind Rises", "In This Corner of the World",
  "Sayonara no Asa ni Yakusoku no Hana wo Kazarou", "Crying Out Love in the Center of the World",
  "Hotarubi no Mori e", "Omoide Poroporo", "Sennen Joyuu", "Sen to Chihiro no Kamikakushi",
  "Tsukihime", "Se7en", "Toki wo Kakeru Shoujo", "Kono Sekai no Katasumi ni",
  "Sayonara Zetsubou Sensei", "Josee to Tora to Sakana-tachi", "Only Yesterday", "Weathering with You"
];

const NEIGHBORHOOD_CACHE_DIR = path.join(__dirname, 'cache/neighborhoods');
if (!fs.existsSync(NEIGHBORHOOD_CACHE_DIR)) {
  fs.mkdirSync(NEIGHBORHOOD_CACHE_DIR, { recursive: true });
}

/**
 * Replicated helper for stress test to ensure test results match production
 */
async function getOrBuildNeighborhoodPool(userId, lovedTitles, mediaType) {
  if (!userId) return [];
  const cachePath = path.join(NEIGHBORHOOD_CACHE_DIR, `${userId}_${mediaType}.json`);
  const sortedLoved = [...lovedTitles].sort();
  
  if (fs.existsSync(cachePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const cacheSortedLoved = (cacheData.lovedTitles || []).sort();
      if (JSON.stringify(sortedLoved) === JSON.stringify(cacheSortedLoved)) {
        console.log(`[LNR Cache] HIT for user ${userId} (${mediaType}). Using cached pool of ${cacheData.candidates.length} items.`);
        return cacheData.candidates;
      }
      console.log(`[LNR Cache] MISS (Loved list changed). Rebuilding pool for user ${userId} (${mediaType}).`);
    } catch (e) {
      console.warn(`[LNR Cache] Failed to read cache for ${userId}:`, e.message);
    }
  } else {
    console.log(`[LNR Cache] MISS (No cache file). Building pool for user ${userId} (${mediaType}).`);
  }

  const qdrantMediaType = mediaType === 'visualNovel' ? 'visual novel' : mediaType;
  const filter = { must: [{ key: "media_type", match: { value: qdrantMediaType } }] };

  const lovedIds = await qdrantService.findIdsByTitles('media_brain', lovedTitles);
  let lovedVectors = [];
  if (lovedIds.length > 0) {
    try {
      const lovedPoints = await qdrantService.client.retrieve('media_brain', {
        ids: lovedIds,
        with_payload: false,
        with_vector: true
      });
      lovedVectors = lovedPoints.map(p => p.vector).filter(Boolean);
    } catch(e) {
      console.warn("[LNR Cache] Failed to fetch loved vectors:", e.message);
      return [];
    }
  }

  if (lovedVectors.length === 0) return [];

  // Batch search for top 20 nearest neighbors (chunked & retried to avoid flakiness)
  const batchResults = [];
  const chunkSize = 5;
  for (let i = 0; i < lovedVectors.length; i += chunkSize) {
    const chunk = lovedVectors.slice(i, i + chunkSize);
    const searches = chunk.map(vector => ({
      vector: vector,
      limit: 20,
      filter: filter,
      with_payload: true,
      with_vector: true
    }));
    
    let chunkResults = null;
    let retries = 5;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        chunkResults = await qdrantService.client.searchBatch('media_brain', { searches });
        break; // Succeeded!
      } catch(e) {
        console.warn(`[LNR Cache] searchBatch chunk attempt ${attempt}/${retries} failed: ${e.message}`);
        if (attempt === retries) {
          throw e; // Fail fast and bubble up
        }
        await new Promise(r => setTimeout(r, 1000 * attempt)); // wait 1s, 2s, 3s...
      }
    }

    if (chunkResults) {
      batchResults.push(...chunkResults);
    }
    
    if (i + chunkSize < lovedVectors.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const candidateMap = new Map();
  batchResults.forEach((resultsForTitle, idx) => {
    const sourceLovedTitle = lovedTitles[idx] || 'unknown';
    resultsForTitle.forEach(point => {
      if (!point.payload || !point.payload.title) return;
      const title = point.payload.title;
      const normalizedTitle = title.toLowerCase().replace(/^the\s+/, '').trim();
      
      if (lovedTitles.map(t => t.toLowerCase()).includes(title.toLowerCase())) return;

      if (!candidateMap.has(normalizedTitle)) {
        candidateMap.set(normalizedTitle, {
          id: point.id,
          payload: point.payload,
          vector: point.vector,
          lovedScores: {}
        });
      }
      const cand = candidateMap.get(normalizedTitle);
      cand.lovedScores[sourceLovedTitle.toLowerCase()] = point.score;
    });
  });

  const candidates = Array.from(candidateMap.values());

  try {
    fs.writeFileSync(cachePath, JSON.stringify({ lovedTitles: sortedLoved, candidates }, null, 2), 'utf8');
    console.log(`[LNR Cache] Saved ${candidates.length} candidates for user ${userId} (${mediaType}).`);
  } catch(e) {
    console.warn(`[LNR Cache] Failed to write cache for ${userId}:`, e.message);
  }

  return candidates;
}

async function runE2ETest() {
  console.log('--- STARTING FORTUNE 10-BATCH E2E TEST ---');
  await qdrantService.init();

  const currentMemory = {
    globalIdentity: [],
    categoryProfiles: {},
    seen: [],
    notForMe: [],
    watchlist: [],
    loved_titles: lovedTitles,
    recentContext: '',
    contextualState: {
      timeOfDay: "Tuesday morning, 8:00 AM",
      currentMood: "Exhausted, anxious, fragile before work"
    }
  };

  const userId = 'fortune_stress_003';
  let mdReport = `# Fortune's 10-Batch Test Results\n\n`;

  console.log('\n[1] Harmonizing Global Soul Graph...');
  const harmonizationResult = await llmService.harmonizeAllMemory(currentMemory);
  const fullMemory = {
    ...currentMemory,
    globalIdentity: harmonizationResult.global_identity_overwrite || [],
    categoryProfiles: harmonizationResult.category_profiles_overwrite || currentMemory.categoryProfiles,
    soul_graph: harmonizationResult.soul_graph || null,
  };

  await userSoulService.syncLivingMemory(userId, fullMemory);
  let fetchedSoul = await userSoulService.getUserMemory(userId);

  mdReport += `## The Generated Soul Graph\n`;
  mdReport += `This graph was generated by reading the DNA of all 55 loved titles.\n\n`;
  mdReport += "```json\n" + JSON.stringify(fetchedSoul.permanent_soul.soul_graph, null, 2) + "\n```\n\n";

  // Raw Centroid Search (Mapping the Loved Media Net)
  console.log('\n[1.5] Mapping the Loved Media Net (Raw Centroid Search)...');
  const soulVector = fetchedSoul.soul_vector;
  if (soulVector) {
    const rawNet = await qdrantService.search('media_brain', soulVector, 20);
    mdReport += `## Raw Centroid Mapping (The "Net")\n`;
    mdReport += `These are the top 20 closest titles mathematically mapped to the center of Fortune's soul graph, bypassing all LLM filters.\n\n`;
    rawNet.forEach((c, i) => {
      mdReport += `${i+1}. **${c.payload.title}** (${c.payload.media_type}) - Score: ${c.score.toFixed(3)}\n`;
    });
    mdReport += `\n---\n\n`;
  }

  async function runBatch(mediaType, batchIndex) {
    console.log(`\n--- Running ${mediaType.toUpperCase()} Batch ${batchIndex} ---`);
    mdReport += `## ${mediaType.toUpperCase()} Batch ${batchIndex}\n`;

    const { selected_vibe_focus, aesthetic_anchors, search_brief } = await llmService.synthesizeSearchBrief(fetchedSoul, mediaType);
    
    mdReport += `### 1. Phantom Document (Search Brief)\n`;
    mdReport += `**Selected Vibe Focus:** ${selected_vibe_focus}\n\n`;
    mdReport += "```text\n" + search_brief + "\n```\n\n";

    const queryVector = await embeddingService.embed(search_brief);
    const filter = { must: [{ key: "media_type", match: { value: mediaType } }] };
    
    // ── Local Neighborhood Resonance (LNR) Pipeline ──
    let rawResults = [];
    let isLnrUsed = false;
    const lovedTitles = fetchedSoul.permanent_soul?.loved_titles || [];

    if (lovedTitles.length > 0) {
      try {
        const lnrPool = await getOrBuildNeighborhoodPool(userId, lovedTitles, mediaType);
        if (lnrPool.length > 0) {
          const maxOverlap = Math.max(...lnrPool.map(c => Object.keys(c.lovedScores).length), 1);
          
          rawResults = lnrPool.map(c => {
            const scores = Object.values(c.lovedScores);
            const overlapCount = scores.length;
            const maxSimilarity = Math.max(...scores);
            
            let vibeSimilarity = 0;
            if (c.vector && queryVector) {
              for (let i = 0; i < 1536; i++) {
                vibeSimilarity += c.vector[i] * queryVector[i];
              }
            }
            
            const score = (vibeSimilarity * 0.4) + (maxSimilarity * 0.3) + ((overlapCount / maxOverlap) * 0.3);
            
            return {
              id: c.id,
              payload: c.payload,
              vector: c.vector,
              score: score
            };
          });
          
          rawResults.sort((a, b) => b.score - a.score);
          isLnrUsed = true;
          console.log(`[LNR Pipeline] Successfully scored ${rawResults.length} candidates using Local Neighborhood Resonance.`);
        }
      } catch(e) {
        console.warn("[LNR Pipeline] Failed to use LNR. Falling back to standard vector search.", e.message);
      }
    }

    if (!isLnrUsed) {
      console.log("[LNR Pipeline] Running fallback standard vector search...");
      rawResults = await qdrantService.search('media_brain', queryVector, 150, filter, true);
    }
    
    rawResults = rawResults.slice(0, 30);
    
    const recentlyRecommended = fetchedSoul.transient_memory?.recentlyRecommended || [];
    let candidates = rawResults.filter(c => !recentlyRecommended.includes(c.payload.title)).slice(0, 10);

    mdReport += `### 2. Candidate Pool (from Qdrant)\n`;
    candidates.forEach((c, i) => {
      mdReport += `${i+1}. ${c.payload.title} (Score: ${c.score.toFixed(3)})\n`;
    });
    mdReport += `\n`;

    const editorialDecision = await llmService.evaluateCandidates(candidates, fetchedSoul, selected_vibe_focus);
    
    mdReport += `### 3. The Picks (Simulated App Output)\n`;
    
    const topCandidate = candidates.find(c => c.id === editorialDecision.top_pick.id) || candidates[0];
    mdReport += `**🎯 TOP PICK: ${topCandidate.payload.title}**\n`;
    mdReport += `> **Coda Blurb:** "${editorialDecision.top_pick.coda_blurb}"\n\n`;
    mdReport += `${editorialDecision.top_pick.pitch_paragraphs.join('\n\n')}\n\n`;
    
    mdReport += `**Runner-Ups (App's secondary options):**\n`;
    const newRecs = [topCandidate.payload.title];
    editorialDecision.runner_ups.forEach(id => {
      const ru = candidates.find(c => c.id === id);
      if (ru) {
        mdReport += `- ${ru.payload.title}\n`;
        newRecs.push(ru.payload.title);
      }
    });
    mdReport += `\n---\n\n`;

    const updatedVibes = [selected_vibe_focus, ...(fetchedSoul.transient_memory?.recentVibes || [])].slice(0, 5);
    const updatedRecs = [...new Set([...newRecs, ...recentlyRecommended])].slice(0, 15);
    
    const updatedMemory = {
      ...(fetchedSoul.permanent_soul || {}),
      ...(fetchedSoul.transient_memory || {}),
      recentVibes: updatedVibes,
      recentlyRecommended: updatedRecs
    };
    
    await userSoulService.syncLivingMemory(userId, updatedMemory);
    fetchedSoul = await userSoulService.getUserMemory(userId);
  }

  for (let i = 1; i <= 2; i++) {
    await runBatch('anime', i);
  }

  for (let i = 1; i <= 2; i++) {
    await runBatch('movie', i);
  }

  fs.writeFileSync('C:/Users/USER/.gemini/antigravity/brain/353193fb-c0aa-4963-975a-34af33e73276/fortune_final_batch.md', mdReport);
  console.log('--- ALL BATCHES COMPLETE. REPORT WRITTEN. ---');
  process.exit(0);
}

runE2ETest().catch(console.error);
