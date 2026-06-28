const crypto = require('crypto');
const qdrantService = require('./qdrantService');
const embeddingService = require('./embeddingService');
const searchService = require('./searchService');
const llmService = require('./llmService');

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

class MediaEnrichmentService {
  /**
   * Enriches a single title and upserts it to Qdrant.
   * Skips if it already exists in the vector database.
   */
  async enrichSingleTitle(title, media_type) {
    if (!title || !media_type) return false;

    const key = `${media_type}:${title.toLowerCase()}`;
    const uuid = generateUuid(key);

    console.log(`[EnrichmentService] Enriching: ${title} (${media_type})`);

    // 1. Check if already exists (by UUID or Title/Alias match)
    try {
      const existingById = await qdrantService.getPoint('media_brain', uuid);
      if (existingById) {
        console.log(`  -> Already exists in Qdrant (by UUID). Skipping.`);
        return 'ALREADY_EXISTS';
      }
      
      const existingByTitle = await qdrantService.searchByTitle('media_brain', title, false);
      if (existingByTitle) {
        console.log(`  -> Already exists in Qdrant (by Title/Alias match). Skipping.`);
        return 'ALREADY_EXISTS';
      }
    } catch (e) {
      // Not found is expected
    }

    try {
      // 2. Fetch Structured Metadata
      console.log(`  -> Fetching structured metadata...`);
      const structuredMeta = await searchService.fetchMetadataForCandidate(title, media_type) || {};

      // 3. Fetch Community Text
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

      if (communitySnippets.length === 0) {
        console.log(`  -> ERROR: No community text found for [${title}]. Aborting enrichment to prevent LLM hallucination.`);
        return false;
      } else {
        console.log(`  -> Gathered ${communitySnippets.length} snippets`);
      }

      // 4. Build Synthesis Payload
      const synthesisPayload = {
        title: title,
        media_type: media_type,
        structured_data: structuredMeta,
        community_snippets: communitySnippets.slice(0, 10)
      };

      // 5. Generate Semantic Description
      console.log(`  -> Synthesizing semantic description...`);
      const { semanticDescription, aliases } = await llmService.generateMediaDescription(synthesisPayload);

      // 6. Generate Embedding
      console.log(`  -> Embedding...`);
      const embeddingText = `Title: ${title}\nType: ${media_type}\n${semanticDescription}`;
      const vector = await embeddingService.embed(embeddingText);

      // 7. Upsert to Qdrant
      console.log(`  -> Upserting to Qdrant...`);
      const payload = {
        title: title,
        media_type: media_type,
        genres: structuredMeta.genres || [],
        tags: structuredMeta.tags || [],
        release_year: structuredMeta.release_year || '',
        studio: structuredMeta.studio || '',
        semantic_description: semanticDescription,
        aliases: aliases || [],
        key: key,
        indexed_at: new Date().toISOString()
      };
      
      await qdrantService.upsert('media_brain', uuid, vector, payload);
      console.log(`  -> Success ✓`);
      return true;

    } catch (e) {
      console.error(`  -> ERROR processing ${title}:`, e.message);
      return false;
    }
  }

  /**
   * "Mycelium Crawl": Scrapes actual community lists for similar titles and drops them into the pipeline queue.
   */
  async enrichTitleAndNeighbors(title, media_type) {
    console.log(`[Mycelium] Starting autonomous network growth for: ${title}`);
    
    let neighbors = [];
    try {
      if (media_type === 'anime') {
        const malRecs = await searchService.fetchMALRecommendations([title]);
        neighbors = malRecs.map(r => r.title);
      } else if (media_type === 'movie' || media_type === 'tv') {
        const lbSim = await searchService.scrapeLetterboxdSimilar(title);
        neighbors = lbSim.map(r => r.title);
      } else if (media_type === 'visual novel') {
        // We can just use searchService.fetchVNDBRecommendations if it exists, or scrapeForums
        const vndbRecs = await searchService.fetchVNDBRecommendations([title]) || [];
        neighbors = vndbRecs.map(r => r.title);
      }
    } catch (e) {
      console.error(`[Mycelium] Error scraping neighbors for ${title}:`, e.message);
    }
    
    // Limit to top 5 similar so it doesn't exponentially explode
    const allDiscovered = [title, ...neighbors.slice(0, 5)];
    console.log(`[Mycelium] Discovered ${allDiscovered.length} organically related titles:`, allDiscovered);

    // Inject directly into the Qdrant Tier 2 Priority Queue
    try {
      const qdrantService = require('./qdrantService');
      let added = 0;
      for (const t of allDiscovered) {
        if (!t || typeof t !== 'string') continue;
        
        await qdrantService.pushToQueue(t, media_type, 2);
        added++;
      }
      
      if (added > 0) {
        console.log(`[Mycelium] Injected ${added} new titles to Qdrant Tier 2 (Mycelium Queue)!`);
      }
    } catch (err) {
      console.error(`[Mycelium] Error injecting to Qdrant queue:`, err.message);
    }
  }
}

module.exports = new MediaEnrichmentService();
