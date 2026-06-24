const path = require('path');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');
const embeddingService = require('./services/embeddingService');

async function testBrain() {
  qdrantService.init();

  const queries = [
    "A quietly introspective young woman, burdened by her own existential dread and feelings of isolation, navigates the complexities of life in a bustling city. She stumbles upon a kindred spirit, a boy who carries his own emotional scars, and their bond blossoms through shared moments of vulnerability and understanding. As they explore the beauty of their surroundings, the narrative unfolds in a soft, dreamlike haze, capturing the fleeting nature of connection and the profound impact of being truly seen. The climax arrives not in grand gestures, but in a gentle realization that they have both found a place to belong in each other’s lives, leaving the viewer with a bittersweet sense of hope that lingers long after the credits roll. Additionally, I am looking for a gritty japanese 90's mystery detective movie.",
    "A hyper-masculine, bombastic action story set in a historical setting, focused on an epic generational bloodline conflict between righteous heroes and supernatural evil like vampires."
  ];

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n\n======================================================`);
    console.log(`QUERY ${i + 1}:\n"${queries[i]}"`);
    console.log(`======================================================\n`);
    
    const vector = await embeddingService.embed(queries[i]);
    const results = await qdrantService.search('media_brain', vector, 3);
    
    for (const res of results) {
      console.log(`--- MATCH (Score: ${res.score.toFixed(3)}) ---`);
      console.log(`Title: ${res.payload.title} (${res.payload.media_type})`);
      console.log(`Genres: ${(res.payload.genres || []).join(', ')}`);
      
      // Extract a snippet from semantic description to show WHY it matched
      const desc = res.payload.semantic_description;
      const lines = desc.split('\n');
      console.log(`Synthesis Snapshot:`);
      for (const line of lines.slice(1, 4)) {
         console.log(`  ${line.substring(0, 120)}...`);
      }
      console.log('');
    }
  }
}

testBrain().catch(console.error);
