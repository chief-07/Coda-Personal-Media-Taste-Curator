const fs = require('fs');
const path = require('path');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');
const embeddingService = require('./services/embeddingService');

const PENDING_DIR = path.join(__dirname, 'data', 'pending_synthesis');
const COMPLETED_DIR = path.join(__dirname, 'data', 'completed_synthesis');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  qdrantService.init();

  if (!fs.existsSync(COMPLETED_DIR)) return;

  const files = fs.readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('[UpsertBatch] No completed files found.');
    return;
  }

  console.log(`[UpsertBatch] Found ${files.length} completed syntheses. Processing...`);

  for (const file of files) {
    const completedPath = path.join(COMPLETED_DIR, file);
    const pendingPath = path.join(PENDING_DIR, file);
    
    console.log(`\n--- Upserting: ${file} ---`);
    try {
      let rawData = fs.readFileSync(completedPath, 'utf8');
      if (rawData.charCodeAt(0) === 0xFEFF) {
        rawData = rawData.slice(1);
        fs.writeFileSync(completedPath, rawData, 'utf8'); // Save it back cleaned
      }
      const synthesizedData = JSON.parse(rawData);

      // Re-read original metadata from pending to get the title and media_type if needed.
      // Wait, the synthesizer subagent only outputs the 12 fields, not the title.
      // We need the original title, media_type, and uuid to upsert.
      // Since pendingPath is supposed to be deleted by subagent, let's hope we kept a copy or can read the uuid from the filename.
      // Actually, uuid is the filename. We can query Qdrant to get it, or just read pending if it wasn't deleted.
      // Ah, the subagent deleted pendingPath in my instruction.
      // We should read the original data from a master seed mapping, or just include it in the subagent's output.
      
      // Let's modify the script to read the massive_seed.json to reverse-lookup the UUID.
      const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'massive_seed.json'), 'utf8'));
      const crypto = require('crypto');
      let originalTitle, originalMediaType, originalStructuredData;
      
      for (const item of seedData) {
        const key = `${item.media_type}:${item.title.toLowerCase()}`;
        const hash = crypto.createHash('md5').update(key).digest('hex');
        const uuid = [
          hash.substring(0, 8),
          hash.substring(8, 12),
          hash.substring(12, 16),
          hash.substring(16, 20),
          hash.substring(20, 32)
        ].join('-');
        
        if (uuid === file.replace('.json', '')) {
          originalTitle = item.title;
          originalMediaType = item.media_type;
          break;
        }
      }

      if (!originalTitle) {
        console.error(`  -> Could not find original title for uuid: ${file}. Skipping.`);
        continue;
      }

      console.log(`  -> Title: ${originalTitle} (${originalMediaType})`);

      // Read stock metadata from existing data/seed... wait, we need structuredData for genres!
      // Since pending might be deleted, I should load pendingPath if it exists. If not, genres = []
      let stockGenres = [], stockTags = [], stockRelease = 'Unknown', stockStudio = '';
      if (fs.existsSync(pendingPath)) {
        const raw = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
        stockGenres = raw.structured_data?.genres || [];
        stockTags = raw.structured_data?.tags || [];
        stockRelease = raw.structured_data?.release_year || 'Unknown';
        stockStudio = raw.structured_data?.studio || '';
      }

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

      console.log(`  -> Embedding...`);
      const embeddingText = `Title: ${originalTitle}\nType: ${originalMediaType}\n${semanticDescription}`;
      const vector = await embeddingService.embed(embeddingText);

      console.log(`  -> Upserting to Qdrant...`);
      const payload = {
        title: originalTitle,
        media_type: originalMediaType,
        genres: stockGenres,
        tags: stockTags,
        release_year: stockRelease,
        studio: stockStudio,
        semantic_description: semanticDescription,
        key: `${originalMediaType}:${originalTitle.toLowerCase()}`,
        indexed_at: new Date().toISOString()
      };
      
      const uuid = file.replace('.json', '');
      await qdrantService.upsert('media_brain', uuid, vector, payload);
      
      // Cleanup files
      fs.unlinkSync(completedPath);
      if (fs.existsSync(pendingPath)) {
        fs.unlinkSync(pendingPath);
      }
      
      console.log(`  -> Success ✓ (Cleaned up ${uuid})`);

    } catch (e) {
      console.error(`  -> ERROR processing ${file}:`, e.message);
    }
  }
}

run().catch(console.error);
