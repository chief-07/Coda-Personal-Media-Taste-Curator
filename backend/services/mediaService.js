const axios = require('axios');
const cheerio = require('cheerio');

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
      timeout: 8000
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
        timeout: 8000
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
        timeout: 8000
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
      timeout: 8000
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
      timeout: 8000
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
      const res = await axios.get(url, { timeout: 8000 });
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
      const searchRes = await axios.get(searchUrl, { timeout: 8000 });
      const firstResult = searchRes.data?.results?.[0];
      if (firstResult?.id) {
        const extUrl = `https://api.themoviedb.org/3/${searchType}/${firstResult.id}/external_ids?api_key=${tmdbKey}`;
        const extRes = await axios.get(extUrl, { timeout: 8000 });
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
      timeout: 12000,
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
    const res = await axios.get(searchUrl, { timeout: 8000 });
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
    const res = await axios.get(url, { timeout: 8000 });
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
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000
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
      return exactMatch.image.url;
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
      return partialMatch.image.url;
    }

    // 3. Fallback to first result with image
    const firstWithImg = results.find(r => r.image?.url);
    if (firstWithImg) {
      console.log(`[VNDB Poster] ⚠️ Fallback first image: "${cleanedTitle}" → ${firstWithImg.image.url} (Title: ${firstWithImg.title})`);
      return firstWithImg.image.url;
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
      timeout: 8000
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
        timeout: 8000
      });
      const coverFile = coverRes.data?.data?.[0]?.attributes?.fileName;
      if (coverFile) {
        const img = `https://uploads.mangadex.org/covers/${mangaId}/${coverFile}.512.jpg`;
        console.log(`[MangaDex] ✅ "${title}": ${img}`);
        return img;
      }
    } else {
      const img = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
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
      timeout: 8000
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
      timeout: 10000
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
  try {
    const res = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title)}`, { timeout: 8000 });
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
      // AniList (extraLarge quality covers)
      const anilist = await fetchAnilistAnimePoster(cleanedTitle);
      if (anilist) return anilist;
      // Kitsu (good quality poster images)
      const kitsu = await fetchKitsuAnimePoster(cleanedTitle);
      if (kitsu) return kitsu;
      // Jikan/MAL fallback
      try {
        const res = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanedTitle)}&limit=1`, { timeout: 8000 });
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
        const res = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanedTitle)}&l=english&cc=US`, { timeout: 8000 });
        if (res.data.items?.length > 0) {
          const img = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${res.data.items[0].id}/library_600x900.jpg`;
          console.log(`[Steam Poster] ✅ "${cleanedTitle}"`);
          return img;
        }
      } catch (e) { console.warn('[Steam Poster] Failed:', e.message); }
    }

    if (type === 'game') {
      try {
        const res = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanedTitle)}&l=english&cc=US`, { timeout: 8000 });
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
    // MPDB is first — highest quality, real movie posters
    if (type === 'movie' || type === 'tv' || type === 'show') {
      // 4a. MoviePosterDB (requires IMDB ID via OMDb/TMDb)
      const mpdb = await fetchMoviePosterDB(cleanedTitle, type);
      if (mpdb) return mpdb;

      // 4b. TMDb poster
      const tmdb = await fetchTMDbPoster(cleanedTitle, type);
      if (tmdb) return tmdb;

      // 4c. OMDb poster (high-res Amazon/IMDb CDN)
      const omdb = await fetchOMDbPoster(cleanedTitle, type);
      if (omdb) return omdb;

      // 4d. iTunes
      try {
        const itunesMedia = (type === 'tv' || type === 'show') ? 'tvShow' : 'movie';
        const res = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanedTitle)}&media=${itunesMedia}&country=US&limit=1`, { timeout: 8000 });
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
      // Open Library
      const ol = await fetchOpenLibraryPoster(cleanedTitle);
      if (ol) return ol;
      // Penguin Random House
      const prh = await fetchPenguinRandomHousePoster(cleanedTitle);
      if (prh) return prh;
      // Google Books
      const gb = await fetchGoogleBooksPoster(cleanedTitle);
      if (gb) return gb;
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
// OST — iTunes API (free, no auth)
// ─────────────────────────────────────────────────────────────────────────────

const fetchOST = async (title) => {
  try {
    console.log(`[OST] Fetching soundtrack for: "${title}"`);
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title + ' soundtrack')}&media=music&entity=song&limit=5`;
    const res = await axios.get(url, { timeout: 8000 });
    const results = res.data?.results || [];
    if (results.length > 0) {
      const match = results.find(r => r.previewUrl);
      if (match) {
        console.log(`[OST] ✅ Found soundtrack preview for "${title}": "${match.trackName}" by ${match.artistName} - ${match.previewUrl}`);
        return match.previewUrl;
      }
    }
  } catch (e) {
    console.warn(`[OST] iTunes soundtrack query failed for "${title}":`, e.message);
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title + ' theme')}&media=music&entity=song&limit=5`;
    const res = await axios.get(url, { timeout: 8000 });
    const results = res.data?.results || [];
    if (results.length > 0) {
      const match = results.find(r => r.previewUrl);
      if (match) {
        console.log(`[OST] ✅ Found theme preview for "${title}": "${match.trackName}" by ${match.artistName} - ${match.previewUrl}`);
        return match.previewUrl;
      }
    }
  } catch (e) {
    console.warn(`[OST] iTunes theme query failed for "${title}":`, e.message);
  }

  console.warn(`[OST] ❌ No soundtrack found for "${title}". Returning static placeholder.`);
  return 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
};

const fetchAssets = async (title, mediaType) => {
  const poster_url = await fetchPoster(title, mediaType);
  const ost_url = await fetchOST(title);
  return { poster_url, ost_url };
};

module.exports = {
  fetchAssets
};
