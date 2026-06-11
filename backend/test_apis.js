const axios = require('axios');

async function testUrl(name, url) {
  const start = Date.now();
  console.log(`[${name}] Connecting to: ${url}`);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log(`[${name}] SUCCESS in ${Date.now() - start}ms. Status: ${res.status}`);
  } catch (e) {
    console.error(`[${name}] FAILED in ${Date.now() - start}ms. Error: ${e.message} (${e.code})`);
  }
}

async function run() {
  await testUrl('trace.moe', 'https://api.trace.moe/');
  await testUrl('kitsu.io', 'https://kitsu.io/api/edge/anime?filter[text]=Naruto');
  await testUrl('AniList', 'https://graphql.anilist.co/'); // GET should return 400/405/200 depending on endpoint
  await testUrl('Jikan', 'https://api.jikan.moe/v4/anime');
}

run();
