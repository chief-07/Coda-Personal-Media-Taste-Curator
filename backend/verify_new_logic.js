const axios = require('axios');
const fs = require('fs');

// The actual Fortune profile extracted from backend logs (last_session_dump.txt)
const REAL_PROFILE = {
  core_identity: "Fortune is an introspective 18-year-old who seeks profound narratives that explore love, loss, and the complexities of human experience. They value character-driven stories with diverse casts, rich backstories, and emotional depth, often gravitating towards content that challenges the norm. Their appreciation for psychological themes and romantic dynamics drives their taste. Prefers character-driven stories with emotional depth. Enjoys romance as a priority in stories. Enjoys slice of life and school settings. Open to fantasy as long as romance is prioritized. Enjoys character depth and backstory.",
  recent_context: "Looking for something emotionally resonant tonight.",
  guardrails: "Avoids generic, mass appeal content with no substance. Not a fan of generic isekai. No BL. No long series like One Piece unless they are peak quality. No recommendations for Solo Leveling.",
  local_context: "Evening on a weekday.",
  seen: ["Steins;Gate", "Monster", "ERASED", "Madoka Magica", "Monogatari Series", "Bunny Girl Senpai", "Welcome to the NHK", "Attack on Titan", "Fullmetal Alchemist: Brotherhood", "Fruits Basket", "Clannad"],
  not_for_me: ["Solo Leveling", "One Piece", "Naruto", "Dragon Ball"],
  watchlist: []
};

const path = require('path');
const SERVER_LOG = path.join(__dirname, 'server.log');

function getLogLines() {
  try {
    return fs.readFileSync(SERVER_LOG, 'utf8').replace(/\r\n/g, '\n').split('\n');
  } catch (_) { return []; }
}

function printPipelineTrace(lines) {
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;

    if (l.startsWith('[Profile]')) {
      const body = l.replace('[Profile]', '').trim();
      if (body.startsWith('core_identity:')) {
        const id = body.replace('core_identity:', '').trim();
        console.log('\n👤 PROFILE INPUT');
        console.log('  ' + id.slice(0, 200) + (id.length > 200 ? '...' : ''));
      } else if (body.startsWith('guardrails:')) {
        console.log('  🚫 Guardrails: ' + body.replace('guardrails:', '').trim());
      } else if (body.startsWith('seen')) {
        try {
          const arr = JSON.parse(body.replace(/^seen \(\d+\):/, '').trim());
          console.log('  📋 Seen list (' + arr.length + '): ' + arr.join(', '));
        } catch (_) {}
      } else if (body.startsWith('recent_context:')) {
        console.log('  💭 Context: ' + body.replace('recent_context:', '').trim());
      }
    } else if (l.includes('Step 1:')) {
      console.log('\n▶ STEP 1 — ROUTING & QUERY SELECTION');
    } else if (l.includes('Media type:') && l.includes('[Recommend]')) {
      console.log('  📺 ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Selected vibe focus')) {
      console.log('  🎯 ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Seed titles')) {
      console.log('  🌱 ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Queries:')) {
      const queryStr = l.replace('[Recommend]', '').replace('Queries:', '').trim();
      try {
        const queries = JSON.parse(queryStr);
        console.log('  📋 Search queries chosen by Coda:');
        queries.forEach((q, i) => console.log(`     ${i + 1}. ${q}`));
      } catch (_) {
        console.log('  📋 ' + l.replace('[Recommend]', '').trim());
      }
    } else if (l.includes('Step 2:')) {
      console.log('\n▶ STEP 2 — DATA GATHERING (per source)');
    } else if (l.includes('Source breakdown')) {
      console.log('  ┌─ Results by source:');
    } else if (l.startsWith('[Source]')) {
      const body = l.replace('[Source]', '').trim();
      const arrowIdx = body.lastIndexOf('→');
      if (arrowIdx > -1) {
        const sourceName = body.slice(0, arrowIdx).trim();
        const rest = body.slice(arrowIdx + 1).trim();
        const colonIdx = rest.indexOf(':');
        const count = rest.slice(0, colonIdx).trim();
        const titles = rest.slice(colonIdx + 1).trim();
        console.log(`  │  [${count}] ${sourceName}`);
        if (titles && titles !== '(none)') {
          const items = titles.split('", "').map(t => t.replace(/^"|"$/g, '').trim()).filter(Boolean);
          items.forEach(t => console.log(`  │       → "${t}"`));
        }
      }
    } else if (l.includes('Total snippets across')) {
      console.log('  └─ ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Excluding snippet') || l.includes('Hard-excluding')) {
      console.log('  ✗ ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Snippets after')) {
      console.log('  → ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Step 2.5:')) {
      console.log('\n▶ STEP 2.5 — CANDIDATE EXTRACTION & METADATA LOOKUP');
    } else if (l.includes('LLM extracted')) {
      const m = l.match(/LLM extracted (\d+) candidate titles: (.+)/);
      if (m) {
        try {
          const titles = JSON.parse(m[2]);
          console.log(`  🔍 LLM extracted ${m[1]} candidates:`);
          titles.forEach(t => console.log(`     • ${t}`));
        } catch (_) { console.log('  ' + l.replace('[Recommend]', '').trim()); }
      }
    } else if (l.startsWith('[Metadata]')) {
      console.log('  ' + l);
    } else if (l.includes('API metadata empty') || l.includes('LLM fallback')) {
      console.log('  ⚠  ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('verified candidates passed')) {
      console.log('\n  → ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Step 3:')) {
      console.log('\n▶ STEP 3 — LLM SCORING (guardrails interpreted contextually)');
    } else if (l.includes('Selected picks')) {
      console.log('  🏆 ' + l.replace('[Recommend]', '').trim());
    } else if (l.includes('Step 4:')) {
      console.log('\n▶ STEP 4 — ASSET FETCHING');
    } else if (l.includes('Pipeline complete')) {
      console.log('\n✅ Pipeline complete.');
    }
  }
}

