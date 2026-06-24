const fs = require('fs');
const path = require('path');
const axios = require('axios');
const zlib = require('zlib');
const readline = require('readline');

const TARGET_MOVIES = 4000;
const TARGET_TV = 2000;
const TARGET_ANIME = 2000;
const TARGET_VNS = 1000;
const TARGET_BOOKS = 1000;
const TARGET_MANGA = 1000;


const PERSONAL_SEED_FILE = path.join(__dirname, '..', 'data', 'personal_seed.json');

const OUTPUT_FILE = path.join(__dirname, '..', 'data', '10k_seed.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchIMDbTop() {
  console.log('[IMDb] Downloading title.ratings.tsv.gz...');
  const ratingsMap = new Map(); // tconst -> numVotes

  // 1. Download and parse ratings (to find the top N most voted items)
  const ratingsRes = await axios({
    url: 'https://datasets.imdbws.com/title.ratings.tsv.gz',
    method: 'GET',
    responseType: 'stream'
  });

  const ratingsRl = readline.createInterface({
    input: ratingsRes.data.pipe(zlib.createGunzip()),
    crlfDelay: Infinity
  });

  let isHeader = true;
  for await (const line of ratingsRl) {
    if (isHeader) { isHeader = false; continue; }
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const tconst = parts[0];
    const numVotes = parseInt(parts[2], 10);
    if (numVotes > 10000) { // minimum threshold
      ratingsMap.set(tconst, numVotes);
    }
  }

  console.log(`[IMDb] Loaded ${ratingsMap.size} titles with >10k votes. Downloading title.basics.tsv.gz...`);

  // 2. Download basics and match
  const basicsRes = await axios({
    url: 'https://datasets.imdbws.com/title.basics.tsv.gz',
    method: 'GET',
    responseType: 'stream'
  });

  const basicsRl = readline.createInterface({
    input: basicsRes.data.pipe(zlib.createGunzip()),
    crlfDelay: Infinity
  });

  const movies = [];
  const tvShows = [];

  isHeader = true;
  for await (const line of basicsRl) {
    if (isHeader) { isHeader = false; continue; }
    const parts = line.split('\t');
    if (parts.length < 9) continue;
    const tconst = parts[0];
    const titleType = parts[1];
    const primaryTitle = parts[2];
    const isAdult = parts[4];

    if (isAdult === '1') continue;

    const votes = ratingsMap.get(tconst);
    if (!votes) continue;

    if (titleType === 'movie') {
      movies.push({ title: primaryTitle, media_type: 'movie', votes });
    } else if (titleType === 'tvSeries' || titleType === 'tvMiniSeries') {
      tvShows.push({ title: primaryTitle, media_type: 'tv', votes });
    }
  }

  movies.sort((a, b) => b.votes - a.votes);
  tvShows.sort((a, b) => b.votes - a.votes);

  console.log(`[IMDb] Processed ${movies.length} movies, ${tvShows.length} TV shows.`);
  return {
    movies: movies.slice(0, TARGET_MOVIES).map(m => ({ title: m.title, media_type: 'movie' })),
    tv: tvShows.slice(0, TARGET_TV).map(t => ({ title: t.title, media_type: 'tv' }))
  };
}

async function fetchTopAnime() {
  console.log(`[Jikan] Fetching top ${TARGET_ANIME} anime...`);
  const anime = [];
  let page = 1;
  while (anime.length < TARGET_ANIME) {
    try {
      const res = await axios.get(`https://api.jikan.moe/v4/top/anime?page=${page}&limit=25`, { timeout: 15000 });
      const data = res.data?.data || [];
      if (data.length === 0) break;
      for (const item of data) {
        anime.push({ title: item.title_english || item.title, media_type: 'anime' });
      }
      page++;
      await delay(1000); // Respect Jikan rate limit
    } catch (e) {
      console.warn(`[Jikan] Error on page ${page}:`, e.message);
      await delay(5000);
    }
  }
  return anime.slice(0, TARGET_ANIME);
}

