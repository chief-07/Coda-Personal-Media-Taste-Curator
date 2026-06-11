const axios = require('axios');

async function testUrl(name, url) {
  try {
    const res = await axios.get(`http://localhost:8080/api/recommend/proxy-image?url=${encodeURIComponent(url)}`);
    console.log(`[${name}] SUCCESS:`, res.status, res.headers['content-type']);
  } catch (e) {
    console.error(`[${name}] FAILED:`, e.message);
    if (e.response) {
      console.error(`Status: ${e.response.status}`);
    }
  }
}

async function run() {
  await testUrl('AniList Mirai Nikki', 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx10620-dUZeNej0W4QN.png');
  await testUrl('VNDB White Album', 'https://t.vndb.org/cv/04/78304.jpg');
}

run();
