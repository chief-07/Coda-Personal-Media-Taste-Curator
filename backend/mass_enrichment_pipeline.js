const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('./loadEnv');

const qdrantService = require('./services/qdrantService');
const searchService = require('./services/searchService');
const embeddingService = require('./services/embeddingService');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SEED_FILE = path.join(__dirname, 'data', 'massive_seed.json');

const crypto = require('crypto');
function generateUuid(key) {
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return [
    hash.substring(0, 8), hash.substring(8, 12), hash.substring(12, 16),
    hash.substring(16, 20), hash.substring(20, 32)
  ].join('-');
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function synthesizeWithGroq(scrapedData) {
  const prompt = `You are a Media Synthesizer. Analyze the following scraped data and perform an exhaustive psychological and aesthetic extraction into 12 facets.
Return ONLY valid JSON. No markdown wrappers, no explanations. Just the JSON object.

Data:
${JSON.stringify(scrapedData).substring(0, 5000)}

Structure to return:
{
  "title": "${scrapedData.title}",
  "media_type": "${scrapedData.media_type}",
  "year": "<extract or guess year>",
  "creators": ["<directors/authors/studios>"],
  "visual_tone": "<e.g., gritty neon, calm pastoral>",
  "era_and_setting": "<e.g., 90s cyberpunk, medieval fantasy>",
  "atmosphere": "<overall mood>",
  "themes": ["<theme1>", "<theme2>"],
  "character_dynamics": "<description of relationships>",
  "plot_archetype": "<e.g., coming of age, tragedy>",
  "supporting_cast_feel": "<vibe of side characters>",
  "human_sentiment": "<what people online feel about it>"
}`;

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
    });

    let content = response.data.choices[0].message.content;
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    return JSON.parse(content.substring(startIdx, endIdx + 1));
  } catch (err) {
    console.error(`[Groq Synthesis Error]:`, err.message);
    return null;
  }
}

async function run() {
  await qdrantService.init();

  const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  console.log(`[Pipeline] Loaded ${seedData.length} total seeds.`);

  for (const item of seedData) {
    const { title, media_type } = item;
    const key = `${media_type}:${title.toLowerCase()}`;
    const uuid = generateUuid(key);

    try {
      const existing = await qdrantService.getPoint('media_brain', uuid);
      if (existing) {
        continue; // Already processed!
      }
    } catch (e) {}

    console.log(`\n================================`);
    console.log(`Processing: ${title} (${media_type})`);
    
    // 1. SCRAPE
    console.log(`  -> Fetching metadata...`);
    const structuredMeta = await searchService.fetchMetadataForCandidate(title, media_type) || {};
    console.log(`  -> Fetching community text...`);
    let communitySnippets = [];
    try {
        if (media_type === 'anime') {
          const mal = await searchService.fetchMALReviews([title]) || [];
          const forums = await searchService.scrapeForums(`${title} anime review emotional reddit site:reddit.com`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...mal, ...forums, ...wiki];
        } else if (media_type === 'movie' || media_type === 'tv') {
          const lb = await searchService.scrapeLetterboxdReviews(title) || [];
          const forums = await searchService.scrapeForums(`${title} ${media_type} review emotional reddit site:reddit.com`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...lb, ...forums, ...wiki];
        } else if (media_type === 'visual novel') {
          const vndb = await searchService.fetchVNDBRecommendations([title]) || [];
          const forums = await searchService.scrapeForums(`${title} visual novel review reddit r/visualnovels`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...vndb, ...forums, ...wiki];
        } else {
          const forums = await searchService.scrapeForums(`${title} ${media_type} review emotional reddit site:reddit.com`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...forums, ...wiki];
        }
    } catch (e) {}

    const payload = { title, media_type, uuid, structured_data: structuredMeta, community_snippets: communitySnippets };

    // 2. SYNTHESIZE (GROQ)
    console.log(`  -> Synthesizing via Groq...`);
    const synthesis = await synthesizeWithGroq(payload);
    if (!synthesis) {
      console.log(`  -> Skipped due to synthesis failure.`);
      continue;
    }

    // 3. EMBED & UPSERT (OPENAI)
    console.log(`  -> Embedding & Upserting...`);
    const textToEmbed = JSON.stringify(synthesis);
    try {
      const vector = await embeddingService.embed(textToEmbed);
      await qdrantService.client.upsert('media_brain', {
        wait: true,
        points: [{
          id: uuid,
          vector: vector,
          payload: {
            title: title,
            media_type: media_type,
            structured_data: synthesis,
            raw_text: textToEmbed,
            source: 'mass_enrichment_pipeline'
          }
        }]
      });
      console.log(`  -> Success ✓`);
    } catch(e) {
      console.error(`  -> Upsert Failed:`, e.message);
    }

    await delay(2000); // polite delay
  }

  console.log('Pipeline fully complete! All items processed.');
}

run().catch(console.error);
