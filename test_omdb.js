// removed
const searchService = require('./backend/services/searchService');

async function test() {
  const titles = ['Fight Club', 'The Matrix', 'Inception', 'Kwaidan', 'Dogtooth', 'Still Walking'];
  for (const t of titles) {
    const res = await searchService.fetchMetadataForCandidate(t, 'movie');
    console.log(t, res ? { year: res.release_year, genres: res.genres } : 'NULL');
  }
}
test();
