const llmService = require('./services/llmService');
const userSoulService = require('./services/userSoulService');
const embeddingService = require('./services/embeddingService');
const qdrantService = require('./services/qdrantService');
const fs = require('fs');
const path = require('path');
require('./loadEnv');

const lovedTitles = [
  "Oshi No Ko", "Rascal Does Not Dream of Bunny Girl Senpai", "Kokoro Connect",
  "Love Letter", "Death Note", "Norwegian Wood", "My Teen Romantic Comedy SNAFU",
  "Sisterhood", "The Pet Girl of Sakurasou", "Bakemonogatari",
  "Colorless Tsukuru Tazaki and His Years of Pilgrimage", "Perfect Blue",
  "The Melancholy of Haruhi Suzumiya", "Freiren", "Kaguya-sama: Love is War",
  "No Longer Human", "All About Lily Chou-Chou", "My Tomorrow, Your Yesterday",
  "Your Name.", "Violet Evergarden", "I Want to Eat Your Pancreas",
  "Welcome to the N-H-K", "Sputnik Sweetheart", "Blue Spring", "Katawa Shoujo",
  "Hyouka", "Anohana: The Flower We Saw That Day", "Charlotte",
  "Maquia: When the Promised Flower Blooms", "Chuunibyou demo Koi ga Shitai!",
  "DARLING in the FRANXX", "Takopi's Original Sin", "Dororo", "Kafka on the Shore",
  "Attack on Titan", "Wolf Children", "The Girl Who Leapt Through Time",
  "Plastic Memories", "Ride Your Wave", "The Wind Rises", "In This Corner of the World",
  "Sayonara no Asa ni Yakusoku no Hana wo Kazarou", "Crying Out Love in the Center of the World",
  "Hotarubi no Mori e", "Omoide Poroporo", "Sennen Joyuu", "Sen to Chihiro no Kamikakushi",
  "Tsukihime", "Se7en", "Toki wo Kakeru Shoujo", "Kono Sekai no Katasumi ni",
  "Sayonara Zetsubou Sensei", "Josee to Tora to Sakana-tachi", "Only Yesterday", "Weathering with You"
];

const NEIGHBORHOOD_CACHE_DIR = path.join(__dirname, 'cache/neighborhoods');
if (!fs.existsSync(NEIGHBORHOOD_CACHE_DIR)) {
  fs.mkdirSync(NEIGHBORHOOD_CACHE_DIR, { recursive: true });
}

// ── Content Guardrail Blocklists & Helpers ──────────────────────────────────
const CONTENT_SIGNAL_BLOCKLISTS = [
  {
    signals: ['christian', 'religious', 'faith-based', 'faith based', 'wholesome', 'family-friendly', 'family friendly', 'clean content', 'no adult', 'no explicit', 'no sexual', 'no 18+', 'no mature content'],
    blocked: ['erotica', 'erotic', 'eroge', 'adult', '18+', 'hentai', 'explicit', 'sexual content', 'nudity', 'ecchi', 'sexually explicit', 'pornographic', 'nsfw', 'eroticism', 'softcore', 'hardcore', 'adult content']
  },
  {
    signals: ['no gore', 'no violence', 'no guro', 'avoid violence', 'avoid gore', 'no graphic violence', 'no blood'],
    blocked: ['gore', 'guro', 'graphic violence', 'extreme violence', 'body horror', 'torture', 'snuff', 'splatter']
  },
  {
    signals: ['no horror', 'avoid horror', 'not horror'],
    blocked: ['horror', 'psychological horror', 'survival horror', 'terror', 'disturbing']
  },
  {
    signals: ['no ntr', 'no cheating', 'no netorare', 'avoid ntr'],
    blocked: ['ntr', 'netorare', 'netori', 'cheating', 'cuckold']
  },
  {
    signals: ['no bl', 'no yaoi', 'no boys love', 'no boyslove', 'no male romance'],
    blocked: ['bl', 'yaoi', 'boys love', 'male x male', 'shounen ai', 'shounen-ai']
  },
  {
    signals: ['no gl', 'no yuri', 'no girls love', 'no girlslove', 'no female romance'],
    blocked: ['gl', 'yuri', 'girls love', 'shoujo ai', 'shoujo-ai']
  },
];

