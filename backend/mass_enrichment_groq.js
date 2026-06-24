const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');
const searchService = require('./services/searchService');
const embeddingService = require('./services/embeddingService');
const { Groq } = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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

Your job is to synthesize this into a highly structured JSON object capturing every "face" of the media.

CRITICAL ANTI-SLOP INSTRUCTIONS:
1. You MUST write in short, punchy, fragmented sentences. DO NOT write massive run-on sentences.
2. Vary your sentence lengths. Use periods. 
3. DO NOT use generic AI buzzwords. The following words are BANNED: "masterful blend", "profound", "delving into", "tapestry", "testament to", "seamlessly", "at its core", "unapologetic", "nuanced", "overarching", "transcends".
4. Write like a gritty, cynical, deeply emotional film critic. Be raw and visceral. Do NOT sound like an AI assistant.
5. Ground your descriptions in specific details from the media, rather than vague generalizations.
6. YOU MUST DEEPLY STUDY AND MIMIC THE "GOLD STANDARD EXAMPLE" PROVIDED BELOW. Mirror its pacing, its emotional intensity, and its exact vocabulary style.
7. CRITICAL INSTRUCTION: The <GOLD STANDARD EXAMPLE> is strictly for TONAL and STRUCTURAL reference. DO NOT copy any specific details, characters, or plot points from "Eternal Sunshine of the Spotless Mind" into the target media's synthesis. The target media MUST only reflect its own plot, characters, and tone.

Ensure the first sentence of metadata_synthesis explicitly declares the format, era, origin, and genre.

Extract these exact 12 fields (as detailed string values):
1. "metadata_synthesis": The country/region, release year, director/author, and studio, woven into a short cultural context.
2. "setting_and_subculture": The physical and cultural setting of the media. BE EXPLICIT.
3. "visual_tone_and_feel": Deeply describe the aesthetic, visual tone, and feel. Capture the actual atmosphere and vibe, not just a single word.
4. "media_era_tone": The cultural footprint and era.
5. "pacing_and_structure": How the pacing structurally functions. Be specific about pacing shifts!
6. "atmosphere_and_mood": The overarching mood and emotional weather.
7. "themes_and_messages": What the media actually conveys, the underlying psychological or philosophical messages.
8. "character_relationships": The interpersonal dynamics. Romantic dynamics, toxic vs healing, found-family, supporting cast dynamics.
9. "lead_character_type": Who is the protagonist?
10. "story_and_plot_type": The narrative structure.
11. "who_and_when": The Viewing Context. Describe "the type of soul this should be for" and the specific life situation or emotional state.
12. "emotional_evocation": A raw, visceral description of what this media actually does to a person emotionally, drawn directly from the human consensus in the community snippets.

Return ONLY a JSON object with these 12 exact keys.

