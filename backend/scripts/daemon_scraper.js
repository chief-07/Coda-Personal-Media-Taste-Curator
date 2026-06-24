const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('../loadEnv');
const qdrantService = require('../services/qdrantService');
const searchService = require('../services/searchService');

const SEED_FILE = path.join(__dirname, '..', 'data', '10k_seed.json');
const PENDING_DIR = path.join(__dirname, '..', 'data', 'pending_synthesis');
const COMPLETED_DIR = path.join(__dirname, '..', 'data', 'completed_synthesis');

if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
if (!fs.existsSync(COMPLETED_DIR)) fs.mkdirSync(COMPLETED_DIR, { recursive: true });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function run() {
  qdrantService.init();
  const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  console.log(`[Daemon Scraper] Loaded ${seedData.length} total seeds.`);

  let candidateBatch = [];
  for (const item of seedData) {
    const { title, media_type } = item;
    const key = `${media_type}:${title.toLowerCase()}`;
    const uuid = generateUuid(key);
    candidateBatch.push({ title, media_type, uuid });
  }

  console.log(`[Daemon Scraper] Checking Qdrant for existing records...`);
  
  for (let i = 0; i < candidateBatch.length; i++) {
    const item = candidateBatch[i];
    const pendingPath = path.join(PENDING_DIR, `${item.uuid}.json`);
    const completedPath = path.join(COMPLETED_DIR, `${item.uuid}.json`);
    
    // Check if it's already in the pipeline
    if (fs.existsSync(pendingPath) || fs.existsSync(completedPath)) {
      continue;
    }

    // Check if it's in Qdrant (do a fast check)
    let isIndexed = false;
    try {
      const existing = await qdrantService.getPoints('media_brain', [item.uuid]);
      if (existing && existing.length > 0) isIndexed = true;
    } catch (e) {
      // ignore
    }

    if (isIndexed) continue;

    console.log(`\n[Daemon Scraper] Processing ${i+1}/${candidateBatch.length}: ${item.title}`);
    try {
      const payload = await scrapeTitle(item.title, item.media_type);
      payload.uuid = item.uuid;
      fs.writeFileSync(pendingPath, JSON.stringify(payload, null, 2));
      console.log(`  -> Written to pending_synthesis/${item.uuid}.json`);
      await delay(2500); // Polite rate limit
    } catch (e) {
      console.error(`  -> FATAL error processing ${item.title}:`, e.message);
    }
  }
  
  console.log(`[Daemon Scraper] All missing titles scraped! Daemon finishing.`);
}

run().catch(console.error);
