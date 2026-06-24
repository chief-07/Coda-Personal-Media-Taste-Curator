require('./loadEnv');
const axios = require('axios');

async function test() {
  const title = 'Berserk';

  // 1. Raw API hit
  console.log('--- Test 1: Raw MangaDex API ---');
  try {
    const url = 'https://api.mangadex.org/manga?title=' + encodeURIComponent(title) + '&limit=1&includes[]=cover_art';
    console.log('URL:', url);
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'CodaApp/2.0 (contact@mycodaapp.net)' },
      timeout: 15000
    });
    console.log('Status:', res.status);
    const manga = res.data && res.data.data && res.data.data[0];
    if (!manga) { console.log('NO MANGA FOUND'); return; }
    const mangaId = manga.id;
    console.log('Manga ID:', mangaId);
    console.log('Title:', manga.attributes && manga.attributes.title && manga.attributes.title.en);
    const coverRel = manga.relationships && manga.relationships.find(function(r) { return r.type === 'cover_art'; });
    console.log('Cover rel found:', !!coverRel);
    console.log('Cover rel has attributes:', !!(coverRel && coverRel.attributes));
    console.log('Cover rel fileName:', coverRel && coverRel.attributes && coverRel.attributes.fileName);
    if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
      console.log('POSTER URL:', 'https://uploads.mangadex.org/covers/' + mangaId + '/' + coverRel.attributes.fileName + '.512.jpg');
    } else {
      console.log('No fileName on cover_art relationship. Need separate cover endpoint.');
      // Try fetching cover separately
      const coverRes = await axios.get('https://api.mangadex.org/cover?manga[]=' + mangaId + '&limit=1', {
        headers: { 'User-Agent': 'CodaApp/2.0' },
        timeout: 15000
      });
      console.log('Cover API status:', coverRes.status);
      const coverFile = coverRes.data && coverRes.data.data && coverRes.data.data[0] && coverRes.data.data[0].attributes && coverRes.data.data[0].attributes.fileName;
      console.log('Separate cover fileName:', coverFile);
      if (coverFile) {
        console.log('POSTER URL (separate):', 'https://uploads.mangadex.org/covers/' + mangaId + '/' + coverFile + '.512.jpg');
      }
    }
  } catch(e) {
    console.log('ERROR:', e.message, '| code:', e.code);
    if (e.response) console.log('HTTP status:', e.response.status, JSON.stringify(e.response.data).substring(0, 200));
  }

  // 2. Test via mediaService fetchAssets
  console.log('\n--- Test 2: mediaService.fetchAssets for Berserk ---');
  const mediaService = require('./services/mediaService');
  try {
    const result = await mediaService.fetchAssets('Berserk', 'manga');
    console.log('poster_url:', result.poster_url);
    console.log('ost_url:', result.ost_url);
    console.log('trailer_url:', result.trailer_url);
  } catch(e) {
    console.log('fetchAssets ERROR:', e.message);
  }

  // 3. Also test with Honey and Clover
  console.log('\n--- Test 3: mediaService.fetchAssets for Honey and Clover ---');
  try {
    const result2 = await mediaService.fetchAssets('Honey and Clover', 'manga');
    console.log('poster_url:', result2.poster_url);
  } catch(e) {
    console.log('fetchAssets ERROR:', e.message);
  }
}
test().catch(console.error);
