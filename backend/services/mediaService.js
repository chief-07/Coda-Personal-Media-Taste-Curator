const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const llmService = require('./llmService');
const searchService = require('./searchService');

const ASSET_CACHE_FILE = path.join(__dirname, '../cache/asset_cache.json');
let assetCache = {};
if (fs.existsSync(ASSET_CACHE_FILE)) {
  try {
    assetCache = JSON.parse(fs.readFileSync(ASSET_CACHE_FILE, 'utf8'));
    // Clean up empty trailer_urls so they can be re-resolved
    for (const key in assetCache) {
      if (assetCache[key] && assetCache[key].trailer_url === '') {
        delete assetCache[key].trailer_url;
      }
      // Evict manga entries with missing/placeholder poster so MangaDex is re-queried
      if (key.endsWith(':manga')) {
        const p = assetCache[key]?.poster_url;
        if (!p || p === '' || p.startsWith('holder:')) {
          delete assetCache[key];
        }
      }
    }
  } catch (_) {}
}

const saveAssetCache = () => {
  try {
    const cacheDir = path.dirname(ASSET_CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(ASSET_CACHE_FILE, JSON.stringify(assetCache, null, 2), 'utf8');
  } catch (e) {
    console.error('[Asset Cache Save Error]:', e.message);
  }
};

const cacheNormalize = (title) => {
  if (!title) return '';
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// ─────────────────────────────────────────────────────────────────────────────
// WIKIPEDIA IMAGE SCRAPER — used as global fallback
// ─────────────────────────────────────────────────────────────────────────────

const WIKI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CodaMediaFinder/2.0 (contact@mycodaapp.net; personal school project)',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

const getWikipediaImage = async (title, mediaType) => {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title + ' ' + mediaType)}&format=json`;
    const searchRes = await axios.get(searchUrl, {
      headers: WIKI_HEADERS,
      timeout: 15000
    });
    const results = searchRes.data?.query?.search;
    if (!results || results.length === 0) {
      console.log(`[Wikipedia] No pages found for: "${title} ${mediaType}"`);
      return null;
    }

    const pageTitle = results[0].title;
    console.log(`[Wikipedia] Found page: "${pageTitle}" for: "${title}"`);

    // Try prop=pageimages first (fast)
    try {
      const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&pithumbsize=1000&format=json`;
      const imgRes = await axios.get(imgUrl, {
        headers: WIKI_HEADERS,
        timeout: 15000
      });
      const pages = imgRes.data?.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        if (pageId !== '-1' && pages[pageId]?.thumbnail?.source) {
          const src = pages[pageId].thumbnail.source;
          if (!src.toLowerCase().endsWith('.svg')) {
            console.log(`[Wikipedia] PageImages thumbnail found`);
            return src;
          }
        }
      }
    } catch (e) {
      console.log(`[Wikipedia] PageImages error:`, e.message);
    }

    // Fallback: parse infobox image from page HTML
    try {
      const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json`;
      const parseRes = await axios.get(parseUrl, {
        headers: WIKI_HEADERS,
        timeout: 15000
      });
      const html = parseRes.data?.parse?.text?.['*'];
      if (html) {
        const $ = cheerio.load(html);
        const selectors = ['td.infobox-image img', 'table.infobox img', '.infobox img', 'a.image img'];
        for (const selector of selectors) {
          const img = $(selector).first();
          if (img.length > 0) {
            let src = img.attr('src');
            if (src) {
              if (src.includes('Flag_of_') || src.includes('Wiki_letter') || src.includes('OOjs_UI_icon') || src.includes('Ambox_')) continue;
              if (src.toLowerCase().endsWith('.svg')) continue;
              if (src.startsWith('//')) src = 'https:' + src;
              if (src.includes('/thumb/')) {
                src = src.replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/');
                const parts = src.split('/');
                const thumbIdx = parts.indexOf('thumb');
                if (thumbIdx !== -1) {
                  parts.splice(thumbIdx, 1);
                  parts.pop();
                  src = parts.join('/');
                }
              }
              console.log(`[Wikipedia] Infobox image extracted: ${src}`);
              return src;
            }
          }
        }
      }
    } catch (e) {
      console.log(`[Wikipedia] HTML parse error:`, e.message);
    }

    return null;
  } catch (e) {
    console.error('[Wikipedia] Failed:', e.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TITLE CLEANER
// ─────────────────────────────────────────────────────────────────────────────

const cleanTitle = (title) => {
  if (!title) return '';
  let cleaned = title;
  cleaned = cleaned.replace(/\s+by\s+[A-Za-z0-9\s''\-]+$/gi, '');
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '');
  return cleaned;
};

// ─────────────────────────────────────────────────────────────────────────────
// ANIME POSTERS
// ─────────────────────────────────────────────────────────────────────────────

const fetchAnilistAnimePoster = async (title) => {
  try {
    const query = `
      query ($search: String) {
        Media (search: $search, type: ANIME) {
          coverImage { extraLarge large medium }
        }
      }
    `;
    const response = await axios.post('https://graphql.anilist.co', {
      query,
      variables: { search: title }
    }, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      timeout: 15000
    });
    const media = response.data?.data?.Media;
    if (media?.coverImage) {
      const img = media.coverImage.extraLarge || media.coverImage.large || media.coverImage.medium;
      if (img) {
        console.log(`[AniList Poster] ✅ "${title}": ${img}`);
        return img;
      }
    }
  } catch (e) {
    console.error(`[AniList Poster] Failed for "${title}":`, e.message);
  }
  return null;
};

const fetchKitsuAnimePoster = async (title) => {
  try {
    console.log(`[Kitsu Poster] Searching for: "${title}"`);
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1&fields[anime]=canonicalTitle,posterImage`;
    const res = await axios.get(url, {
      headers: { 'Accept': 'application/vnd.api+json' },
      timeout: 15000
    });
    const item = res.data?.data?.[0];
    const poster = item?.attributes?.posterImage;
    if (poster) {
      const img = poster.large || poster.medium || poster.small || poster.original;
      if (img) {
        console.log(`[Kitsu Poster] ✅ "${title}": ${img}`);
        return img;
      }
    }
  } catch (e) {
    console.warn(`[Kitsu Poster] Failed for "${title}":`, e.message);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// MOVIE / TV POSTERS — MPDB is #1 priority
// MPDB requires an IMDB ID. We resolve it via OMDb (1 call) or TMDb (2 calls).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a title to an IMDB ID using OMDb or TMDb.
 * Returns the IMDB ID string (e.g. "tt1234567") or null.
 */
const resolveImdbId = async (title, mediaType) => {
  // Try OMDb first — single call, returns imdbID directly
  const omdbKey = process.env.OMDB_API_KEY;
  if (omdbKey) {
    try {
      const type = (mediaType === 'tv' || mediaType === 'show') ? 'series' : 'movie';
      const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&type=${type}&apikey=${omdbKey}`;
      const res = await axios.get(url, { timeout: 15000 });
      if (res.data?.imdbID && res.data.Response === 'True') {
        console.log(`[OMDb] Resolved "${title}" → ${res.data.imdbID}`);
        return res.data.imdbID;
      }
    } catch (e) {
      console.warn(`[OMDb] Failed for "${title}":`, e.message);
    }
  }

  // Try TMDb — search gives TMDb ID, then external_ids gives IMDB ID
  const tmdbKey = process.env.TMDB_API_KEY;
  if (tmdbKey) {
    try {
      const searchType = (mediaType === 'tv' || mediaType === 'show') ? 'tv' : 'movie';
      const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(title)}`;
      const searchRes = await axios.get(searchUrl, { timeout: 15000 });
      const firstResult = searchRes.data?.results?.[0];
      if (firstResult?.id) {
        const extUrl = `https://api.themoviedb.org/3/${searchType}/${firstResult.id}/external_ids?api_key=${tmdbKey}`;
        const extRes = await axios.get(extUrl, { timeout: 15000 });
        const imdbId = extRes.data?.imdb_id;
        if (imdbId) {
          console.log(`[TMDb] Resolved "${title}" → ${imdbId}`);
          return imdbId;
        }
      }
    } catch (e) {
      console.warn(`[TMDb ID resolve] Failed for "${title}":`, e.message);
    }
  }

  if (!omdbKey && !tmdbKey) {
    console.warn(`[MPDB] Cannot resolve IMDB ID for "${title}" — set OMDB_API_KEY or TMDB_API_KEY in .env`);
  }
  return null;
};

const fetchMoviePosterDB = async (title, mediaType) => {
  const token = process.env.MPDB_API_KEY;
  if (!token) {
    console.log(`[MPDB] Skipping — MPDB_API_KEY not set.`);
    return null;
  }

  try {
    // Resolve IMDB ID (required by MPDB)
    const imdbId = await resolveImdbId(title, mediaType);
    if (!imdbId) {
      console.log(`[MPDB] Could not resolve IMDB ID for "${title}" — skipping MPDB.`);
      return null;
    }

    console.log(`[MPDB] Fetching posters for "${title}" (IMDB: ${imdbId})`);
    const url = `https://api.movieposterdb.com/v1/posters?imdb=${encodeURIComponent(imdbId)}&thumb_size=xl&min_width=500`;

    // MPDB sits behind Cloudflare — must send full browser-mimicking headers
    // exactly as a real browser would, otherwise CF returns a JS challenge page
    const res = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://api.movieposterdb.com/',
        'Origin': 'https://api.movieposterdb.com',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'Connection': 'keep-alive'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const posters = res.data?.data;
    if (!posters || posters.length === 0) {
      console.log(`[MPDB] No posters found for IMDB: ${imdbId}`);
      return null;
    }

    // Pick highest resolution
    let best = posters[0];
    let maxRes = (best.width || 0) * (best.height || 0);
    for (let i = 1; i < posters.length; i++) {
      const res = (posters[i].width || 0) * (posters[i].height || 0);
      if (res > maxRes) { maxRes = res; best = posters[i]; }
    }

    const posterUrl = best.file_location || best.thumb_url;
    if (posterUrl) {
      console.log(`[MPDB] ✅ "${title}" → ${best.width}x${best.height}: ${posterUrl}`);
      return posterUrl;
    }
  } catch (e) {
    if (e.response?.status === 401) {
      console.error(`[MPDB] ❌ Auth failed — check MPDB_API_KEY.`);
    } else if (e.response?.status === 404) {
      console.log(`[MPDB] Not found (404) for "${title}".`);
    } else {
      console.error(`[MPDB] ❌ Error for "${title}":`, e.response?.data || e.message);
    }
  }
  return null;
};

const fetchTMDbPoster = async (title, mediaType) => {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return null;
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&query=${encodeURIComponent(title)}`;
    const res = await axios.get(searchUrl, { timeout: 15000 });
    if (res.data.results && res.data.results.length > 0) {
      const match = res.data.results.find(r => r.poster_path);
      if (match) {
        console.log(`[TMDb Poster] ✅ "${title}"`);
        return `https://image.tmdb.org/t/p/w780${match.poster_path}`;
      }
    }
  } catch (e) {
    console.error('[TMDb Poster] Failed:', e.message);
  }
  return null;
};

