const axios = require('axios');

const scrapeYoutubeDirect = async (query) => {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    console.log(`Requesting: ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    });
    console.log(`Response status: ${response.status}`);
    const regex = /"videoId":"([^"]{11})"/g;
    const matches = [];
    let match;
    while ((match = regex.exec(response.data)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    return matches;
  } catch (e) {
    console.error(`Error:`, e.message);
    return [];
  }
};

async function test() {
  const query = 'Beyond the Boundary anime official trailer';
  const ids = await scrapeYoutubeDirect(query);
  console.log(`Found IDs: ${JSON.stringify(ids)}`);
}

test();
