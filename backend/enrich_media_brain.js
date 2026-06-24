const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
require('./loadEnv');

const qdrantService = require('./services/qdrantService');
const embeddingService = require('./services/embeddingService');
const searchService = require('./services/searchService');
const llmService = require('./services/llmService');
const mediaEnrichmentService = require('./services/mediaEnrichmentService');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateUuid(key) {
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
}

async function enrich() {
  console.log('Initializing Qdrant...');
  qdrantService.init();
  await qdrantService.setupCollections();

  const seedPath = path.join(__dirname, 'data', 'seed_titles.json');
  const progressPath = path.join(__dirname, 'data', 'enrichment_progress.json');

  if (!fs.existsSync(seedPath)) {
    console.error(`Could not find ${seedPath}`);
    return;
  }

  const seedTitles = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  let progress = [];
  if (fs.existsSync(progressPath)) {
    try {
      progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    } catch (_) {}
  }

  console.log(`Starting enrichment for ${seedTitles.length} titles...`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < seedTitles.length; i++) {
    const { title, media_type } = seedTitles[i];
    const key = `${media_type}:${title.toLowerCase()}`;
    const uuid = generateUuid(key);

    console.log(`\n[${i + 1}/${seedTitles.length}] Enriching: ${title} (${media_type})`);

    // Delegate to the new enrichment service
    const success = await mediaEnrichmentService.enrichSingleTitle(title, media_type);
    if (success) {
      successCount++;
      // Save progress (we consider skipped as success for progress purposes)
      progress.push({ title, uuid, timestamp: new Date().toISOString() });
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    } else {
      errorCount++;
    }

    // Rate limiting (service has its own delays but we add a bit more here to be safe)
    await delay(1500);
    if ((i + 1) % 10 === 0) {
      console.log(`  -> Taking a 5s breather...`);
      await delay(5000);
    }
  }

  console.log('\n--- ENRICHMENT COMPLETE ---');
  console.log(`Total processed: ${seedTitles.length}`);
  console.log(`Successfully enriched: ${successCount}`);
  console.log(`Skipped (already existed): ${skipCount}`);
  console.log(`Errors: ${errorCount}`);
}

enrich();
