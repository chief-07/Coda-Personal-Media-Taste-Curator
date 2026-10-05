const { getClient, rememberFact, recallMemories } = require('../services/walrusMemoryService');
const { callGeminiChat } = require('../services/geminiClient');

const resonanceCache = new Map();

async function enrichTitleThematicContext(title, mediaType = 'work') {
  const key = `${mediaType}:${title.toLowerCase().trim()}`;
  if (resonanceCache.has(key)) return resonanceCache.get(key);

  const prompt = `You are Coda's artistic curator.
In ONE evocative, poetic statement (under 14 words), describe the core emotional feeling and psychological/thematic resonance of the ${mediaType} "${title}".
Focus on what moves the audience emotionally (e.g., "Cosmic isolation bridged by boundless father-daughter love across space-time", "Quiet bittersweet longing and missed destiny lingering across decades", "Philosophical descent into sanity and solitude on a fog-drenched island").

Return strictly JSON:
{
  "resonance": "Evocative emotional statement under 14 words"
}`;

  try {
    const res = await callGeminiChat({
      messages: [
        { role: 'system', content: 'You are Coda. Return strictly JSON.' },
        { role: 'user', content: prompt }
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0.4
    });

    let raw = res.choices[0].message.content.trim();
    if (raw.startsWith('```json')) raw = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    else if (raw.startsWith('```')) raw = raw.replace(/^```\s*/, '').replace(/\s*```$/, '');
    const data = JSON.parse(raw);
    const resonance = data.resonance || 'profound emotional atmosphere and resonant character pacing';
    resonanceCache.set(key, resonance);
    return resonance;
  } catch (err) {
    console.warn(`[Enrichment Error] Falling back for "${title}":`, err.message);
    const fallback = 'deep emotional nuance, memorable atmosphere, and authentic human connection';
    resonanceCache.set(key, fallback);
    return fallback;
  }
}

function extractBareTitle(text) {
  if (!text) return null;
  const trimmed = text.trim();
  
  // Case 1: Bare title string (e.g. "Interstellar", "Past Lives")
  if (trimmed.split(' ').length <= 4 && !trimmed.includes(':') && !trimmed.includes('Loved') && !trimmed.includes('Avoid')) {
    return trimmed;
  }

  // Case 2: Template anchor without rich thematic statement:
  // e.g. 'Favorite movie anchor: "Interstellar" (cherished taste reference)'
  // or 'Loved work: "The Lighthouse" (movie) (highly cherished taste anchor)'
  const match = trimmed.match(/(?:anchor|work):\s*"([^"]+)"/i) || trimmed.match(/"([^"]+)"/);
  if (match && !trimmed.includes('—') && (trimmed.includes('(cherished taste reference)') || trimmed.includes('(highly cherished taste anchor)'))) {
    return match[1];
  }

  return null;
}

async function runEnrichmentMigration() {
  console.log('====================================================');
  console.log('🦭 WALRUS PROTOCOL: RETROACTIVE MEMORY ENRICHMENT');
  console.log('====================================================');

  const client = await getClient();
  const namespacesResp = await client.listNamespaces().catch(err => {
    console.error('Failed to list namespaces:', err.message);
    return null;
  });

  const namespaces = namespacesResp?.namespaces || [];
  console.log(`Found ${namespaces.length} namespaces registered on Walrus.`);

  let totalUpgraded = 0;

  for (const nsObj of namespaces) {
    const ns = nsObj.id || nsObj.name;
    if (!ns || !ns.startsWith('coda_')) continue;

    // Detect media category namespaces
    const parts = ns.split('_');
    const category = parts[parts.length - 1]; // e.g. "movie", "anime", "book", "game"
    const validCats = ['movie', 'anime', 'book', 'game', 'tv', 'visualnovel'];

    if (!validCats.includes(category)) continue;

    console.log(`\n🔍 Inspecting namespace: ${ns} (Category: ${category})`);

    // Broad recall queries to harvest all stored titles in this namespace
    const hits = await recallMemories({
      query: 'anchor favorite masterpieces beloved titles stories',
      namespace: ns,
      limit: 10
    });

    const hits2 = await recallMemories({
      query: 'loved experienced watched read works',
      namespace: ns,
      limit: 10
    });

    // Deduplicate hits by blob_id or text
    const seenMap = new Map();
    [...hits, ...hits2].forEach(h => {
      const key = (h.text || h.content || '').trim();
      if (key && !seenMap.has(key)) seenMap.set(key, h);
    });

    const uniqueMemories = Array.from(seenMap.values());
    console.log(`  Found ${uniqueMemories.length} memories in ${ns}`);

    for (const mem of uniqueMemories) {
      const rawText = mem.text || mem.content || '';
      const bareTitle = extractBareTitle(rawText);

      if (bareTitle) {
        console.log(`  ✨ Detected legacy/bare title: "${bareTitle}" (from: "${rawText}")`);
        const resonance = await enrichTitleThematicContext(bareTitle, category);
        const enrichedFact = `Loved ${category} anchor: "${bareTitle}" — ${resonance}`;
        
        console.log(`  🚀 Writing enriched memory to Walrus: "${enrichedFact}"`);
        let res = null;
        let attempts = 0;
        while (!res && attempts < 3) {
          attempts++;
          try {
            res = await rememberFact(enrichedFact, ns);
            if (!res) await new Promise(r => setTimeout(r, 1200));
          } catch (err) {
            if (err.message?.includes('429')) {
              console.log('    ⏳ Rate limit hit, backing off 15s...');
              await new Promise(r => setTimeout(r, 15000));
            }
          }
        }
        
        if (res) {
          totalUpgraded++;
          // Also write a core personality connection to coda_{userId}_core
          const userId = parts.slice(1, parts.length - 1).join('_');
          if (userId) {
            const coreNs = `coda_${userId}_core`;
            const coreFact = `Deep emotional affinity for works like "${bareTitle}" (${resonance})`;
            await rememberFact(coreFact, coreNs).catch(() => {});
          }
        }

        // Rate limit throttle
        await new Promise(r => setTimeout(r, 600));
      } else {
        console.log(`  ✓ Memory already rich or non-title: "${rawText.substring(0, 50)}..."`);
      }
    }
  }

  console.log('\n====================================================');
  console.log(`✅ ENRICHMENT COMPLETE! Upgraded ${totalUpgraded} legacy Walrus memories.`);
  console.log('====================================================');
}

if (require.main === module) {
  runEnrichmentMigration()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = {
  enrichTitleThematicContext,
  runEnrichmentMigration
};
