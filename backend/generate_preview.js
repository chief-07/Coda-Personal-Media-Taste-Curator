const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'mass_enriched_data.json');
const outPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\2801a3ab-f4ba-404b-af84-fefa88d534ce\\enrichment_results_preview.md';

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let md = `# Enrichment Results Preview (50 Titles)\n\n`;
md += `This document showcases the actual data our subagents scraped and synthesized. Notice how it captures the *exact vibe* rather than just generic metadata.\n\n`;

for (const item of data) {
  md += `### ${item.title} (${item.media_type.toUpperCase()})\n`;
  md += `**Atmosphere:** ${item.atmosphere}\n\n`;
  md += `**Emotional Aftermath:** ${item.emotional_aftermath}\n\n`;
  md += `**Context:** ${item.consumption_context}\n\n`;
  md += `**Themes:** ${item.themes}\n\n`;
  md += `---\n\n`;
}

fs.writeFileSync(outPath, md, 'utf8');
console.log('Preview generated.');
