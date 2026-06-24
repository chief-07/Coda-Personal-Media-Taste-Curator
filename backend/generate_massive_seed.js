const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('./loadEnv');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const mediaTypes = ['movie', 'tv', 'anime', 'visual novel', 'manga', 'book', 'game'];

// We fetch in chunks of 50 to avoid LLM token limits or JSON truncation
const CHUNKS_PER_MEDIA = 2; 

const OUTPUT_FILE = path.join(__dirname, 'data', 'massive_seed.json');

async function generateTitles(mediaType, iteration) {
  const prompt = `You are an elite, highly-curated media recommendation engine.
We are building a massive seed library. 
I need a highly curated list of EXACTLY 50 titles for the media type: "${mediaType}".

Constraints for curation:
- Must fit into one or more of these tropes/atmospheres: mystery psychological, japanese, french, emotional, sad, gritty, surreal, depression, satire, mature comedy.
- Must be highly rated or critically acclaimed (e.g. IMDb top rated, culturally significant, deep-cuts).
- Provide a STRICT JSON array of objects. NO markdown formatting. Just raw JSON.
- Make sure this batch #${iteration} has completely DIFFERENT titles than typical mainstream defaults.

Format:
[
  {"title": "Title 1", "media_type": "${mediaType}"},
  {"title": "Title 2", "media_type": "${mediaType}"}
]`;

  try {
    console.log(`[Groq] Requesting 50 ${mediaType} titles (batch ${iteration})...`);
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7 + (iteration * 0.1), // Increase temp slightly to get different results
    }, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    let content = response.data.choices[0].message.content;
    
    // Clean up markdown code blocks if the LLM ignores instructions
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Find first [ and last ]
    const startIdx = content.indexOf('[');
    const endIdx = content.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.substring(startIdx, endIdx + 1);
    }

    return JSON.parse(content);
  } catch (err) {
    console.error(`[Error generating ${mediaType}]:`, err.message);
    if (err.response) console.error(err.response.data);
    return [];
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  let masterList = [];

  // Check if we already have a partial list to resume
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      masterList = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      console.log(`Loaded ${masterList.length} existing titles from massive_seed.json`);
    } catch(e) {}
  }

  for (const mediaType of mediaTypes) {
    // Count how many we currently have for this media type
    const currentCount = masterList.filter(i => i.media_type === mediaType).length;
    if (currentCount >= 100) {
      console.log(`Already have ${currentCount} for ${mediaType}, skipping...`);
      continue;
    }

    let needed = 100 - currentCount;
    let chunks = Math.ceil(needed / 50);

    for (let i = 1; i <= chunks; i++) {
      const generated = await generateTitles(mediaType, i);
      if (generated && generated.length > 0) {
        masterList = masterList.concat(generated);
        // Save incrementally
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(masterList, null, 2));
        console.log(`Saved! Total list size is now ${masterList.length}.`);
      }
      await delay(3000); // polite delay
    }
  }

  console.log('--- DONE! ---');
  console.log(`Generated a total of ${masterList.length} highly curated titles.`);
}

run();
