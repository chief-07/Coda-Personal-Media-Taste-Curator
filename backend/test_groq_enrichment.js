const fs = require('fs');
const path = require('path');
require('./loadEnv');
const searchService = require('./services/searchService');
const { Groq } = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
`;

async function scrapeTitle(title, media_type) {
  const t0 = Date.now();
  console.log(`\n--- Scraping: ${title} (${media_type}) ---`);
  
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

  const payload = {
    title,
    media_type,
    structured_data: structuredMeta,
    community_snippets: communitySnippets.slice(0, 10)
  };
  
  const scrapeTime = Date.now() - t0;
  console.log(`  -> Scrape completed in ${scrapeTime}ms`);
  
  return { payload, scrapeTime };
}

async function synthesizeWithGroq(payload) {
  const t0 = Date.now();
  console.log(`  -> Synthesizing via Groq (llama-3.3-70b-versatile)...`);
  
  const response = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    model: 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' }
  });
  
  const synthTime = Date.now() - t0;
  console.log(`  -> Groq Synthesis completed in ${synthTime}ms`);
  
  return { 
    result: JSON.parse(response.choices[0].message.content),
    synthTime
  };
}

async function runTest() {
  console.log('=== GROQ ENRICHMENT PIPELINE TEST (ANTI-SLOP V2) ===');
  const SEED_FILE = path.join(__dirname, 'data', 'massive_seed.json');
  const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  
  const testTitles = [
    { title: "Ghost in the Shell", media_type: "anime" },
    { title: "Eternal Sunshine of the Spotless Mind", media_type: "movie" },
    { title: "Monster", media_type: "anime" }
  ];
  
  let report = `# Groq Enrichment Test Report (Anti-Slop V2)\n\n`;

  for (const item of testTitles) {
    const { payload, scrapeTime } = await scrapeTitle(item.title, item.media_type);
    
    try {
      const { result, synthTime } = await synthesizeWithGroq(payload);
      
      report += `## ${item.title} (${item.media_type})\n`;
      report += `**Scrape Time:** ${scrapeTime}ms\n`;
      report += `**Groq Synthesis Time:** ${synthTime}ms\n\n`;
      report += "```json\n" + JSON.stringify(result, null, 2) + "\n```\n\n";
      
    } catch(e) {
       console.error(`  -> Failed synthesis for ${item.title}:`, e.message);
    }
  }
  
  fs.writeFileSync('groq_test_report.md', report);
  console.log(`\nTest complete! Full report written to groq_test_report.md`);
}

runTest().catch(console.error);
