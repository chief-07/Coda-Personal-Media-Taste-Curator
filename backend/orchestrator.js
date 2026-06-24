const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('./loadEnv');

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PENDING_DIR = path.join(__dirname, 'data', 'pending_synthesis');
const COMPLETED_DIR = path.join(__dirname, 'data', 'completed_synthesis');
const SEED_FILE = path.join(__dirname, 'data', 'massive_seed.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function synthesizeFile(filePath, fileName) {
  const mediaData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`  -> Synthesizing: ${mediaData.title} (${mediaData.media_type})`);

  const systemPrompt = `
You are the Coda Media Librarian. Your job is to perform a deep, exhaustive psychological and aesthetic extraction of a piece of media to power our "Media Brain" vector database.

You will receive a JSON object with:
- title + media_type: what the work is
- structured_data: genre tags, synopsis, studio/director/author info, ratings, release year, cast, and country of origin.
- community_snippets: real text from reviews and forum discussions by actual fans

Your job is to synthesize this into a highly structured JSON object capturing every "face" of the media.
Do NOT just use single words. Write dense, descriptive, emotionally honest sentences that truly capture the atmosphere and soul of the work. You MUST capture the deep lore, setting, subculture, and pacing dynamics.

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

  const userPrompt = JSON.stringify(mediaData, null, 2);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    
    const completedPath = path.join(COMPLETED_DIR, fileName);
    fs.writeFileSync(completedPath, JSON.stringify(parsed, null, 2));
    fs.unlinkSync(filePath); // delete pending
    return true;
  } catch (e) {
    console.error(`  -> Failed synthesis for ${fileName}:`, e.message);
    return false;
  }
}

async function runOrchestrator() {
  console.log("=== STARTING MASTER ORCHESTRATOR ===");
  if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
  if (!fs.existsSync(COMPLETED_DIR)) fs.mkdirSync(COMPLETED_DIR, { recursive: true });

  let batchCount = 1;

  while (true) {
    console.log(`\n--- BATCH ${batchCount} ---`);
    
    // 1. SCRAPE
    try {
      execSync('node backend/scrape_batch.js', { stdio: 'inherit' });
    } catch (e) {
      console.log("[Orchestrator] Scrape script finished or exited.");
    }

    const pendingFiles = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
    
    if (pendingFiles.length === 0) {
      console.log("[Orchestrator] No pending files found. Assuming massive_seed.json is exhausted!");
      break;
    }

    console.log(`[Orchestrator] Found ${pendingFiles.length} items to synthesize.`);

    // 2. SYNTHESIZE
    // We can process in parallel chunks to speed it up
    const chunkSize = 5;
    for (let i = 0; i < pendingFiles.length; i += chunkSize) {
      const chunk = pendingFiles.slice(i, i + chunkSize);
      await Promise.all(chunk.map(file => synthesizeFile(path.join(PENDING_DIR, file), file)));
    }

    // 3. UPSERT
    try {
      console.log(`[Orchestrator] Running upsert batch...`);
      execSync('node backend/upsert_batch.js', { stdio: 'inherit' });
    } catch (e) {
      console.log("[Orchestrator] Upsert script failed.", e.message);
    }
    
    batchCount++;
  }

  console.log("=== MASTER ORCHESTRATOR COMPLETE ===");
}

runOrchestrator().catch(console.error);
