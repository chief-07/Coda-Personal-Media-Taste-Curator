const fs = require('fs');
const path = require('path');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');

async function run() {
  qdrantService.init();
  
  try {
    const result = await qdrantService.client.scroll('media_brain', {
      limit: 1000,
      with_payload: true,
      with_vector: false
    });
    
    const titles = result.points.map(p => `- **${p.payload.title}** (${p.payload.media_type})`).sort();
    
    fs.writeFileSync(
      path.join(__dirname, 'processed_titles.txt'),
      `# Processed Titles in Media Brain\n\nTotal: ${titles.length}\n\n${titles.join('\n')}`
    );
    
    console.log(`Saved ${titles.length} titles to artifact.`);
  } catch (e) {
    console.error(e);
  }
}
run();