async function runTest(mediaType, label, extraProfile = {}) {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  TEST: ${label}`);
  console.log(`${'═'.repeat(72)}`);

  const payload = {
    ...REAL_PROFILE,
    requested_media_type: mediaType,
    ...extraProfile,
    core_identity: REAL_PROFILE.core_identity + (extraProfile.specific_tastes
      ? `. Specific Tastes in ${label}: ${extraProfile.specific_tastes}`
      : '')
  };
  delete payload.specific_tastes;

  const linesBefore = getLogLines().length;
  const start = Date.now();

  let response;
  try {
    response = await axios.post('http://127.0.0.1:8080/api/recommend', payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 90000
    });
  } catch (e) {
    console.error('❌ Request failed:', e.response ? e.response.data : e.message);
    return;
  }

  const duration = Date.now() - start;
  const newLines = getLogLines().slice(linesBefore);

  console.log(`\n────────── SERVER PIPELINE TRACE (${(duration/1000).toFixed(1)}s) ──────────`);
  printPipelineTrace(newLines);

  const rec = response.data;
  console.log(`\n${'─'.repeat(72)}`);
  console.log('📌 FINAL RECOMMENDATION');
  console.log(`${'─'.repeat(72)}`);
  console.log(`  Title      : ${rec.title}`);
  console.log(`  Media type : ${rec.media_type}`);
  console.log(`  Coda blurb : ${rec.coda_blurb}`);
  console.log(`  Poster     : ${rec.poster_url ? '✅ found' : '❌ missing'}`);
  console.log(`  OST        : ${rec.ost_url ? '✅ found' : '❌ missing'}`);
}

async function main() {
  const cachePath = path.join(__dirname, 'cache', 'search_cache.json');
  if (fs.existsSync(cachePath)) {
    try {
      fs.unlinkSync(cachePath);
      console.log('🧹 Cache file deleted to force a fresh test run.');
    } catch (err) {
      console.warn('⚠️ Could not delete cache file:', err.message);
    }
  }

  console.log('\n🔬 CODA REAL PROFILE — FULL PIPELINE TEST');
  console.log('   Profile: Fortune (18yo, psychological/romance depth)');
  console.log('   Cache: CLEARED — all sources hit fresh\n');

  // Anime
  await runTest('anime', 'Anime', {
    specific_tastes: "Loves Steins;Gate (humor + emotional depth), Monster, Monogatari series, Bunny Girl Senpai, Madoka Magica, Welcome to NHK. Enjoys anime from 2000s–2010s. Gravitates toward psychological, emotional, character-driven shows."
  });

  // Movie
  await runTest('movie', 'Movie', {
    specific_tastes: "Loves sad emotional Japanese movies that explore serious themes. Appreciates films with profound emotional resonance, complex characters, and bittersweet endings."
  });

  // Visual Novel
  await runTest('visualnovel', 'Visual Novel', {
    specific_tastes: "Loves Katawa Shoujo (especially Hanako route) and Tsukihime (Ciel route). Prefers romance-focused VNs with school settings, slice of life, and character vulnerability. Fantasy ok if romance is primary. No BL."
  });

  // Book
  await runTest('book', 'Book', {
    specific_tastes: "Enjoys books with emotional depth, character-driven narratives, love and loss themes. Gravitates toward coming-of-age stories, psychological fiction, and literary fiction with diverse casts."
  });
}

main();
