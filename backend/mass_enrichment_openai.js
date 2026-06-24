const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');
const searchService = require('./services/searchService');
const embeddingService = require('./services/embeddingService');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SEED_FILE = path.join(__dirname, 'data', 'massive_seed.json');

function generateUuid(key) {
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
}

const systemPrompt = `
You are the Coda Media Librarian. Your job is to perform a deep, exhaustive psychological and aesthetic extraction of a piece of media to power our "Media Brain" vector database.

You will receive a JSON object with:
- title + media_type: what the work is
- structured_data: genre tags, synopsis, studio/director/author info, ratings, release year, cast, and country of origin.
- community_snippets: real text from reviews and forum discussions by actual fans

Your job is to read this payload, and synthesize it into a highly structured JSON object capturing every "face" of the media.
Do NOT just use single words. Write dense, descriptive, emotionally honest sentences that truly capture the atmosphere and soul of the work. You MUST capture the deep lore, setting, subculture, and pacing dynamics.

Extract these exact 12 fields (as detailed string values):
1. "metadata_synthesis": The country/region (Japanese, Korean, etc.), release year, director/author, and studio, woven into a short cultural context.
2. "setting_and_subculture": The physical and cultural setting of the media. BE EXPLICIT. (e.g., "Early 2010s Akihabara otaku culture", "Late 1960s Tokyo student protests", "A dystopian cyberpunk slum").
3. "visual_tone_and_feel": Deeply describe the aesthetic, visual tone, and feel. Capture the actual atmosphere and vibe, not just a single word.
4. "media_era_tone": The cultural footprint and era.
5. "pacing_and_structure": How the pacing structurally functions. Be specific about pacing shifts!
6. "atmosphere_and_mood": The overarching mood and emotional weather.
7. "themes_and_messages": What the media actually conveys, the underlying psychological or philosophical messages.
8. "character_relationships": The interpersonal dynamics. Romantic dynamics, toxic vs healing, found-family, supporting cast dynamics.
9. "lead_character_type": Who is the protagonist?
10. "story_and_plot_type": The narrative structure.
11. "who_and_when": The Viewing Context. Do not say "Watch this when...". Instead, describe "the type of soul this should be for" and the specific life situation or emotional state.
12. "emotional_evocation": A raw, visceral description of what this media actually does to a person emotionally, drawn directly from the human consensus in the community snippets. Not an academic description, but the actual feeling it provokes.

Return ONLY a JSON object with these 12 exact keys.
`;

async function scrapeTitle(title, media_type) {
  const structuredMeta = await searchService.fetchMetadataForCandidate(title, media_type) || {};
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
      const rt = await searchService.scrapeForums(`${title} ${media_type} rottentomatoes review consensus`) || [];
      const imdb = await searchService.scrapeForums(`${title} ${media_type} imdb user review`) || [];
      const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
      communitySnippets = [...lb, ...forums, ...rt, ...imdb, ...wiki];
    }
  } catch (e) {
    console.warn(`  -> WARNING: Scraper error:`, e.message);
  }

  return {
    title,
    media_type,
    structured_data: structuredMeta,
    community_snippets: communitySnippets.slice(0, 10)
  };
}

async function synthesizeWithOpenAI(payload) {
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    response_format: { type: 'json_object' }
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    }
  });
  return JSON.parse(res.data.choices[0].message.content);
}

