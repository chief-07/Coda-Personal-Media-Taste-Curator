const fs = require('fs');
const path = require('path');
require('./loadEnv');
const searchService = require('./services/searchService');

const PENDING_DIR = path.join(__dirname, 'data', 'test_pending');
if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
const COMPLETED_DIR = path.join(__dirname, 'data', 'test_completed');
if (!fs.existsSync(COMPLETED_DIR)) fs.mkdirSync(COMPLETED_DIR, { recursive: true });

const testTitles = [
  { title: "Ghost in the Shell", media_type: "anime" },
  { title: "Eternal Sunshine of the Spotless Mind", media_type: "movie" },
  { title: "Monster", media_type: "anime" }
];

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
  
  const filename = title.replace(/\s+/g, '_').toLowerCase() + '.json';
  fs.writeFileSync(path.join(PENDING_DIR, filename), JSON.stringify(payload, null, 2));
  console.log(`  -> Saved to ${filename}`);
}

async function run() {
  for (const item of testTitles) {
    await scrapeTitle(item.title, item.media_type);
  }
}

run().catch(console.error);
