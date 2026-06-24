const fs = require('fs');
const path = require('path');

// Load environment variables
require('./loadEnv');

const searchService = require('./services/searchService');
const llmService = require('./services/llmService');
const embeddingService = require('./services/embeddingService');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const testItems = [
  { title: "Steins;Gate", media_type: "anime" },
  { title: "Heavenly Forest", media_type: "movie" },
  { title: "Colorless Tsukuru Tazaki", media_type: "book" }
];

async function runTest() {
  const results = [];

  for (const item of testItems) {
    console.log(`\nTesting enrichment for: ${item.title} (${item.media_type})`);
    
    const resultData = {
      title: item.title,
      media_type: item.media_type,
      structured_metadata: null,
      community_snippets: [],
      semantic_description: null,
      vector_length: 0,
      qdrant_payload: null,
      errors: []
    };

    try {
      // 1. Fetch Structured Metadata
      console.log(`  -> Fetching metadata...`);
      resultData.structured_metadata = await searchService.fetchMetadataForCandidate(item.title, item.media_type) || {};

      // 2. Fetch Community Text
      console.log(`  -> Fetching community text...`);
      let snippets = [];
      try {
        if (item.media_type === 'anime') {
          const mal = await searchService.fetchMALReviews([item.title]) || [];
          const forums = await searchService.scrapeForums(`${item.title} anime review emotional reddit site:reddit.com`) || [];
          const wiki = await searchService.fetchWikipediaData(item.title, item.media_type) || [];
          snippets = [...mal, ...forums, ...wiki];
        } else if (item.media_type === 'movie' || item.media_type === 'tv') {
          const lb = await searchService.scrapeLetterboxdReviews(item.title) || [];
          const forums = await searchService.scrapeForums(`${item.title} ${item.media_type} review emotional reddit site:reddit.com`) || [];
          const rt = await searchService.scrapeForums(`${item.title} ${item.media_type} rottentomatoes review consensus`) || [];
          const imdb = await searchService.scrapeForums(`${item.title} ${item.media_type} imdb user review`) || [];
          const wiki = await searchService.fetchWikipediaData(item.title, item.media_type) || [];
          snippets = [...lb, ...forums, ...rt, ...imdb, ...wiki];
        } else if (item.media_type === 'book' || item.media_type === 'manga') {
          const forums = await searchService.scrapeForums(`${item.title} ${item.media_type} review emotional reddit site:reddit.com`) || [];
          const wiki = await searchService.fetchWikipediaData(item.title, item.media_type) || [];
          snippets = [...forums, ...wiki];
        }
      } catch (e) {
        resultData.errors.push(`Scraper error: ${e.message}`);
      }
      
      resultData.community_snippets = snippets.slice(0, 10);
      console.log(`  -> Found ${resultData.community_snippets.length} snippets`);

      // 3. Synthesize Description
      console.log(`  -> Synthesizing LLM description...`);
      const synthesisPayload = {
        title: item.title,
        media_type: item.media_type,
        structured_data: resultData.structured_metadata,
        community_snippets: resultData.community_snippets
      };
      
      const semanticDescription = await llmService.generateMediaDescription(synthesisPayload);
      resultData.semantic_description = semanticDescription;

      // 4. Generate Embedding
      console.log(`  -> Generating embedding...`);
      const embeddingText = `Title: ${item.title}\nType: ${item.media_type}\n${semanticDescription}`;
      const vector = await embeddingService.embed(embeddingText);
      resultData.vector_length = vector ? vector.length : 0;

      // 5. Build Qdrant Payload
      resultData.qdrant_payload = {
        title: item.title,
        media_type: item.media_type,
        genres: resultData.structured_metadata.genres || [],
        tags: resultData.structured_metadata.tags || [],
        release_year: resultData.structured_metadata.release_year || '',
        studio: resultData.structured_metadata.studio || '',
        semantic_description: semanticDescription,
        key: `${item.media_type}:${item.title.toLowerCase()}`,
        indexed_at: new Date().toISOString()
      };

    } catch (err) {
      console.error(`Error processing ${item.title}:`, err);
      resultData.errors.push(`General error: ${err.message}`);
    }

    results.push(resultData);
    await delay(1000); // polite delay
  }

  // Save to file
  const outPath = path.join(__dirname, 'data', 'test_batch2_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nTest complete! Results saved to ${outPath}`);
}

runTest();