async function processTitle(item) {
  const { title, media_type, uuid } = item;
  console.log(`\n--- Processing: ${title} (${media_type}) ---`);
  
  try {
    // 1. Scrape
    console.log(`  -> Scraping...`);
    const payload = await scrapeTitle(title, media_type);
    
    // 2. Synthesize
    console.log(`  -> Synthesizing via OpenAI (gpt-4o-mini)...`);
    const synthesizedData = await synthesizeWithOpenAI(payload);
    
    // 3. Construct Semantic String
    let stockGenres = payload.structured_data?.genres || [];
    let stockTags = payload.structured_data?.tags || [];
    let stockRelease = payload.structured_data?.release_year || 'Unknown';
    let stockStudio = payload.structured_data?.studio || '';

    const semanticDescription = `
[Stock Metadata]: Genres: ${stockGenres.join(', ')} | Tags: ${stockTags.join(', ')} | Release: ${stockRelease}
[Metadata & Cultural Context]: ${synthesizedData.metadata_synthesis || ''}
[Setting & Subculture]: ${synthesizedData.setting_and_subculture || ''}
[Visual Tone & Feel]: ${synthesizedData.visual_tone_and_feel || ''}
[Media Era Tone]: ${synthesizedData.media_era_tone || ''}
[Pacing & Structure]: ${synthesizedData.pacing_and_structure || ''}
[Atmosphere & Mood]: ${synthesizedData.atmosphere_and_mood || ''}
[Themes & Messages]: ${synthesizedData.themes_and_messages || ''}
[Character Relationships]: ${synthesizedData.character_relationships || ''}
[Lead Character Type]: ${synthesizedData.lead_character_type || ''}
[Story & Plot Type]: ${synthesizedData.story_and_plot_type || ''}
[Who & When (The Soul Match)]: ${synthesizedData.who_and_when || ''}
[Emotional Evocation (Consensus)]: ${synthesizedData.emotional_evocation || ''}
    `.trim();

    // 4. Embed & Upsert
    console.log(`  -> Embedding & Upserting...`);
    const embeddingText = `Title: ${title}\nType: ${media_type}\n${semanticDescription}`;
    const vector = await embeddingService.embed(embeddingText);

    const qdrantPayload = {
      title: title,
      media_type: media_type,
      genres: stockGenres,
      tags: stockTags,
      release_year: stockRelease,
      studio: stockStudio,
      semantic_description: semanticDescription,
      key: `${media_type}:${title.toLowerCase()}`,
      indexed_at: new Date().toISOString()
    };
    
    await qdrantService.upsert('media_brain', uuid, vector, qdrantPayload);
    console.log(`  -> Success ✓ (${uuid})`);

  } catch (err) {
    console.error(`  -> FATAL error processing ${title}:`, err.message);
  }
}

async function run() {
  qdrantService.init();
  const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  console.log(`[OpenAIEnrichment] Loaded ${seedData.length} total seeds.`);

  let candidateBatch = [];
  for (const item of seedData) {
    const { title, media_type } = item;
    const key = `${media_type}:${title.toLowerCase()}`;
    const uuid = generateUuid(key);
    candidateBatch.push({ title, media_type, uuid });
  }

  const missingBatch = [];
  console.log(`[OpenAIEnrichment] Checking Qdrant for existing records...`);
  for (let i = 0; i < candidateBatch.length; i += 500) {
    const chunk = candidateBatch.slice(i, i + 500);
    const uuids = chunk.map(c => c.uuid);
    
    try {
      const existingPoints = await qdrantService.getPoints('media_brain', uuids);
      const existingUuids = new Set(existingPoints.map(p => p.id));
      const missing = chunk.filter(item => !existingUuids.has(item.uuid));
      missingBatch.push(...missing);
    } catch (e) {
      console.warn('Qdrant bulk check failed, treating chunk as missing', e.message);
      missingBatch.push(...chunk);
    }
  }

  if (missingBatch.length === 0) {
    console.log('[OpenAIEnrichment] No remaining titles found! Database is fully populated.');
    process.exit(0);
  }

  console.log(`[OpenAIEnrichment] Found ${missingBatch.length} missing titles. Starting pipeline...`);

  for (const item of missingBatch) {
    await processTitle(item);
    await delay(2500); // Polite rate limiting for scrapers
  }
  
  console.log(`[OpenAIEnrichment] All missing titles processed!`);
}

run().catch(console.error);
