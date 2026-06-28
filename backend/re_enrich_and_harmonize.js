require('./loadEnv');
const llmService = require('./services/llmService');
const qdrantService = require('./services/qdrantService');
const mediaEnrichmentService = require('./services/mediaEnrichmentService');
const userSoulService = require('./services/userSoulService');

async function run() {
  await qdrantService.init();
  const userId = 'chief-07'; // Assuming this is the main user based on previous exploration
  console.log(`[Re-Enrichment] Fetching memory for user: ${userId}`);

  const soul = await userSoulService.getUserMemory(userId);
  const currentMemory = soul.transient_memory || {};
  
  const fs = require('fs');
  const path = require('path');
  const summaryPath = path.join(__dirname, 'data', `coda_summary_${userId}.json`);
  let rawMemory = currentMemory;
  if (fs.existsSync(summaryPath)) {
     const diskMem = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
     rawMemory = { ...currentMemory, ...diskMem };
  }

  const lovedTitles = llmService.extractLovedTitles(rawMemory);
  console.log(`[Re-Enrichment] Extracted ${lovedTitles.length} loved titles.`);

  if (lovedTitles.length === 0) {
    console.log('[Re-Enrichment] No loved titles found. Aborting.');
    process.exit(0);
  }

  console.log(`[Re-Enrichment] Starting OpenAI re-enrichment for:`, lovedTitles);

  for (const title of lovedTitles) {
    try {
      console.log(`\n>>> Re-enriching: "${title}"`);
      await mediaEnrichmentService.enrichSingleTitle(title, 'movie'); 
      console.log(`<<< Finished enriching: "${title}"`);
    } catch (e) {
      console.error(`[Re-Enrichment] Failed on ${title}:`, e.message);
    }
  }

  console.log(`\n[Re-Enrichment] All loved titles enriched! Forcing global Soul Harmonization...`);
  
  const harmonizedGraph = await llmService.harmonizeAllMemory(rawMemory);
  
  const updatedMemory = {
    ...soul.permanent_soul,
    ...rawMemory,
    soul_graph: harmonizedGraph
  };
  
  console.log(`[Re-Enrichment] Syncing to Qdrant...`);
  await userSoulService.syncLivingMemory(userId, updatedMemory);
  
  console.log(`[Re-Enrichment] Done! Taste Space Centroid rebuilt successfully.`);
  process.exit(0);
}

run().catch(console.error);