<GOLD STANDARD EXAMPLE: "Eternal Sunshine of the Spotless Mind">
{
  "metadata_synthesis": "A 2004 American science fiction romantic drama directed by Michel Gondry and written by Charlie Kaufman, standing as a hallmark of early 2000s independent psychological cinema.",
  "setting_and_subculture": "Early 2000s East Coast American winter, moving between snowy beaches, mundane suburban apartments, and the surreal, crumbling architecture of a decaying mind. Captures a lo-fi indie-quirk subculture defined by eccentric hair dye, thrift store aesthetics, and analog technology masquerading as futuristic.",
  "visual_tone_and_feel": "A dreamy, lo-fi surrealism that feels like flipping through a dissolving scrapbook. Practical effects and distorted perspectives create a visceral sense of memory decay, characterized by dim lighting, faded colors, cold winter blues, and sudden, disorienting shifts in reality where faces blur and rooms collapse.",
  "media_era_tone": "The pinnacle of 2000s indie cinema melancholy. It established a cultural footprint as the quintessential 'hipster heartbreak' movie, heavily influencing a generation's understanding of romantic fatalism and directly inspiring subsequent pop culture, music, and the 'manic pixie dream girl' archetype (though subverting it).",
  "pacing_and_structure": "A nonlinear, recursive structure that moves backwards through time and inward through consciousness. The pacing mirrors the frantic, desperate scramble of a man trying to outrun his own mind—starting with disorienting fragmentation, accelerating into a chaotic chase sequence through memories, and resolving into quiet, devastating acceptance.",
  "atmosphere_and_mood": "Deeply melancholic, intimately cold, and quietly desperate. It carries the emotional weight of waking up from a dream you desperately want to return to, wrapped in the bleak, frosty isolation of a New York winter morning.",
  "themes_and_messages": "A psychological exploration of memory, pain, and the necessity of suffering in the human experience. It argues that attempting to sterilize our lives of heartbreak only bankrupts our souls, suggesting that love is inherently flawed and cyclical, yet fundamentally worth the inevitable pain it brings.",
  "character_relationships": "A brutally honest depiction of a deeply flawed, ultimately doomed, yet profoundly magnetic romance. It dissects the trajectory of love from intoxicating idealization to toxic resentment, exploring the friction between a withdrawn, timid man and a volatile, impulsive woman who refuses to be simplified into a male fantasy.",
  "lead_character_type": "A deeply introverted, emotionally withdrawn, and painfully ordinary man grappling with intense regret and desperation, paired against an intensely expressive, impulsive, and self-destructive woman.",
  "story_and_plot_type": "A surreal psychological labyrinth and nonlinear tragicomedy. It functions as an internal heist movie where the protagonist is both the victim and the saboteur, racing against an unstoppable procedural erasure to salvage fragments of his own identity.",
  "who_and_when": "For the heartbroken soul seeking permission to grieve rather than forget. A necessary companion for those standing in the wreckage of a significant relationship, grappling with regret, or anyone who has ever wished they could excise a painful memory, only to realize the pain is structurally load-bearing to their identity.",
  "emotional_evocation": "A devastating, beautiful rupture of the heart. It evokes the visceral, breathless panic of losing something precious, followed by a profound, tear-soaked catharsis. It leaves the viewer aching, acutely aware of their own emotional scars, yet deeply grateful for having felt deeply enough to earn them."
}
</GOLD STANDARD EXAMPLE>
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
    } else if (media_type === 'visual_novel') {
      const forums = await searchService.scrapeForums(`${title} visual novel review emotional reddit site:reddit.com`) || [];
      const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
      communitySnippets = [...forums, ...wiki];
    } else if (media_type === 'manga') {
      const forums = await searchService.scrapeForums(`${title} manga review emotional reddit site:reddit.com`) || [];
      const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
      communitySnippets = [...forums, ...wiki];
    } else if (media_type === 'book') {
      const gr = await searchService.scrapeForums(`${title} book goodreads review consensus`) || [];
      const forums = await searchService.scrapeForums(`${title} book review emotional reddit site:reddit.com`) || [];
      const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
      communitySnippets = [...gr, ...forums, ...wiki];
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

async function synthesizeWithGroq(payload) {
  const response = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    model: 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' }
  });
  return JSON.parse(response.choices[0].message.content);
}

async function processTitle(item) {
  const { title, media_type, uuid } = item;
  console.log(`\n--- Processing: ${title} (${media_type}) ---`);
  
  try {
    // 1. Scrape
    console.log(`  -> Scraping...`);
    const payload = await scrapeTitle(title, media_type);
    
    // 2. Synthesize
    console.log(`  -> Synthesizing via Groq...`);
    const synthesizedData = await synthesizeWithGroq(payload);
    
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
  console.log(`[GroqEnrichment] Loaded ${seedData.length} total seeds.`);

  let candidateBatch = [];
  for (const item of seedData) {
    const { title, media_type } = item;
    const key = `${media_type}:${title.toLowerCase()}`;
    const uuid = generateUuid(key);
    candidateBatch.push({ title, media_type, uuid });
  }

  const missingBatch = [];
  console.log(`[GroqEnrichment] Checking Qdrant for existing records...`);
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
    console.log('[GroqEnrichment] No remaining titles found! Database is fully populated.');
    process.exit(0);
  }

  console.log(`[GroqEnrichment] Found ${missingBatch.length} missing titles. Starting pipeline...`);

  for (const item of missingBatch) {
    await processTitle(item);
    await delay(2500); // Polite rate limiting for scrapers
  }
  
  console.log(`[GroqEnrichment] All missing titles processed!`);
}

run().catch(console.error);
