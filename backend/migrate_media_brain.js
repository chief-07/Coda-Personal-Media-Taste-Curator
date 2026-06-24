const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
require('./loadEnv');

const qdrantService = require('./services/qdrantService');
const embeddingService = require('./services/embeddingService');
const llmService = require('./services/llmService');

// Deterministic UUID generator from a string key
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

async function migrate() {
  console.log('Initializing Qdrant...');
  qdrantService.init();
  if (!qdrantService.isInitialized) {
    console.error('Failed to initialize Qdrant. Check env vars.');
    return;
  }

  const cachePath = path.join(__dirname, 'cache', 'media_brain.json');
  if (!fs.existsSync(cachePath)) {
    console.error(`Could not find ${cachePath}`);
    return;
  }

  const rawData = fs.readFileSync(cachePath, 'utf8');
  let mediaBrain = {};
  try {
    mediaBrain = JSON.parse(rawData);
  } catch (e) {
    console.error('Failed to parse media_brain.json:', e.message);
    return;
  }

  const entries = Object.entries(mediaBrain);
  console.log(`Found ${entries.length} entries to migrate.`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const [key, data] = entries[i];
    const uuid = generateUuid(key);

    console.log(`\n[${i + 1}/${entries.length}] Processing: ${data.title} (${uuid})`);

    try {
      // Check if it already exists in Qdrant
      const existing = await qdrantService.getPoint('media_brain', uuid);
      if (existing) {
        console.log(`  -> Already exists in Qdrant. Skipping.`);
        skipCount++;
        continue;
      }

      console.log(`  -> Generating LLM semantic description...`);
      const description = await llmService.generateMediaDescription(data);
      console.log(`  -> Generated Description Length: ${description.length} characters`);

      console.log(`  -> Generating vector embedding...`);
      const embeddingText = `Title: ${data.title}\nDescription: ${description}`;
      const vector = await embeddingService.embed(embeddingText);

      console.log(`  -> Uploading to Qdrant...`);
      // The payload will contain the original JSON data PLUS the generated semantic description
      const payload = {
        ...data,
        semantic_description: description,
        key: key
      };

      await qdrantService.upsert('media_brain', uuid, vector, payload);
      console.log(`  -> Success!`);
      successCount++;

      // Wait a bit to avoid hitting rate limits
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  -> ERROR processing ${data.title}:`, e.message);
      errorCount++;
    }
  }

  console.log('\n--- MIGRATION COMPLETE ---');
  console.log(`Total: ${entries.length}`);
  console.log(`Successfully migrated: ${successCount}`);
  console.log(`Skipped (already existed): ${skipCount}`);
  console.log(`Errors: ${errorCount}`);
}

migrate();
