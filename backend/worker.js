const mediaEnrichmentService = require('./services/mediaEnrichmentService');
const qdrantService = require('./services/qdrantService');
require('./loadEnv');

console.log('[Worker] Connecting to Qdrant...');
console.log('[Worker] Starting Qdrant 3-Tier Priority Queue Polling...');

// Initialize Qdrant connection and ensure media_queue collection exists
qdrantService.init();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runWorkerLoop() {
  // Give Qdrant time to initialize and create collections if needed
  await delay(3000);
  try {
    await qdrantService.setupCollections();
  } catch (e) {
    console.error('[Worker] Failed to setup collections:', e.message);
  }

  while (true) {
    let currentTask = null;
    
    try {
      currentTask = await qdrantService.popFromQueue();
      
      if (!currentTask) {
        // Queue is entirely empty. Sleep for 5 seconds to prevent aggressive polling
        await delay(5000);
        continue;
      }

      const { title, media_type, tier } = currentTask;
      console.log(`\n[Worker] Picked up item from Tier ${tier}: ${title} (${media_type})`);

      const success = await mediaEnrichmentService.enrichSingleTitle(title, media_type);

      if (success) {
        console.log(`[Worker] Successfully processed ${title}`);
        // If it was a Tier 1 or Tier 2 item, let's autonomously trigger Mycelium Crawl to populate Tier 2!
        if (tier === 1 || tier === 2) {
          console.log(`[Worker] Triggering autonomous Mycelium crawl for: ${title}`);
          // Mycelium logic handles injecting neighbors into Qdrant Tier 2.
          await mediaEnrichmentService.enrichTitleAndNeighbors(title, media_type);
        }
      } else {
        console.log(`[Worker] Enrichment returned false for ${title}`);
      }

      // Base delay between successful processing to respect Groq limits
      await delay(2000);

    } catch (error) {
      console.error(`[Worker] Error processing item:`, error.message);
      
      // Check if it's a Groq 429 Rate Limit
      if (error.status === 429 || error.message.includes('429')) {
        console.log(`[Worker] ⚠️ GROQ RATE LIMIT HIT. Throttling and sleeping...`);
        
        // Push the item BACK to the queue so we don't lose it
        if (currentTask) {
           await qdrantService.pushToQueue(currentTask.title, currentTask.media_type, currentTask.tier);
           console.log(`[Worker] Re-queued ${currentTask.title} to Tier ${currentTask.tier}`);
        }
        
        // Exponential backoff or sleep for 60 seconds
        console.log(`[Worker] Sleeping for 60 seconds before resuming...`);
        await delay(60000);
      } else {
        // General error (e.g. TMDB down). Sleep briefly and continue
        await delay(5000);
      }
    }
  }
}

// Start the infinite loop
runWorkerLoop();
