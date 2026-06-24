const fs = require('fs');
const path = require('path');
require('../loadEnv');
const qdrantService = require('../services/qdrantService');
const embeddingService = require('../services/embeddingService');

const COMPLETED_DIR = path.join(__dirname, '..', 'data', 'completed_synthesis');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  qdrantService.init();
  console.log('[Daemon Embedder] Listening for completed synthesis JSONs...');

  while (true) {
    try {
      const files = fs.readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.processing'));
      
      if (files.length === 0) {
        // Sleep for a few seconds if queue is empty
        await delay(5000);
        continue;
      }

      for (const file of files) {
        const filePath = path.join(COMPLETED_DIR, file);
        const processingPath = path.join(COMPLETED_DIR, file + '.processing');
        
        // Claim the file
        try {
          fs.renameSync(filePath, processingPath);
        } catch (e) {
          continue; // Someone else claimed it
        }

        console.log(`\n[Daemon Embedder] Processing ${file}...`);
        
        try {
          const rawData = fs.readFileSync(processingPath, 'utf8');
          const payload = JSON.parse(rawData);
          
          const uuid = file.replace('.json', '');
          const title = payload.title || "Unknown Title";
          const media_type = payload.media_type || "Unknown";
          
          let stockGenres = payload.structured_data?.genres || [];
          let stockTags = payload.structured_data?.tags || [];
          let stockRelease = payload.structured_data?.release_year || 'Unknown';
          let stockStudio = payload.structured_data?.studio || '';

          const semanticDescription = `
[Stock Metadata]: Genres: ${stockGenres.join(', ')} | Tags: ${stockTags.join(', ')} | Release: ${stockRelease}
[Metadata & Cultural Context]: ${payload.metadata_synthesis || ''}
[Setting & Subculture]: ${payload.setting_and_subculture || ''}
[Visual Tone & Feel]: ${payload.visual_tone_and_feel || ''}
[Media Era Tone]: ${payload.media_era_tone || ''}
[Pacing & Structure]: ${payload.pacing_and_structure || ''}
[Atmosphere & Mood]: ${payload.atmosphere_and_mood || ''}
[Themes & Messages]: ${payload.themes_and_messages || ''}
[Character Relationships]: ${payload.character_relationships || ''}
[Lead Character Type]: ${payload.lead_character_type || ''}
[Story & Plot Type]: ${payload.story_and_plot_type || ''}
[Who & When (The Soul Match)]: ${payload.who_and_when || ''}
[Emotional Evocation (Consensus)]: ${payload.emotional_evocation || ''}
          `.trim();

          console.log(`  -> Generating Embedding...`);
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
          
          console.log(`  -> Upserting to Qdrant...`);
          await qdrantService.upsert('media_brain', uuid, vector, qdrantPayload);
          
          console.log(`  -> Success! Deleting artifact.`);
          fs.unlinkSync(processingPath);

        } catch (e) {
          console.error(`  -> FATAL ERROR embedding ${file}:`, e.message);
          // Rename back so it can be retried or inspected
          fs.renameSync(processingPath, filePath + '.error');
        }
      }
    } catch (err) {
      console.error('[Daemon Embedder] Main loop error:', err.message);
      await delay(5000);
    }
  }
}

run().catch(console.error);