async function fetchTopManga() {
  console.log(`[Jikan] Fetching top ${TARGET_MANGA} manga...`);
  const manga = [];
  let page = 1;
  while (manga.length < TARGET_MANGA) {
    try {
      const res = await axios.get(`https://api.jikan.moe/v4/top/manga?page=${page}&limit=25`, { timeout: 15000 });
      const data = res.data?.data || [];
      if (data.length === 0) break;
      for (const item of data) {
        manga.push({ title: item.title_english || item.title, media_type: 'manga' });
      }
      page++;
      await delay(1000); // Respect Jikan rate limit
    } catch (e) {
      console.warn(`[Jikan] Error on manga page ${page}:`, e.message);
      await delay(5000);
    }
  }
  return manga.slice(0, TARGET_MANGA);
}

async function fetchTopVNs() {
  console.log(`[VNDB] Fetching top ${TARGET_VNS} visual novels...`);
  const vns = [];
  let page = 1;
  while (vns.length < TARGET_VNS) {
    try {
      const res = await axios.post('https://api.vndb.org/kana/vn', {
        sort: "rating",
        reverse: true,
        results: 100,
        page: page,
        fields: "title"
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
      
      const data = res.data?.results || [];
      if (data.length === 0) break;
      for (const item of data) {
        vns.push({ title: item.title, media_type: 'visual_novel' });
      }
      page++;
      await delay(1000);
    } catch (e) {
      console.warn(`[VNDB] Error on page ${page}:`, e.message);
      await delay(5000);
    }
  }
  return vns.slice(0, TARGET_VNS);
}

async function fetchTopBooks() {
  console.log(`[OpenLibrary] Fetching top ${TARGET_BOOKS} books...`);
  const books = [];
  const subjects = ['fiction', 'science_fiction', 'fantasy', 'mystery', 'romance'];
  
  for (const subject of subjects) {
    if (books.length >= TARGET_BOOKS) break;
    try {
      const res = await axios.get(`https://openlibrary.org/subjects/${subject}.json?limit=250&sort=rating`, { timeout: 15000 });
      const data = res.data?.works || [];
      for (const item of data) {
        if (!books.find(b => b.title === item.title)) {
          books.push({ title: item.title, media_type: 'book' });
        }
      }
      await delay(1000);
    } catch (e) {
      console.warn(`[OpenLibrary] Error on subject ${subject}:`, e.message);
    }
  }
  return books.slice(0, TARGET_BOOKS);
}

async function generateMassiveSeed() {
  let personalSeeds = [];
  if (fs.existsSync(PERSONAL_SEED_FILE)) {
    try {
      personalSeeds = JSON.parse(fs.readFileSync(PERSONAL_SEED_FILE, 'utf-8'));
      console.log(`[Personal Queue] Loaded ${personalSeeds.length} priority items.`);
    } catch (e) {
      console.error('[Personal Queue] Failed to load personal_seed.json', e.message);
    }
  }

  const imdbResults = await fetchIMDbTop();
  const anime = await fetchTopAnime();
  const manga = await fetchTopManga();
  const vns = await fetchTopVNs();
  const books = await fetchTopBooks();

  const allSeeds = [
    ...personalSeeds,
    ...imdbResults.movies,
    ...imdbResults.tv,
    ...anime,
    ...manga,
    ...vns,
    ...books
  ];

  // Deduplicate just in case
  const uniqueSeeds = [];
  const seen = new Set();
  for (const item of allSeeds) {
    const key = `${item.media_type}:${item.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSeeds.push(item);
    }
  }

  console.log(`\n--- SEED EXPANSION COMPLETE ---`);
  console.log(`Total Personal Queue: ${personalSeeds.length}`);
  console.log(`Total Movies: ${imdbResults.movies.length}`);
  console.log(`Total TV Shows: ${imdbResults.tv.length}`);
  console.log(`Total Anime: ${anime.length}`);
  console.log(`Total Manga: ${manga.length}`);
  console.log(`Total Visual Novels: ${vns.length}`);
  console.log(`Total Books: ${books.length}`);
  console.log(`\nGrand Total Unique Seeds: ${uniqueSeeds.length}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueSeeds, null, 2));
  console.log(`Wrote to ${OUTPUT_FILE}`);
}

generateMassiveSeed().catch(console.error);
