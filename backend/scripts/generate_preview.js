const fs = require('fs');
const path = require('path');

const SEED_FILE = path.join(__dirname, '..', 'data', '10k_seed.json');
const OUTPUT_FILE = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\353193fb-c0aa-4963-975a-34af33e73276\\10k_media_preview.md';

const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));

const categories = {
  movie: [],
  tv: [],
  anime: [],
  visual_novel: [],
  book: []
};

// Categorize all items
for (const item of data) {
  if (categories[item.media_type]) {
    categories[item.media_type].push(item.title);
  }
}

let md = '# 10k Media Seed Preview\n\n';
md += '> [!NOTE]\n> The complete list of 9,573 items is available in the raw JSON file: [10k_seed.json](file:///c:/Users/USER/Documents/Coda/backend/data/10k_seed.json). Below is a preview of the top 30 items extracted for each category.\n\n';

for (const [type, titles] of Object.entries(categories)) {
  const prettyType = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  md += `## Top 30 ${prettyType}s\n`;
  md += `*(Total in dataset: ${titles.length})*\n\n`;
  for (let i = 0; i < Math.min(30, titles.length); i++) {
    md += `${i + 1}. ${titles[i]}\n`;
  }
  md += '\n---\n\n';
}

fs.writeFileSync(OUTPUT_FILE, md);
console.log(`Preview written to ${OUTPUT_FILE}`);