const DEFAULT_BLOCKED_TERMS = [
  'erotica', 'erotic', 'eroge', 'adult', '18+', 'hentai', 'explicit', 'sexual content', 'nudity', 'ecchi', 'sexually explicit', 'pornographic', 'nsfw', 'eroticism', 'softcore', 'hardcore', 'adult content'
];

const tagMatchesBlockedTerm = (tag, blockedTerm) => {
  if (tag === blockedTerm) return true;
  if (!tag.includes(blockedTerm)) return false;
  let pos = tag.indexOf(blockedTerm);
  while (pos !== -1) {
    const charBefore = pos > 0 ? tag[pos - 1] : '';
    const charAfter = pos + blockedTerm.length < tag.length ? tag[pos + blockedTerm.length] : '';
    const isBeforeAlphanumeric = /[a-z0-9\-]/i.test(charBefore);
    const isAfterAlphanumeric = /[a-z0-9\-]/i.test(charAfter);
    if (!isBeforeAlphanumeric && !isAfterAlphanumeric) return true;
    pos = tag.indexOf(blockedTerm, pos + 1);
  }
  return false;
};

const filterCandidatesBySafetyAndGuardrails = (candidates, guardrailsString) => {
  const activeBlockedTerms = new Set(DEFAULT_BLOCKED_TERMS);
  
  if (guardrailsString) {
    const guardrailsLower = guardrailsString.toLowerCase();
    for (const rule of CONTENT_SIGNAL_BLOCKLISTS) {
      const signalTriggered = rule.signals.some(sig => guardrailsLower.includes(sig));
      if (signalTriggered) {
        for (const term of rule.blocked) {
          activeBlockedTerms.add(term.toLowerCase());
        }
      }
    }
  }

  return candidates.filter(candidate => {
    const payload = candidate.payload || {};
    const allTags = [
      ...(payload.genres || []),
      ...(payload.tags || []),
    ].map(t => (t || '').toLowerCase());

    const blocked = allTags.find(tag => {
      return [...activeBlockedTerms].some(blockedTerm => tagMatchesBlockedTerm(tag, blockedTerm));
    });

    if (blocked) {
      console.log(`[SafetyFilter] ✗ Dropping "${payload.title}" — tag/genre "${blocked}" violates guardrails.`);
      return false;
    }
    return true;
  });
};

