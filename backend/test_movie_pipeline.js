const llmService = require('./services/llmService');
const userSoulService = require('./services/userSoulService');
const embeddingService = require('./services/embeddingService');
const qdrantService = require('./services/qdrantService');
const fs = require('fs');
const path = require('path');
require('./loadEnv');
async function runE2ETest() {
  console.log('--- STARTING E2E TEST ---');
  
  // Initialize Qdrant Service
  qdrantService.init();

  const startTime = Date.now();
  
  // 1. Simulate Onboarding Chat
  console.log('[1] Simulating Onboarding Chat...');
  const chatHistory = [
    {
      text: `hi im fortune im 18 i love stories of love and loss stories that touch on the cruelty and beauty in human life i like media that speaks to me i like media that leaves an impact that i can feel even long after i have forgotten the plot i love media with a great cast and different characters with dynamics and their own stories, i like mystery i like emotional romance sometimes, i like psychological, i like some surreal movies, across media my favorites are interstellar, katawa shoujo, welcome to the nhk, steins gate, the colorless tsukuru tazaki, norwegian wood, heavenly forest, tsukihime. i like my mcs not to be like the best or the flashiest i like some flaw and brokenness to my mc but the people are still around him i like my loser mc and the perfect girl that comes to save him`,
      isUser: true
    }
  ];

  // Build currentMemory with explicit loved titles + per-media category profiles
  // simulating what the Flutter app would have collected from the onboarding tabs
  const currentMemory = {
    globalIdentity: [],
    categoryProfiles: {
      anime: [
        'Loved: Welcome to the NHK (excellent match)',
        'Loved: Steins;Gate (excellent match)',
        'Prefers psychological anime, slow-burn emotional stories',
        'Likes ensemble casts with distinct character arcs',
        'Dislikes battle shonen, mindless action'
      ],
      visual_novels: [
        'Loved: Katawa Shoujo (excellent match)',
        'Loved: Tsukihime (excellent match)',
        'Prefers narrative-heavy VNs with deep character writing',
        'Likes branching stories with emotional weight'
      ],
      books: [
        'Loved: The Colorless Tsukuru Tazaki (excellent match)',
        'Loved: Norwegian Wood (excellent match)',
        'Strongly drawn to Haruki Murakami - his surreal melancholy and quiet alienation',
        'Prefers literary fiction with dreamlike atmosphere'
      ],
      movies: [
        'Loved: Interstellar (excellent match)',
        'Loved: Heavenly Forest (excellent match)',
        'Likes emotionally epic stories, visually ambitious films',
        'Appreciates quiet human dramas'
      ]
    },
    seen: [],
    notForMe: [],
    watchlist: [],
    recentContext: '',
    contextualState: {
      timeOfDay: "Tuesday morning, 8:00 AM",
      currentMood: "Exhausted, anxious, fragile before work",
      recentChatContext: "User explicitly said: 'don't give me heavy horror or tragedy right now, I need something that won't ruin my morning.'"
    }
  };

  const userId = 'e2e_fortune_001';

  let t0 = Date.now();
  const harmonizationResult = await llmService.harmonizeAllMemory(currentMemory);
  const harmonizeTime = Date.now() - t0;
  console.log(`Harmonization complete in ${harmonizeTime}ms`);

  // 2. Build and save the full merged memory to Qdrant
  const fullMemory = {
    ...currentMemory,
    globalIdentity: harmonizationResult.global_identity_overwrite || [],
    categoryProfiles: harmonizationResult.category_profiles_overwrite || currentMemory.categoryProfiles,
    soul_graph: harmonizationResult.soul_graph || null,
  };

  console.log('\n[2] Saving User Soul to Qdrant...');
  t0 = Date.now();
  await userSoulService.syncLivingMemory(userId, fullMemory);
  const saveTime = Date.now() - t0;
  console.log(`Soul saved in ${saveTime}ms`);
  
  const fetchedSoul = await userSoulService.getUserMemory(userId);

  console.log('SOUL GRAPH STRUCTURE:');
  console.log(JSON.stringify(fetchedSoul.permanent_soul.soul_graph, null, 2));

  console.log('\n[3] Synthesizing Search Brief...');
  t0 = Date.now();
  const { selected_vibe_focus, aesthetic_anchors, search_brief } = await llmService.synthesizeSearchBrief(fetchedSoul, 'movie');
  const briefTime = Date.now() - t0;
  console.log(`Brief synthesized in ${briefTime}ms`);
  console.log(`DECLARED VIBE FOCUS: "${selected_vibe_focus}"`);
  console.log(`AESTHETIC ANCHORS:`, JSON.stringify(aesthetic_anchors, null, 2));
  console.log(`SEARCH BRIEF:\n${search_brief}`);

  // 4. Vector Search
  console.log('\n[4] Querying Media Brain (Qdrant)...');
  t0 = Date.now();
  const queryVector = await embeddingService.embed(search_brief);
  const filter = {
    must: [
      { key: "media_type", match: { value: "movie" } }
    ]
  };
  const rawResults = await qdrantService.search('media_brain', queryVector, 15, filter);
  const searchTime = Date.now() - t0;
  console.log(`Found ${rawResults.length} raw candidates in ${searchTime}ms`);
  
  const candidates = rawResults.slice(0, 8);
  console.log('\nCANDIDATE POOL (Top 8):');
  candidates.forEach((c, i) => console.log(`${i+1}. ${c.payload.title} (Score: ${c.score.toFixed(3)})`));

  // 5. Evaluate Candidates
  console.log('\n[5] Editorial Director Evaluation...');
  t0 = Date.now();
  const editorialDecision = await llmService.evaluateCandidates(candidates, fetchedSoul, selected_vibe_focus);
  const evalTime = Date.now() - t0;
  console.log(`Evaluation complete in ${evalTime}ms`);
  
  console.log('\n--- FINAL RECOMMENDATION ---');
  const topCandidate = candidates.find(c => c.id === editorialDecision.top_pick.id) || candidates[0];
  console.log(`TOP PICK: ${topCandidate.payload.title}`);
  console.log(`CODA BLURB: "${editorialDecision.top_pick.coda_blurb}"`);
  console.log(`PITCH:\n${editorialDecision.top_pick.pitch_paragraphs.join('\n\n')}`);
  
  console.log('\nRUNNER UPS:');
  editorialDecision.runner_ups.forEach(id => {
      const ru = candidates.find(c => c.id === id);
      if (ru) console.log(`- ${ru.payload.title}`);
  });

  const totalTime = Date.now() - startTime;
  console.log(`\nTOTAL PIPELINE TIME: ${totalTime}ms`);

  const candidatesList = candidates.map((c, i) => `${i+1}. **${c.payload.title}** (Score: ${c.score.toFixed(3)})`).join('\\n');
  const runnerUpsList = editorialDecision.runner_ups.map(id => {
      const ru = candidates.find(c => c.id === id);
      return ru ? `- ${ru.payload.title}` : '';
  }).filter(Boolean).join('\\n');

  const report = `
# E2E Recommendation Pipeline Test

**Test Duration:** ${totalTime}ms
**Simulated User Input:**
> "hi im fortune im 18 i love stories of love and loss stories that touch on the cruelty and beauty in human life i like media that speaks to me i like media that leaves an impact that i can feel even long after i have forgotten the plot i love media with a great cast and different characters with dynamics and their own stories, i like mystery i like emotional romance sometimes, i like psychological, i like some surreal movies, across media my favorites are interstellar, katawa shoujo, welcome to the nhk, steins gate, the colorless tsukuru tazaki, norwegian wood, heavenly forest, tsukihime. i like my mcs not to be like the best or the flashiest i like some flaw and brokenness to my mc but the people are still around him i like my loser mc and the perfect girl that comes to save him"

## 1. Soul Graph Construction (${harmonizeTime}ms)
\`\`\`json
${JSON.stringify(fetchedSoul.permanent_soul.soul_graph, null, 2)}
\`\`\`
**Guardrails Extracted:** ${JSON.stringify(fetchedSoul.permanent_soul.guardrails)}

## 2. Facet Targeting & Brief Generation (${briefTime}ms)
**Declared Vibe Focus:** "${selected_vibe_focus}"
**Search Brief Generated:**
> ${search_brief}

## 3. Vector Search Results (${searchTime}ms)
${candidatesList}

## 4. Editorial Decision (${evalTime}ms)
**Top Pick:** ${topCandidate.payload.title}
**Coda Blurb:** "${editorialDecision.top_pick.coda_blurb}"
**The Pitch:**
${editorialDecision.top_pick.pitch_paragraphs.join('\\n\\n')}

**Runner Ups:**
${runnerUpsList}
`;

  fs.writeFileSync('movie_e2e_test_report.md', report);
  console.log('\nReport written to e2e_test_report.md');
}

runE2ETest().catch(console.error);
