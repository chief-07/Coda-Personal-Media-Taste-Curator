const fs = require('fs');
const path = require('path');
require('./loadEnv');

const llmService = require('./services/llmService');

const PENDING_DIR = path.join(__dirname, 'data', 'pending_synthesis');
const COMPLETED_DIR = path.join(__dirname, 'data', 'completed_synthesis');

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node synthesize_file.js <absolute_path_to_json_file>");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(COMPLETED_DIR)) {
    fs.mkdirSync(COMPLETED_DIR, { recursive: true });
  }

  const fileName = path.basename(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  console.log(`Synthesizing: ${fileName}...`);
  try {
    const synthesis = await llmService.generateMediaDescription(data);
    
    const completedPath = path.join(COMPLETED_DIR, fileName);
    fs.writeFileSync(completedPath, JSON.stringify(synthesis, null, 2), 'utf8');
    
    fs.unlinkSync(filePath);
    console.log(`Synthesis complete and saved. Original file deleted.`);
  } catch (err) {
    console.error(`Synthesis failed for ${fileName}:`, err);
    process.exit(1);
  }
}

run();