async function runE2ETest() {
  console.log('--- STARTING FORTUNE 10-BATCH E2E TEST ---');
  await qdrantService.init();

  const currentMemory = {
    globalIdentity: [],
    categoryProfiles: {},
    seen: [],
    notForMe: [],
    watchlist: [],
    loved_titles: lovedTitles,
    recentContext: '',
    contextualState: {
      timeOfDay: "Tuesday morning, 8:00 AM",
      currentMood: "Exhausted, anxious, fragile before work"
    }
  };

  const userId = 'fortune_stress_003';
  let mdReport = `# Fortune's 10-Batch Test Results\n\n`;

  console.log('\n[1] Harmonizing Global Soul Graph...');
  const harmonizationResult = await llmService.harmonizeAllMemory(currentMemory);
  const fullMemory = {
    ...currentMemory,
    globalIdentity: harmonizationResult.global_identity_overwrite || [],
    categoryProfiles: harmonizationResult.category_profiles_overwrite || currentMemory.categoryProfiles,
    soul_graph: harmonizationResult.soul_graph || null,
  };

  await userSoulService.syncLivingMemory(userId, fullMemory);
  let fetchedSoul = await userSoulService.getUserMemory(userId);

  mdReport += `## The Generated Soul Graph\n`;
  mdReport += `This graph was generated by reading the DNA of all 55 loved titles.\n\n`;
  mdReport += "```json\n" + JSON.stringify(fetchedSoul.permanent_soul.soul_graph, null, 2) + "\n```\n\n";

  // Raw Centroid Search (Mapping the Loved Media Net)
  console.log('\n[1.5] Mapping the Loved Media Net (Raw Centroid Search)...');
  const soulVector = fetchedSoul.soul_vector;
  if (soulVector) {
    const rawNet = await qdrantService.search('media_brain', soulVector, 20);
    mdReport += `## Raw Centroid Mapping (The "Net")\n`;
    mdReport += `These are the top 20 closest titles mathematically mapped to the center of Fortune's soul graph, bypassing all LLM filters.\n\n`;
    rawNet.forEach((c, i) => {
      mdReport += `${i+1}. **${c.payload.title}** (${c.payload.media_type}) - Score: ${c.score.toFixed(3)}\n`;
    });
    mdReport += `\n---\n\n`;
  }

  async function runBatch(mediaType, batchIndex) {
    console.log(`\n--- Running ${mediaType.toUpperCase()} Batch ${batchIndex} ---`);
    mdReport += `## ${mediaType.toUpperCase()} Batch ${batchIndex}\n`;

    const { selected_vibe_focus, aesthetic_anchors, search_brief } = await llmService.synthesizeSearchBrief(fetchedSoul, mediaType);
    
    mdReport += `### 1. Phantom Document (Search Brief)\n`;
    mdReport += `**Selected Vibe Focus:** ${selected_vibe_focus}\n\n`;
    mdReport += "```text\n" + search_brief + "\n```\n\n";

    const queryVector = await embeddingService.embed(search_brief);
    const filter = { must: [{ key: "media_type", match: { value: mediaType } }] };
    
    // ── Global Vector Search (No Net) ──
    console.log(`[Pipeline] Running global search on media_brain for: ${mediaType}...`);
    let rawResults = await qdrantService.search('media_brain', queryVector, 150, filter, true);

    // Apply content safety/NSFW filtering by default and based on user guardrails
    const guardrailsList = fetchedSoul.permanent_soul?.soul_graph?.guardrails || [];
    rawResults = filterCandidatesBySafetyAndGuardrails(rawResults, guardrailsList.join(', '));
    
    // Slice top 30 after safety filtering
    rawResults = rawResults.slice(0, 30);
    
    const recentlyRecommended = fetchedSoul.transient_memory?.recentlyRecommended || [];
    let candidates = rawResults.filter(c => !recentlyRecommended.includes(c.payload.title)).slice(0, 10);

    mdReport += `### 2. Candidate Pool (from Qdrant)\n`;
    candidates.forEach((c, i) => {
      mdReport += `${i+1}. ${c.payload.title} (Score: ${c.score.toFixed(3)})\n`;
    });
    mdReport += `\n`;

    const editorialDecision = await llmService.evaluateCandidates(candidates, fetchedSoul, selected_vibe_focus);
    
    mdReport += `### 3. The Picks (Simulated App Output)\n`;
    
    const topCandidate = candidates.find(c => c.id === editorialDecision.top_pick.id) || candidates[0];
    mdReport += `**🎯 TOP PICK: ${topCandidate.payload.title}**\n`;
    mdReport += `> **Coda Blurb:** "${editorialDecision.top_pick.coda_blurb}"\n\n`;
    mdReport += `${editorialDecision.top_pick.pitch_paragraphs.join('\n\n')}\n\n`;
    
    mdReport += `**Runner-Ups (App's secondary options):**\n`;
    const newRecs = [topCandidate.payload.title];
    editorialDecision.runner_ups.forEach(id => {
      const ru = candidates.find(c => c.id === id);
      if (ru) {
        mdReport += `- ${ru.payload.title}\n`;
        newRecs.push(ru.payload.title);
      }
    });
    mdReport += `\n---\n\n`;

    const updatedVibes = [selected_vibe_focus, ...(fetchedSoul.transient_memory?.recentVibes || [])].slice(0, 5);
    const updatedRecs = [...new Set([...newRecs, ...recentlyRecommended])].slice(0, 15);
    
    const updatedMemory = {
      ...(fetchedSoul.permanent_soul || {}),
      ...(fetchedSoul.transient_memory || {}),
      recentVibes: updatedVibes,
      recentlyRecommended: updatedRecs
    };
    
    await userSoulService.syncLivingMemory(userId, updatedMemory);
    fetchedSoul = await userSoulService.getUserMemory(userId);
  }

  for (let i = 1; i <= 2; i++) {
    await runBatch('anime', i);
  }

  for (let i = 1; i <= 2; i++) {
    await runBatch('movie', i);
  }

  fs.writeFileSync('C:/Users/USER/.gemini/antigravity/brain/353193fb-c0aa-4963-975a-34af33e73276/fortune_final_batch.md', mdReport);
  console.log('--- ALL BATCHES COMPLETE. REPORT WRITTEN. ---');
  process.exit(0);
}

runE2ETest().catch(console.error);