const fetchOMDbPoster = async (title, mediaType) => {
  const omdbKey = process.env.OMDB_API_KEY;
  if (!omdbKey) return null;
  try {
    const type = (mediaType === 'tv' || mediaType === 'show') ? 'series' : 'movie';
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&type=${type}&apikey=${omdbKey}`;
    const res = await axios.get(url, { timeout: 15000 });
    if (res.data?.Poster && res.data.Poster !== 'N/A' && res.data.Response === 'True') {
      const originalUrl = res.data.Poster;
      // Upgrade to original high-res by removing the ._V1_... suffix
      const highResUrl = originalUrl.replace(/\._V1_.*\.jpg$/, '.jpg');
      console.log(`[OMDb Poster] ✅ "${title}" → ${highResUrl}`);
      return highResUrl;
    }
  } catch (e) {
    console.warn(`[OMDb Poster] Failed for "${title}":`, e.message);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL NOVEL POSTERS — VNDB API (free, no auth, Modern Kana POST API)
// ─────────────────────────────────────────────────────────────────────────────

const fetchVNDBPoster = async (title) => {
  try {
    console.log(`[VNDB Poster] Searching for: "${title}"`);
    const cleanedTitle = cleanTitle(title);
    const url = 'https://api.vndb.org/kana/vn';
    const res = await axios.post(url, {
      filters: ["search", "=", cleanedTitle],
      fields: "title, alttitle, image.url"
    }, {
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'CodaRecommendations/1.0'
      },
      timeout: 15000
    });
    
    const results = res.data?.results;
    if (!results || results.length === 0) {
      console.log(`[VNDB Poster] No results for: "${cleanedTitle}"`);
      return null;
    }

    // 1. Exact match (title or alttitle)
    const exactMatch = results.find(r => r.image?.url && (
      r.title.toLowerCase() === cleanedTitle.toLowerCase() ||
      (r.alttitle && r.alttitle.toLowerCase() === cleanedTitle.toLowerCase())
    ));
    if (exactMatch) {
      console.log(`[VNDB Poster] ✅ Exact match: "${cleanedTitle}" → ${exactMatch.image.url}`);
      return `/api/recommend/proxy-image?url=${encodeURIComponent(exactMatch.image.url)}`;
    }

    // 2. Partial match (contains)
    const partialMatch = results.find(r => r.image?.url && (
      r.title.toLowerCase().includes(cleanedTitle.toLowerCase()) ||
      cleanedTitle.toLowerCase().includes(r.title.toLowerCase()) ||
      (r.alttitle && r.alttitle.toLowerCase().includes(cleanedTitle.toLowerCase())) ||
      (r.alttitle && cleanedTitle.toLowerCase().includes(r.alttitle.toLowerCase()))
    ));
    if (partialMatch) {
      console.log(`[VNDB Poster] ✅ Partial match: "${cleanedTitle}" → ${partialMatch.image.url} (Title: ${partialMatch.title})`);
      return `/api/recommend/proxy-image?url=${encodeURIComponent(partialMatch.image.url)}`;
    }

    // 3. Fallback to first result with image
    const firstWithImg = results.find(r => r.image?.url);
    if (firstWithImg) {
      console.log(`[VNDB Poster] ⚠️ Fallback first image: "${cleanedTitle}" → ${firstWithImg.image.url} (Title: ${firstWithImg.title})`);
      return `/api/recommend/proxy-image?url=${encodeURIComponent(firstWithImg.image.url)}`;
    }
  } catch (e) {
    console.warn(`[VNDB Poster] Failed for "${title}":`, e.message);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// MANGA POSTERS — MangaDex (free, no auth)
// ─────────────────────────────────────────────────────────────────────────────

const fetchMangaDexPoster = async (title) => {
  try {
    console.log(`[MangaDex] Searching for: "${title}"`);
    const searchUrl = `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&includes[]=cover_art`;
    const res = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'CodaApp/2.0 (contact@mycodaapp.net)' },
      timeout: 15000
    });

    const manga = res.data?.data?.[0];
    if (!manga) {
      console.log(`[MangaDex] No manga found for: "${title}"`);
      return null;
    }

    const mangaId = manga.id;
    const coverRel = manga.relationships?.find(r => r.type === 'cover_art');
    if (!coverRel?.attributes?.fileName) {
      console.log(`[MangaDex] Cover art not in response. Fetching separately...`);
      // Fetch cover art separately
      const coverRes = await axios.get(`https://api.mangadex.org/cover?manga[]=${mangaId}&limit=1`, {
        headers: { 'User-Agent': 'CodaApp/2.0' },
        timeout: 15000
      });
      const coverFile = coverRes.data?.data?.[0]?.attributes?.fileName;
      if (coverFile) {
        const img = `/api/recommend/proxy-image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${mangaId}/${coverFile}.512.jpg`)}`;
        console.log(`[MangaDex] ✅ "${title}": ${img}`);
        return img;
      }
    } else {
      const coverFile = coverRel.attributes.fileName;
      const img = `/api/recommend/proxy-image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${mangaId}/${coverFile}.512.jpg`)}`;
      console.log(`[MangaDex] ✅ "${title}": ${img}`);
      return img;
    }
  } catch (e) {
    console.warn(`[MangaDex] Failed for "${title}":`, e.message);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOK POSTERS — Open Library → Penguin Random House → Google Books
// ─────────────────────────────────────────────────────────────────────────────

const fetchOpenLibraryPoster = async (title) => {
  try {
    console.log(`[Open Library] Searching for: "${title}"`);
    const res = await axios.get(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`, {
      headers: { 'User-Agent': 'CodaMediaFinder/2.0 (contact@mycodaapp.net)' },
      timeout: 15000
    });
    const book = res.data?.docs?.[0];
    if (book?.cover_i) {
      const img = `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`;
      console.log(`[Open Library] ✅ "${title}": ${img}`);
      return img;
    }
  } catch (e) {
    console.error('[Open Library] Failed:', e.message);
  }
  return null;
};

const fetchPenguinRandomHousePoster = async (title) => {
  // PRH has a search page that renders server-side — we extract the book cover from it.
  // Cover images follow the pattern: images.penguinrandomhouse.com/cover/{isbn13}
  try {
    console.log(`[Penguin Random House] Searching for: "${title}"`);
    const searchUrl = `https://www.penguinrandomhouse.com/search/site/${encodeURIComponent(title)}/`;
    const res = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      },
      timeout: 15000
    });
    const $ = cheerio.load(res.data);
    
    // PRH search results: first book cover img with penguinrandomhouse CDN URL
    let found = null;
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (src.includes('penguinrandomhouse.com/cover') || src.includes('images.penguinrandomhouse.com')) {
        found = src.startsWith('//') ? 'https:' + src : src;
        return false; // break
      }
    });

    if (found) {
      // Upgrade to large size if it has a size param
      const large = found.replace(/\/\d+w\.jpg/, '/600w.jpg').replace(/\?.*$/, '');
      console.log(`[Penguin Random House] ✅ "${title}": ${large}`);
      return large;
    }
    console.log(`[Penguin Random House] No cover found for: "${title}"`);
  } catch (e) {
    console.warn(`[Penguin Random House] Failed for "${title}":`, e.message);
  }
  return null;
};

