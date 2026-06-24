require('../loadEnv');
const embeddingService = require('../services/embeddingService');
const qdrantService = require('../services/qdrantService');

const VIBE_QUERIES = [
  "A late 1990s Japanese anime with gritty, hand-drawn cel animation. The visual style is industrial and rusted. It explores themes of existential dread and technological alienation, leaving the viewer feeling deeply melancholic and hollow.",
  "A grainy, 16mm film from the 1970s. The visual style uses muted, washed-out colors and claustrophobic cinematography. It explores political paranoia and urban isolation, instilling a profound sense of anxiety and distrust.",
  "A hyper-stylized, neon-soaked visual masterpiece from the 2010s. It features hyper-kinetic editing and a pulsing synth-wave soundtrack. The core theme is reckless youth and rebellion, resulting in an intoxicating, euphoric, and ultimately tragic emotional arc.",
  "An early 2000s animated feature with lush, sweeping watercolor backgrounds and gentle, pastoral visual styles. It deals with themes of environmentalism and coming-of-age, creating an overwhelming sense of nostalgia, warmth, and bittersweet longing."
];

async function runTests() {
  console.log('=== ADVANCED MEDIA BRAIN VIBE TEST ===');
  console.log('Initializing Qdrant...');
  qdrantService.init();

  for (const query of VIBE_QUERIES) {
    console.log(`\n========================================`);
    console.log(`QUERY: "${query}"`);
    console.log(`========================================`);
    try {
      const vector = await embeddingService.embed(query);
      const results = await qdrantService.search('media_brain', vector, 5);
      
      if (!results || results.length === 0) {
        console.log('No results found. (Is the database empty?)');
        continue;
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const score = (r.score * 100).toFixed(1);
        console.log(`[${score}% Match] ${r.payload.title} (${r.payload.media_type})`);
        
        const desc = r.payload.description || r.payload.semantic_description;
        if (desc) {
          console.log(`   -> Vibe Snippet: ${desc.substring(0, 150).replace(/\n/g, ' ')}...`);
        }
      }
    } catch (e) {
      console.error('Error during query:', e.message);
    }
  }
  console.log('\n=== TEST COMPLETE ===');
}

runTests();
