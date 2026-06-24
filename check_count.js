// removed
const qdrantService = require('./backend/services/qdrantService');
const fs = require('fs');

async function run() {
  await qdrantService.init();
  try {
    const res = await qdrantService.client.getCollection('media_brain');
    console.log(`Media Brain currently has ${res.points_count} points.`);
    
    let seedCount = 0;
    if (fs.existsSync('./backend/data/massive_seed.json')) {
      const seed = JSON.parse(fs.readFileSync('./backend/data/massive_seed.json'));
      seedCount = seed.length;
    }
    
    console.log(`Massive Seed queue: ${seedCount} items.`);
  } catch (e) {
    console.error('Error checking count:', e.message);
  }
}
run();
