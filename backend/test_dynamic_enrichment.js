const axios = require('axios');
const path = require('path');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');

async function testDynamicEnrichment() {
  console.log('Testing Dynamic Vibe Crawl and Vector Centroid Mapping...');

  const payload = {
    userId: "test-user-dynamic",
    currentMemory: {
      globalIdentity: [
        "Highly values: Serial Experiments Lain (loved work)"
      ],
      categoryProfiles: {},
      media_reflections: [
        "I loved Serial Experiments Lain because of the deep psychological horror and retro cyberpunk aesthetic."
      ]
    }
  };

  try {
    // We will directly test userSoulService logic to avoid running the full LLM harmonize which costs $
    const userSoulService = require('./services/userSoulService');
    await qdrantService.init();

    console.log("1. Generating Soul Map...");
    await userSoulService.updatePermanentSoul(payload.userId, payload.currentMemory);

    console.log("2. Verifying Soul Map in Qdrant...");
    const uuid = userSoulService.generateUserUuid(payload.userId);
    const soulPoint = await qdrantService.getPoint('user_souls', uuid);
    if (soulPoint) {
      console.log(`Success! User Soul stored with payload:`, soulPoint.payload);
      console.log(`Vector dimensionality: ${soulPoint.vector.length} (should be 1536)`);
    } else {
      console.error("Failed to find user soul in Qdrant.");
    }

    // Now test the background enrichment via the service manually
    console.log("\n3. Testing Media Vibe Crawling (Enrichment)...");
    const mediaEnrichmentService = require('./services/mediaEnrichmentService');
    // We just test extracting neighbors for now
    await mediaEnrichmentService.enrichTitleAndNeighbors('Serial Experiments Lain', 'anime');

  } catch (e) {
    console.error('Test failed:', e);
  }
}

testDynamicEnrichment();
