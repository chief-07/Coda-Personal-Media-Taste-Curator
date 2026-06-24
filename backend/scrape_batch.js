const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');
const searchService = require('./services/searchService');

const BATCH_SIZE = 100;
const SEED_FILE = path.join(__dirname, 'data', 'massive_seed.json');
const PENDING_DIR = path.join(__dirname, 'data', 'pending_synthesis');
const COMPLETED_DIR = path.join(__dirname, 'data', 'completed_synthesis');

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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  qdrantService.init();

  if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
  if (!fs.existsSync(COMPLETED_DIR)) fs.mkdirSync(COMPLETED_DIR, { recursive: true });

  const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  console.log(`[ScrapeBatch] Loaded ${seedData.length} total seeds.`);

  const batch = [];
  
  let candidateBatch = [];
  for (const item of seedData) {
    const { title, media_type } = item;
    const key = `${media_type}:${title.toLowerCase()}`;
    const uuid = generateUuid(key);
    const pendingPath = path.join(PENDING_DIR, `${uuid}.json`);
    const completedPath = path.join(COMPLETED_DIR, `${uuid}.json`);

    // Check files
    if (fs.existsSync(pendingPath) || fs.existsSync(completedPath)) {
      continue;
    }
    candidateBatch.push({ title, media_type, uuid, pendingPath });
  }

  // Parallel Qdrant check in chunks of 500 to avoid hanging for minutes
  for (let i = 0; i < candidateBatch.length; i += 500) {
    if (batch.length >= BATCH_SIZE) break;
    
    const chunk = candidateBatch.slice(i, i + 500);
    const uuids = chunk.map(c => c.uuid);
    
    try {
      const existingPoints = await qdrantService.getPoints('media_brain', uuids);
      const existingUuids = new Set(existingPoints.map(p => p.id));
      
      const missing = chunk.filter(item => !existingUuids.has(item.uuid));
      batch.push(...missing);
    } catch (e) {
      console.warn('Qdrant bulk check failed, treating chunk as missing', e.message);
      batch.push(...chunk);
    }
  }
  
  // Trim to exact batch size
  batch.splice(BATCH_SIZE);

  if (batch.length === 0) {
    console.log('[ScrapeBatch] No remaining titles found! (Count: 0)');
    process.exit(0);
  }

  console.log(`[ScrapeBatch] Selected ${batch.length} titles for scraping...`);

  for (const item of batch) {
    const { title, media_type, uuid, pendingPath } = item;
    console.log(`\n--- Scraping: ${title} (${media_type}) ---`);

    try {
      console.log(`  -> Fetching structured metadata...`);
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
          const rt = await searchService.scrapeForums(`${title} ${media_type} rottentomatoes review consensus`) || [];
          const imdb = await searchService.scrapeForums(`${title} ${media_type} imdb user review`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...lb, ...forums, ...rt, ...imdb, ...wiki];
        } else if (media_type === 'visual novel') {
          const vndb = await searchService.fetchVNDBRecommendations([title]) || [];
          const forums = await searchService.scrapeForums(`${title} visual novel review reddit r/visualnovels`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...vndb, ...forums, ...wiki];
        } else if (media_type === 'book' || media_type === 'manga') {
          const forums = await searchService.scrapeForums(`${title} ${media_type} review emotional reddit site:reddit.com`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...forums, ...wiki];
        } else if (media_type === 'game') {
          const forums = await searchService.scrapeForums(`${title} game review emotional reddit site:reddit.com`) || [];
          const wiki = await searchService.fetchWikipediaData(title, media_type) || [];
          communitySnippets = [...forums, ...wiki];
        }
      } catch (e) {
        console.warn(`  -> WARNING: Scraper error:`, e.message);
      }

      const synthesisPayload = {
        title: title,
        media_type: media_type,
        uuid: uuid,
        structured_data: structuredMeta,
        community_snippets: communitySnippets.slice(0, 10)
      };

      fs.writeFileSync(pendingPath, JSON.stringify(synthesisPayload, null, 2));
      console.log(`  -> Wrote raw payload to: ${pendingPath}`);
      
      console.log(`[ScrapeBatch:Output] ${pendingPath}`);
      
    } catch(err) {
      console.error(`  -> FATAL error scraping ${title}:`, err.message);
    }

    await delay(3000); // Polite web scraping delay
  }
}

run().catch(console.error);