const fetchGoogleBooksPoster = async (title) => {
  // Try iTunes first (fast and unblocked)
  try {
    const res = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=ebook&limit=1`, { timeout: 10000 });
    const book = res.data?.results?.[0];
    const img = book?.artworkUrl100?.replace('100x100bb', '600x900bb');
    if (img) {
      console.log(`[iTunes Book Poster] ✅ "${title}"`);
      return img;
    }
  } catch (e) {
    console.error('[iTunes Book Poster] Failed:', e.message);
  }

  // Fallback to Google Books
  try {
    const res = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title)}`, { timeout: 15000 });
    if (res.data.items && res.data.items.length > 0) {
      const links = res.data.items[0].volumeInfo?.imageLinks;
      if (links) {
        const img = links.extraLarge || links.large || links.medium || links.thumbnail;
        if (img) {
          console.log(`[Google Books] ✅ "${title}"`);
          return img.replace('zoom=1', 'zoom=3').replace('http:', 'https:');
        }
      }
    }
  } catch (e) {
    console.error('[Google Books] Failed:', e.message);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN POSTER FETCH — priority chain per media type
// ─────────────────────────────────────────────────────────────────────────────

const fetchPoster = async (title, mediaType) => {
  try {
    const type = (mediaType || '').toLowerCase();
    const cleanedTitle = cleanTitle(title);
    console.log(`\n[Poster] Fetching: "${cleanedTitle}" (type: ${type})`);

    // ── 1. ANIME ──────────────────────────────────────────
    if (type === 'anime') {
      // Fetch AniList and Kitsu in parallel
      try {
        const [anilist, kitsu] = await Promise.all([
          fetchAnilistAnimePoster(cleanedTitle).catch(() => null),
          fetchKitsuAnimePoster(cleanedTitle).catch(() => null)
        ]);
        if (anilist) return anilist;
        if (kitsu) return kitsu;
      } catch (e) {}
      
      // Jikan/MAL fallback
      try {
        const res = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanedTitle)}&limit=1`, { timeout: 15000 });
        if (res.data.data?.length > 0) {
          const img = res.data.data[0].images?.jpg?.large_image_url;
          if (img) { console.log(`[Jikan Poster] ✅ "${cleanedTitle}"`); return img; }
        }
      } catch (e) { console.warn('[Jikan Poster] Failed:', e.message); }
    }

    // ── 2. MANGA ──────────────────────────────────────────
    if (type === 'manga') {
      const mangadex = await fetchMangaDexPoster(cleanedTitle);
      if (mangadex) return mangadex;
      // Fallback to Open Library (for manga volumes published as books)
      const ol = await fetchOpenLibraryPoster(cleanedTitle);
      if (ol) return ol;
    }

    // ── 3. GAME / VISUAL NOVEL ────────────────────────────
    if (type === 'visual novel' || type === 'visualnovel') {
      const vndb = await fetchVNDBPoster(cleanedTitle);
      if (vndb) return vndb;

      try {
        const res = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanedTitle)}&l=english&cc=US`, { timeout: 15000 });
        if (res.data.items?.length > 0) {
          const img = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${res.data.items[0].id}/library_600x900.jpg`;
          console.log(`[Steam Poster] ✅ "${cleanedTitle}"`);
          return img;
        }
      } catch (e) { console.warn('[Steam Poster] Failed:', e.message); }
    }

    if (type === 'game') {
      try {
        const res = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanedTitle)}&l=english&cc=US`, { timeout: 15000 });
        if (res.data.items?.length > 0) {
          const img = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${res.data.items[0].id}/library_600x900.jpg`;
          console.log(`[Steam Poster] ✅ "${cleanedTitle}"`);
          return img;
        }
      } catch (e) { console.warn('[Steam Poster] Failed:', e.message); }

      const vndb = await fetchVNDBPoster(cleanedTitle);
      if (vndb) return vndb;
    }

    // ── 4. MOVIE / TV ─────────────────────────────────────
    if (type === 'movie' || type === 'tv' || type === 'show') {
      // TMDb and OMDb are extremely fast and reliable APIs
      try {
        const [tmdb, omdb] = await Promise.all([
          fetchTMDbPoster(cleanedTitle, type).catch(() => null),
          fetchOMDbPoster(cleanedTitle, type).catch(() => null)
        ]);
        if (tmdb) return tmdb;
        if (omdb) return omdb;
      } catch (e) {}

      // Fallback to MoviePosterDB (requires IMDB ID via OMDb/TMDb)
      const mpdb = await fetchMoviePosterDB(cleanedTitle, type);
      if (mpdb) return mpdb;

      // 4d. iTunes
      try {
        const itunesMedia = (type === 'tv' || type === 'show') ? 'tvShow' : 'movie';
        const res = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanedTitle)}&media=${itunesMedia}&country=US&limit=1`, { timeout: 15000 });
        if (res.data.results?.length > 0) {
          const img = res.data.results[0].artworkUrl100?.replace('100x100bb', '600x900bb');
          if (img) { console.log(`[iTunes Poster] ✅ "${cleanedTitle}"`); return img; }
        }
      } catch (e) {}

      // 4e. Wikipedia infobox
      const wiki = await getWikipediaImage(cleanedTitle, mediaType);
      if (wiki) return wiki;
    }

    // ── 5. BOOKS ──────────────────────────────────────────
    if (type === 'book') {
      // Open Library and Google Books in parallel
      try {
        const gb = await fetchGoogleBooksPoster(cleanedTitle).catch(() => null);
        if (gb) return gb;
        
        const ol = await fetchOpenLibraryPoster(cleanedTitle).catch(() => null);
        if (ol) return ol;
      } catch (e) {}
      
      // Penguin Random House
      const prh = await fetchPenguinRandomHousePoster(cleanedTitle);
      if (prh) return prh;
    }

    // ── 6. GLOBAL WIKIPEDIA FALLBACK ──────────────────────
    console.log(`[Poster] All type-specific sources failed. Trying Wikipedia for: "${cleanedTitle}"`);
    const wikiImg = await getWikipediaImage(cleanedTitle, mediaType);
    if (wikiImg) return wikiImg;
    if (cleanedTitle !== title) {
      const wikiImg2 = await getWikipediaImage(title, mediaType);
      if (wikiImg2) return wikiImg2;
    }

    console.warn(`[Poster] ❌ No poster found for "${title}". Returning placeholder.`);
    return `holder:${title}`;
  } catch (e) {
    console.error('[Poster] Unexpected error:', e.message);
    return `holder:${title}`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OST — LLM + iTunes + Deezer (free, no auth)
// ─────────────────────────────────────────────────────────────────────────────

const resolveIconicTrack = async (title, mediaType, snippets = []) => {
  const snippetsContext = snippets.length > 0
    ? `\nHere are some web search results and community comments about the soundtrack of this work:\n${JSON.stringify(snippets)}\nUse this context to identify the actual name and artist/composer of the main theme, opening theme, or most popular signature song.`
    : "";

  const prompt = `You are a music supervisor. For the given media title and category, identify the single most iconic, popular, or emotionally resonant song/theme song associated with it in popular culture (e.g. played in iconic scenes, opening themes, or main menus).
${snippetsContext}

Examples:
- "Rick and Morty" (tv): {"song_title": "For the Damaged Coda", "artist": "Blonde Redhead"}
- "Cyberpunk: Edgerunners" (anime): {"song_title": "I Really Want to Stay at Your House", "artist": "Rosa Walton"}
- "Interstellar" (movie): {"song_title": "Cornfield Chase", "artist": "Hans Zimmer"}
- "Steins;Gate" (anime): {"song_title": "Gate of Steiner", "artist": "Takeshi Abo"}
- "Clannad: After Story" (anime): {"song_title": "Dango Daikazoku", "artist": "Chata"}
- "Norwegian Wood" (book): {"song_title": "Norwegian Wood (This Bird Has Flown)", "artist": "The Beatles"}
- "The Book Thief" (book): {"song_title": null, "artist": null} (No universally recognized iconic soundtrack song)
- "Sayonara Eri" (manga): {"song_title": null, "artist": null}

If there is no highly popular, iconic, or officially recognized song/theme associated with the work, or if you are not 100% sure of the exact signature track name and its correct artist/composer, you MUST return null for both fields. Do not guess, do not hallucinate, and do not pair a track with a wrong artist (for example, do not match 'Reflectia' with 'Aqua Timez'). Be conservative, especially for books, games, and manga—only return a track if it's famous and deeply associated.

Media Title: "${title}"
Media Category: "${mediaType}"

Respond with ONLY a JSON object:
{
  "song_title": "Song Title or null",
  "artist": "Artist/Composer Name or null"
}`;

  try {
    const responseJson = await llmService.callOpenAI([
      { role: 'user', content: prompt }
    ], { type: 'json_object' });
    return JSON.parse(responseJson);
  } catch (e) {
    console.error(`[OST LLM Resolve] Failed for "${title}":`, e.message);
    return null;
  }
};

function isReasonableMatch(targetSong, targetArtist, resultTrack, resultArtist) {
  if (!resultTrack) return false;
  const s1 = (targetSong || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = (resultTrack || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const a1 = (targetArtist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const a2 = (resultArtist || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!s1 || !s2) return false;
  // If either contains the other
  if (s1.includes(s2) || s2.includes(s1)) return true;
  // If song names have a 4-char prefix match
  if (s1.length >= 4 && s2.length >= 4 && (s1.startsWith(s2.slice(0, 4)) || s2.startsWith(s1.slice(0, 4)))) return true;
  // If artist matches and there's some title overlap
  if (a1 && a2 && (a1.includes(a2) || a2.includes(a1))) {
    const words1 = (targetSong || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = (resultTrack || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words1.some(w => words2.includes(w))) return true;
  }
  return false;
}

function getDefaultAudioFallback() {
  if (process.env.DEFAULT_CODA_AUDIO_URL) {
    return process.env.DEFAULT_CODA_AUDIO_URL;
  }
  try {
    const configPath = path.join(__dirname, '..', 'data', 'default_audio.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.enabled && cfg.default_audio_url) {
        return cfg.default_audio_url;
      }
    }
  } catch (_) {}
  return 'https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3';
}

const fetchDeezerPreview = async (songTitle, artistName) => {
  try {
    const query = artistName ? `${artistName} - ${songTitle}` : songTitle;
    console.log(`[Deezer OST] Searching for: "${query}"`);
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, { timeout: 15000 });
    const tracks = response.data?.data || [];
    const match = tracks.find(t => t.preview && isReasonableMatch(songTitle, artistName, t.title, t.artist?.name));
    if (match) {
      console.log(`[Deezer OST] ✅ Found verified track preview: "${match.title}" by ${match.artist?.name} - ${match.preview}`);
      return match.preview;
    }
  } catch (e) {
    console.warn('[Deezer OST] Search failed:', e.message);
  }
  return null;
};

const fetchOST = async (title, mediaType) => {
  const cleanMedia = (mediaType || '').toLowerCase().trim();
  console.log(`[OST] Fetching soundtrack for: "${title}" (type: ${cleanMedia})`);

  try {
    // Search the web for theme song info first to prevent LLM hallucinations
    let snippets = [];
    try {
      const query = `"${title}" ${cleanMedia} theme song main theme soundtrack artist`;
      console.log(`[OST] Scraping web for soundtrack info: "${query}"`);
      snippets = await searchService.scrapeForums(query);
    } catch (err) {
      console.warn(`[OST] Web scrape for theme song failed:`, err.message);
    }

    // 1. Resolve iconic track via LLM using scraped snippets
    const resolved = await resolveIconicTrack(title, cleanMedia, snippets);
    if (resolved && resolved.song_title && resolved.artist) {
      const { song_title, artist } = resolved;
      console.log(`[OST] LLM resolved iconic track: "${song_title}" by ${artist}`);

      // 2. Search iTunes for the exact song + artist
      const itunesQuery = `${song_title} ${artist}`;
      const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(itunesQuery)}&media=music&entity=song&limit=5`, { timeout: 15000 }).catch(() => null);
      const itunesTracks = itunesRes?.data?.results || [];
      const itunesMatch = itunesTracks.find(r => r.previewUrl && isReasonableMatch(song_title, artist, r.trackName, r.artistName));
      if (itunesMatch) {
        console.log(`[OST] ✅ Found verified iTunes track: "${itunesMatch.trackName}" by ${itunesMatch.artistName} - ${itunesMatch.previewUrl}`);
        return itunesMatch.previewUrl;
      }

      // 3. Search Deezer for the exact song + artist
      const deezerMatch = await fetchDeezerPreview(song_title, artist);
      if (deezerMatch) {
        return deezerMatch;
      }
    } else {
      console.log(`[OST] LLM determined no iconic track exists or returned null for "${title}"`);
    }

  } catch (e) {
    console.warn(`[OST] Failed to resolve soundtrack for "${title}":`, e.message);
  }

  const fallbackAudio = getDefaultAudioFallback();
  console.log(`[OST] 🎵 Using curated ambient fallback audio for "${title}": ${fallbackAudio}`);
  return fallbackAudio;
};

const extractYoutubeId = (url) => {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i);
  return match ? match[1] : null;
};

const scrapeYoutubeDirect = async (query) => {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    });
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
    console.error(`[YouTube Direct Scrape Error] Failed to search YouTube directly for "${query}":`, e.message);
    return [];
  }
};

const fetchYoutubeTrailer = async (title, mediaType) => {
  try {
    const cleanedTitle = cleanTitle(title);
    
    let displayMediaType = mediaType || '';
    if (displayMediaType === 'visualNovel') {
      displayMediaType = 'visual novel';
    }

    let exclusionKeywords = '';
    if (mediaType && mediaType !== 'movie' && mediaType !== 'tv') {
      exclusionKeywords = ' -"live action" -"live-action"';
    }
    
    // 1. Try direct YouTube search scraping first
    const ytQuery = `${cleanedTitle} ${displayMediaType} official trailer${exclusionKeywords}`;
    console.log(`[Trailer Search] Searching YouTube directly: "${ytQuery}"`);
    const ytVideoIds = await scrapeYoutubeDirect(ytQuery);
    if (ytVideoIds.length > 0) {
      console.log(`[Trailer Search] ✅ Found trailer video ID directly from YouTube: ${ytVideoIds[0]}`);
      return ytVideoIds[0];
    }
    
    // 2. Fallback to scrapeForums (general search engines)
    const query = `"${cleanedTitle}" ${displayMediaType} official trailer${exclusionKeywords} youtube`;
    console.log(`[Trailer Search] Fallback to scrapeForums: "${query}"`);
    const results = await searchService.scrapeForums(query);
    
    for (const r of results) {
      const videoId = extractYoutubeId(r.link) || extractYoutubeId(r.snippet);
      if (videoId) {
        console.log(`[Trailer Search] ✅ Found trailer video ID: ${videoId} from link: ${r.link}`);
        return videoId;
      }
    }
    
    // Fallback: try without quotes
    const fallbackQuery = `${cleanedTitle} ${displayMediaType} trailer youtube`;
    console.log(`[Trailer Search] Fallback search without quotes: "${fallbackQuery}"`);
    const fallbackResults = await searchService.scrapeForums(fallbackQuery);
    for (const r of fallbackResults) {
      const videoId = extractYoutubeId(r.link) || extractYoutubeId(r.snippet);
      if (videoId) {
        console.log(`[Trailer Search] ✅ Found trailer video ID (fallback): ${videoId} from link: ${r.link}`);
        return videoId;
      }
    }
  } catch (err) {
    console.error(`[Trailer Search Error] Failed to fetch trailer for ${title}:`, err.message);
  }
  return '';
};

const fetchAssets = async (title, mediaType) => {
  const normMediaType = (mediaType || '').toLowerCase().trim();
  const key = `${cacheNormalize(title)}:${normMediaType}`;
  
  let assets = assetCache[key];
  if (assets && assets.trailer_url !== undefined) {
    if (assets.poster_url && assets.poster_url.startsWith('http') && !assets.poster_url.includes('/api/recommend/proxy-image')) {
      assets.poster_url = `/api/recommend/proxy-image?url=${encodeURIComponent(assets.poster_url)}`;
      assetCache[key] = assets;
      saveAssetCache();
    }
    console.log(`[Asset Cache Hit] serving cached assets for: "${title}" (${mediaType})`);
    return assets;
  }

  // Parallelize all three independent asset fetches for maximum speed.
  // poster_url and ost_url may already be cached individually; trailer_url is always re-fetched
  // until it lands in the full-cache check above.
  const [raw_poster_url, ost_url, trailer_url] = await Promise.all([
    assets ? Promise.resolve(assets.poster_url) : fetchPoster(title, mediaType),
    assets ? Promise.resolve(assets.ost_url)    : fetchOST(title, mediaType),
    Promise.resolve(''),
  ]);

  let poster_url = raw_poster_url || '';
  if (poster_url && poster_url.startsWith('http') && !poster_url.includes('/api/recommend/proxy-image')) {
    poster_url = `/api/recommend/proxy-image?url=${encodeURIComponent(poster_url)}`;
  }
  
  assets = { poster_url, ost_url, trailer_url };
  assetCache[key] = assets;
  saveAssetCache();
  return assets;
};

module.exports = {
  fetchAssets
};

