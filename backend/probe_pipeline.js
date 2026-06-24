require('./loadEnv');
const llmService = require('./services/llmService');
const userSoulService = require('./services/userSoulService');
const embeddingService = require('./services/embeddingService');
const qdrantService = require('./services/qdrantService');

// The e2e test user has a complete soul already saved in Qdrant
const TEST_USER_ID = 'e2e_fortune_001';

async function probe() {
  qdrantService.init();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  CODA PIPELINE PROBE — 3 consecutive movie runs');
  console.log('══════════════════════════════════════════════════════════\n');

  // First, check how many media items we have and get their media type breakdown
  console.log('[DB CHECK] Checking Qdrant media_brain...');
  const info = await qdrantService.client.getCollection('media_brain');
  console.log(`Total media points: ${info.points_count}`);

  // Sample a few random movies to check data quality
  const sampleResults = await qdrantService.search('media_brain',
    await embeddingService.embed('movie drama emotional Japanese'),
    5,
    { must: [{ key: "media_type", match: { value: "movie" } }] }
  );
  console.log('\n[DB SAMPLE] Sample movies in brain:');
  sampleResults.forEach(r => {
    const hasBlurb = !!r.payload.coda_blurb;
    const descLen = (r.payload.semantic_description || '').length;
    console.log(`  - "${r.payload.title}" | year=${r.payload.release_year} | genres=${JSON.stringify(r.payload.genres)} | desc_len=${descLen}`);
  });

  // Check data/pending_synthesis queue
  const fs = require('fs');
  const path = require('path');
  const pendingDir = path.join(__dirname, 'data', 'pending_synthesis');
  const completedDir = path.join(__dirname, 'data', 'completed_synthesis');
  let pendingCount = 0, completedCount = 0;
  try {
    pendingCount = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json')).length;
    completedCount = fs.readdirSync(completedDir).filter(f => f.endsWith('.json')).length;
  } catch(e) {}
  console.log(`\n[QUEUE] pending_synthesis: ${pendingCount} files | completed_synthesis: ${completedCount} files`);

  // Now run 3 recommendation cycles
  for (let run = 1; run <= 3; run++) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  RUN ${run} / 3`);
    console.log('─'.repeat(60));

    const soul = await userSoulService.getUserMemory(TEST_USER_ID);
    if (!soul.permanent_soul) {
      console.error('  ✗ Could not load soul for test user!');
      break;
    }
    const recentVibes = soul.transient_memory?.recentVibes || [];
    console.log(`  recentVibes stored: [${recentVibes.map(v => `"${v.substring(0,40)}..."`).join(', ')}]`);

    // Step 2: Synthesize brief
    const t0 = Date.now();
    const { selected_vibe_focus, aesthetic_anchors, search_brief } = await llmService.synthesizeSearchBrief(soul, 'movie');
    console.log(`\n  ► Vibe Focus:    "${selected_vibe_focus}"`);
    console.log(`  ► Era:           "${aesthetic_anchors.era || 'none'}"`);
    console.log(`  ► Origin:        "${aesthetic_anchors.cultural_origin || 'none'}"`);
    console.log(`  ► Genre:         "${aesthetic_anchors.genre_footprint || 'none'}"`);
    console.log(`  ► Brief (first 160 chars): "${search_brief.substring(0, 160)}..."`);
    console.log(`  ► Brief time: ${Date.now() - t0}ms`);

    // Step 3: Vector search
    const t1 = Date.now();
    const queryVector = await embeddingService.embed(search_brief);
    const rawResults = await qdrantService.search('media_brain', queryVector, 30, {
      must: [{ key: "media_type", match: { value: "movie" } }]
    });
    console.log(`\n  ► Qdrant returned ${rawResults.length} movies in ${Date.now() - t1}ms`);
    console.log('  ► Top 10 candidates:');
    rawResults.slice(0, 10).forEach((c, i) => {
      console.log(`     ${i+1}. "${c.payload.title}" [${c.payload.release_year || '?'}] score=${c.score.toFixed(3)}`);
    });

    // Step 4: Editorial decision
    const candidates = rawResults.slice(0, 10);
    const t2 = Date.now();
    const decision = await llmService.evaluateCandidates(candidates, soul, selected_vibe_focus);
    const top = candidates.find(c => c.id === decision.top_pick.id) || candidates[0];
    console.log(`\n  ► Editorial time: ${Date.now() - t2}ms`);
    console.log(`  ► TOP PICK:  "${top.payload.title}"`);
    console.log(`  ► BLURB:     "${decision.top_pick.coda_blurb}"`);
    const runners = (decision.runner_ups || []).map(id => candidates.find(c => c.id === id)).filter(Boolean);
    console.log(`  ► Runners:   ${runners.map(c => `"${c.payload.title}"`).join(', ')}`);

    // Persist vibe so next run sees it
    const updatedVibes = [selected_vibe_focus, ...recentVibes].slice(0, 5);
    await userSoulService.syncLivingMemory(TEST_USER_ID, {
      ...(soul.permanent_soul || {}),
      ...(soul.transient_memory || {}),
      recentVibes: updatedVibes,
    });
    console.log(`\n  ✓ Vibe saved to recentVibes (${updatedVibes.length} total)`);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  PROBE COMPLETE');
  console.log('══════════════════════════════════════════════════════════\n');
}

probe().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
