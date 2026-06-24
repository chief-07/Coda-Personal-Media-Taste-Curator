const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('./loadEnv');

const qdrantService = require('./services/qdrantService');
const embeddingService = require('./services/embeddingService');

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

async function run() {
  console.log('Initializing Qdrant...');
  qdrantService.init();
  await qdrantService.setupCollections();

  const dataPath = path.join(__dirname, 'data', 'mass_enriched_data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Data file not found.');
    return;
  }

  const items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loaded ${items.length} enriched titles for embedding.`);

  let successCount = 0;
  let skipCount = 0;

  for (const item of items) {
    const key = `${item.media_type}:${item.title.toLowerCase()}`;
    const uuid = generateUuid(key);

    try {
      const existing = await qdrantService.getPoint('media_brain', uuid);
      if (existing) {
        console.log(`[Skipped] ${item.title} (already embedded)`);
        skipCount++;
        continue;
      }
    } catch (e) {
      // Expected if point does not exist
    }

    try {
      const semanticDescription = `
Atmosphere: ${item.atmosphere}
Emotional Aftermath: ${item.emotional_aftermath}
Consumption Context: ${item.consumption_context}
Themes: ${item.themes}
Plot: ${item.plot}
      `.trim();

      const embeddingText = `Title: ${item.title}\nType: ${item.media_type}\n${semanticDescription}`;
      
      const vector = await embeddingService.embed(embeddingText);

      const payload = {
        title: item.title,
        media_type: item.media_type,
        semantic_description: semanticDescription,
        key: key,
        indexed_at: new Date().toISOString()
      };

      await qdrantService.upsert('media_brain', uuid, vector, payload);
      console.log(`[Embedded] ${item.title}`);
      successCount++;
      await delay(500); // Breathe
    } catch (err) {
      console.error(`[Error] Failed to embed ${item.title}:`, err.message);
    }
  }

  console.log(`\nDone! Embedded: ${successCount}, Skipped: ${skipCount}`);
}

run();
