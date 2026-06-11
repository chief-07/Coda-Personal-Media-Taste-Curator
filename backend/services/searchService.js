const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.67'
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Words that are harmless as descriptors but cause search engines to return
// unrelated brand results (DeepL, DeepSeek, etc.)
const sanitizeQuery = (query) => {
  // Replace standalone 'deep' with 'profound' to avoid DeepL/DeepSeek brand pollution
  return query.replace(/\bdeep\b/gi, 'profound').replace(/\s+/g, ' ').trim();
};

const getScraperHeaders = () => ({
  'User-Agent': getRandomUserAgent(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Ch-Ua': '"Chromium";v="118", "Google Chrome";v="118", "Not=A?Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1'
});

// ─────────────────────────────────────────────────
// WEB SCRAPERS (DDG → Yahoo → Bing fallback chain)
// ─────────────────────────────────────────────────

const scrapeDDG = async (query) => {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: getScraperHeaders(),
      timeout: 30000
    });
    const $ = cheerio.load(response.data);
    const results = [];
    $('.result').each((i, el) => {
      if (i >= 5) return false;
      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const link = $(el).find('.result__url').text().trim();
      if (title && snippet) {
        results.push({ title, snippet, link });
      }
    });
    return results;
  } catch (error) {
    console.warn('[SearchService - DDG Error]:', error.message);
    return [];
  }
};

const scrapeYahoo = async (query) => {
  try {
    const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: getScraperHeaders(),
      timeout: 30000
    });
    const $ = cheerio.load(response.data);
    const results = [];
    $('.algo').each((i, el) => {
      if (i >= 5) return false;
      const title = $(el).find('h3').text().trim();
      const snippet = $(el).find('.compText').text().trim() || $(el).find('.lh-16').text().trim();
      let link = $(el).find('.compTitle a').attr('href') || $(el).find('a').attr('href');
      
      if (link && link.includes('/RU=')) {
        try {
          const parts = link.split('/RU=');
          if (parts.length > 1) {
            const ruPart = parts[1].split('/')[0];
            link = decodeURIComponent(ruPart);
          }
        } catch (_) {}
      }

      if (title && snippet) {
        results.push({ title, snippet, link });
      }
    });
    return results;
  } catch (error) {
    console.warn('[SearchService - Yahoo Error]:', error.message);
    return [];
  }
};

const scrapeBing = async (query) => {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: getScraperHeaders(),
      timeout: 30000
    });
    const $ = cheerio.load(response.data);
    const results = [];
    $('.b_algo').each((i, el) => {
      if (i >= 5) return false;
      const title = $(el).find('h2').text().trim();
      const snippet = $(el).find('.b_caption p').text().trim() || $(el).find('.b_algoSlug').text().trim() || $(el).find('.b_lineLimit2').text().trim();
      const link = $(el).find('h2 a').attr('href');
      if (title && snippet) {
        results.push({ title, snippet, link });
      }
    });
    return results;
  } catch (error) {
    console.warn('[SearchService - Bing Error]:', error.message);
    return [];
  }
};

// ─────────────────────────────────────────────────
// REDDIT OAUTH — reliable forum search
// Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET in .env
// Set up free at: https://www.reddit.com/prefs/apps (script type app)
// ─────────────────────────────────────────────────

let _redditToken = null;
let _redditTokenExpiry = 0;

const getRedditToken = async () => {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (_redditToken && Date.now() < _redditTokenExpiry) return _redditToken;

  try {
    const res = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      {
        auth: { username: clientId, password: clientSecret },
        headers: {
          'User-Agent': 'CodaRecommendations/1.0',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );
    _redditToken = res.data.access_token;
    _redditTokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    console.log('[Reddit OAuth] Token obtained successfully');
    return _redditToken;
  } catch (e) {
    console.warn('[Reddit OAuth] Token fetch failed:', e.message);
    return null;
  }
};

/**
 * Search Reddit via OAuth API (reliable) or fall back to MAL reviews (human voice fallback).
 */
const searchRedditDirect = async (subreddit, searchTerms, limit = 5) => {
  const cleanTerms = searchTerms.replace(/\s+/g, ' ').trim().substring(0, 100);

  // ── Try Reddit OAuth (if credentials configured) ──────────────────
  const token = await getRedditToken();
  if (token) {
    try {
      const url = `https://oauth.reddit.com/r/${subreddit}/search?q=${encodeURIComponent(cleanTerms)}&restrict_sr=on&sort=relevance&t=all&limit=${limit}`;
      console.log(`[Reddit OAuth] Searching r/${subreddit} for: "${cleanTerms}"`);
      const res = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'CodaRecommendations/1.0'
        },
        timeout: 30000
      });
      const posts = res.data?.data?.children || [];
      if (posts.length > 0) {
        console.log(`[Reddit OAuth] Got ${posts.length} posts from r/${subreddit}`);
        return posts.map(p => {
          const post = p.data;
          const title = post.title || '';
          const body = (post.selftext || '').substring(0, 500);
          return {
            title,
            snippet: `[Reddit r/${subreddit}] ${title}${body ? ' — ' + body : ''}`,
            link: `https://www.reddit.com${post.permalink || ''}`
          };
        });
      }
    } catch (e) {
      console.warn(`[Reddit OAuth] Search failed for r/${subreddit}:`, e.message);
    }
  } else {
    console.warn(`[Reddit] No credentials configured — trying PullPush API fallback for r/${subreddit}`);
  }

  // ── Try PullPush API Fallback (free, keyless community archive) ──────
  try {
    const url = `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(cleanTerms)}&subreddit=${subreddit}&limit=${limit}`;
    console.log(`[Reddit PullPush] Searching r/${subreddit} for: "${cleanTerms}"`);
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 30000
    });
    const submissions = res.data?.data || [];
    if (submissions.length > 0) {
      console.log(`[Reddit PullPush] Got ${submissions.length} submissions from r/${subreddit}`);
      return submissions.map(post => {
        const title = post.title || '';
        const body = (post.selftext || '').substring(0, 500);
        return {
          title,
          snippet: `[Reddit r/${subreddit}] ${title}${body ? ' — ' + body : ''}`,
          link: `https://www.reddit.com${post.permalink || ''}`
        };
      });
    }
  } catch (e) {
    console.warn(`[Reddit PullPush] Failed for r/${subreddit}:`, e.message);
  }

  return [];
};


const scrapeForums = async (query) => {
  // Sanitize query to prevent search engine brand-name pollution
  const cleanedQuery = sanitizeQuery(query);
  if (cleanedQuery !== query) {
    console.log(`[SearchService] Query sanitized: "${query}" → "${cleanedQuery}"`);
  }

  // Extract subreddit from site: constraint if present (e.g. "site:reddit.com/r/animesuggest")
  // Then strip it from the search terms so Reddit search gets clean keywords
  const subredditMatch = cleanedQuery.match(/site:reddit\.com\/r\/([a-zA-Z0-9_]+)/i)
    || cleanedQuery.match(/r\/([a-zA-Z0-9_]+)/i);
  const subreddit = subredditMatch ? subredditMatch[1] : null;

  // Clean the search terms: remove site: constraints and subreddit references
  const searchTerms = cleanedQuery
    .replace(/site:[^\s]+/gi, '')
    .replace(/\br\/[a-zA-Z0-9_]+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // ── PRIMARY: Reddit native JSON search ──────────────────────────────
  if (subreddit) {
    const redditResults = await searchRedditDirect(subreddit, searchTerms);
    if (redditResults.length > 0) return redditResults;
  }

  // ── FALLBACK 1: Yahoo web scrape (working and unblocked!) ──────────────
  await delay(Math.floor(Math.random() * 300) + 200);
  console.log(`[SearchService] Reddit returned 0 results. Trying Yahoo fallback for: "${cleanedQuery}"`);
  const yahooResults = await scrapeYahoo(cleanedQuery);
  if (yahooResults && yahooResults.length > 0) return yahooResults;

  // ── FALLBACK 2: DDG web scrape ───────────────────────────────────────
  await delay(Math.floor(Math.random() * 300) + 200);
  console.log(`[SearchService] Yahoo returned 0 results. Trying DDG fallback for: "${cleanedQuery}"`);
  const ddgResults = await scrapeDDG(cleanedQuery);
  if (ddgResults && ddgResults.length > 0) return ddgResults;

  // ── LAST RESORT: Bing ────────────────────────────────────────────────
  console.log(`[SearchService] DDG returned 0 results. Trying Bing...`);
  await delay(Math.floor(Math.random() * 300) + 200);
  return await scrapeBing(cleanedQuery) || [];
};


// ─────────────────────────────────────────────────
// MAL / JIKAN — Community recommendation votes
// ─────────────────────────────────────────────────

const fetchMALRecommendations = async (titles) => {
  if (!titles || !Array.isArray(titles) || titles.length === 0) return [];
  const results = [];
  
  // Limit to first 2 titles to avoid hitting MAL's rate limit too heavily
  const targetTitles = titles.slice(0, 2);

  for (const title of targetTitles) {
    try {
      console.log(`[MAL/Jikan] Searching for anime: "${title}"`);
      await delay(500);
      const searchRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`, { timeout: 30000 });
      const anime = searchRes.data?.data?.[0];
      if (!anime) {
        console.warn(`[MAL/Jikan] No anime found for: "${title}"`);
        continue;
      }

      const malId = anime.mal_id;
      console.log(`[MAL/Jikan] Found mal_id: ${malId} for "${title}". Fetching recommendations...`);
      
      await delay(500);
      const recRes = await axios.get(`https://api.jikan.moe/v4/anime/${malId}/recommendations`, { timeout: 30000 });
      const recommendations = recRes.data?.data || [];
      
      const topRecs = recommendations.slice(0, 5);
      for (const rec of topRecs) {
        const recTitle = rec.entry?.title;
        const votes = rec.votes || 0;
        const url = rec.entry?.url || rec.url || '';
        if (recTitle) {
          results.push({
            title: recTitle,
            snippet: `[MAL Recommendation based on ${title}]: Users who liked ${title} also highly recommended watching ${recTitle} on MyAnimeList (with ${votes} community votes).`,
            link: url
          });
        }
      }
    } catch (error) {
      console.error(`[MAL/Jikan] Failed for "${title}":`, error.message);
    }
  }

  return results;
};

/**
 * Fetch real user-written reviews from MyAnimeList via Jikan.
 * Reviews contain human voice: "this reminded me of...", "if you liked X...", theme discussions.
 * Used as the primary human-opinion source when Reddit is unavailable.
 * @param {string[]} titles - anime titles to fetch reviews for
 * @param {number} reviewsPerTitle - max reviews per title
 */
const fetchMALReviews = async (titles, reviewsPerTitle = 3) => {
  if (!titles || titles.length === 0) return [];
  const results = [];

  for (const title of titles.slice(0, 3)) {
    try {
      // First look up the MAL ID for this title
      await delay(350);
      const searchRes = await axios.get(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
        { timeout: 30000 }
      );
      const anime = searchRes.data?.data?.[0];
      if (!anime) continue;

      const malId = anime.mal_id;
      const canonicalTitle = anime.title_english || anime.title || title;

      // Fetch user reviews
      await delay(400);
      const reviewRes = await axios.get(
        `https://api.jikan.moe/v4/anime/${malId}/reviews?page=1`,
        { timeout: 30000 }
      );
      const reviews = reviewRes.data?.data || [];
      console.log(`[MAL Reviews] Got ${reviews.length} reviews for "${canonicalTitle}"`);

      for (const review of reviews.slice(0, reviewsPerTitle)) {
        const reviewText = (review.review || '').substring(0, 500);
        const score = review.scores?.overall || review.score || '?';
        const reviewer = review.user?.username || 'user';
        if (reviewText.length > 50) {
          results.push({
            title: canonicalTitle,
            snippet: `[MAL Review of ${canonicalTitle} by ${reviewer}, score ${score}/10]: ${reviewText}`,
            link: `https://myanimelist.net/anime/${malId}`
          });
        }
      }
    } catch (e) {
      console.warn(`[MAL Reviews] Failed for "${title}":`, e.message);
    }
  }

  return results;
};

// ─────────────────────────────────────────────────
// KITSU — Free anime/manga database (no auth)
// Gives structured title data: synopsis, rating, genres
// ─────────────────────────────────────────────────

// Genre keyword → Jikan/MAL genre ID mapping
const MAL_GENRE_MAP = {
  psychological: 40,
  thriller: 41,
  horror: 14,
  mystery: 7,
  drama: 8,
  romance: 22,
  fantasy: 10,
  'sci-fi': 24,
  scifi: 24,
  action: 1,
  adventure: 2,
  comedy: 4,
  'slice of life': 36,
  supernatural: 37,
  music: 19,
  sports: 30,
  historical: 13,
  military: 38,
  // Extended mappings for vibe/descriptive queries
  dark: 8,           // → Drama
  serious: 8,        // → Drama
  emotional: 8,      // → Drama
  existential: 40,   // → Psychological
  existentialism: 40,
  philosophical: 40,
  philosophy: 40,
  sad: 8,
  tragic: 8,
  tragedy: 8,
  mature: 8,
  suspense: 41,      // → Thriller
  violent: 1,        // → Action
  war: 38,           // → Military
  dystopia: 24,      // → Sci-Fi
  'coming of age': 8,
};

/**
 * Search MAL (via Jikan) by genre + optional keyword for thematic discovery.
 * This replaces Kitsu which only does title-matching (useless for vibe queries).
 */
const fetchKitsuAnimeSnippets = async (query) => {
  try {
    console.log(`[Jikan/MAL] Thematic search for: "${query}"`);
    const qLower = query.toLowerCase();

    // Extract matched genre IDs from query
    const matchedGenreIds = [];
    for (const [kw, id] of Object.entries(MAL_GENRE_MAP)) {
      if (qLower.includes(kw)) matchedGenreIds.push(id);
    }

    let url;
    if (matchedGenreIds.length > 0) {
      // Search by genre (most reliable for vibe queries)
      url = `https://api.jikan.moe/v4/anime?genres=${matchedGenreIds.slice(0, 2).join(',')}&order_by=score&sort=desc&limit=6`;
    } else {
      // Fallback: use Drama + Psychological as safe defaults for unrecognized queries
      // (Do NOT use keyword search — it matches titles, not themes)
      url = `https://api.jikan.moe/v4/anime?genres=8,40&order_by=score&sort=desc&limit=6`;
    }

    const res = await axios.get(url, { timeout: 30000 });
    const items = res.data?.data || [];
    if (items.length === 0) {
      console.warn(`[Jikan/MAL] No results for: "${query}"`);
      return [];
    }

    console.log(`[Jikan/MAL] Got ${items.length} results for: "${query}" (genre IDs: ${matchedGenreIds})`);
    return items.map(item => {
      const title = item.title_english || item.title || 'Unknown';
      const synopsis = (item.synopsis || '').substring(0, 300);
      const score = item.score ? `MAL score: ${item.score}/10.` : '';
      const genres = (item.genres || []).map(g => g.name).join(', ');
      const type = item.type || '';
      return {
        title,
        snippet: `[MAL] ${title} (${type}, ${genres}): ${synopsis} ${score}`.trim(),
        link: item.url || `https://myanimelist.net/anime/${item.mal_id}`
      };
    });
  } catch (e) {
    console.warn(`[Jikan/MAL] Search failed for "${query}":`, e.message);
    return [];
  }
};

// ─────────────────────────────────────────────────
// ANILIST — GraphQL anime search + recommendations
// Gives scores, genres, tags, and similar titles
// ─────────────────────────────────────────────────

const fetchAniListAnimeSnippets = async (query) => {
  try {
    console.log(`[AniList] Searching for: "${query}"`);

    // AniList's `search` only matches titles — try that first
    const titleGql = `
      query ($search: String) {
        Page(perPage: 5) {
          media(search: $search, type: ANIME, sort: SCORE_DESC) {
            id
            title { romaji english }
            description
            averageScore
            genres
            tags { name rank }
          }
        }
      }
    `;
    const titleRes = await axios.post(
      'https://graphql.anilist.co',
      { query: titleGql, variables: { search: query } },
      { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 30000 }
    );
    let media = titleRes.data?.data?.Page?.media || [];

    // If title search returns nothing (vibe/descriptive queries), fall back to genre+tag filtering
    if (media.length === 0) {
      console.log(`[AniList] Title search found nothing — trying genre/tag-based discovery...`);
      const qLower = query.toLowerCase();

      // Map query keywords → AniList genre names
      const GENRE_MAP = {
        'psychological': 'Psychological', 'thriller': 'Thriller', 'horror': 'Horror',
        'mystery': 'Mystery', 'drama': 'Drama', 'romance': 'Romance',
        'fantasy': 'Fantasy', 'sci-fi': 'Sci-Fi', 'scifi': 'Sci-Fi',
        'action': 'Action', 'adventure': 'Adventure', 'comedy': 'Comedy',
        'supernatural': 'Supernatural', 'historical': 'Historical',
        'existential': 'Psychological', 'dark': 'Drama', 'serious': 'Drama',
        'existentialism': 'Psychological', 'emotional': 'Drama', 'sad': 'Drama',
        'violent': 'Action', 'mecha': 'Mecha', 'slice of life': 'Slice of Life',
      };
      const TAG_MAP = {
        'existential': 'Philosophy', 'philosophical': 'Philosophy',
        'psychological': 'Psychological', 'dark': 'Dark Themes',
        'mature': 'Mature Themes', 'serious': 'Serious', 'death': 'Death',
        'tragedy': 'Tragedy', 'war': 'War', 'survival': 'Survival',
        'dystopia': 'Dystopia', 'coming of age': 'Coming of Age',
      };

      const matchedGenres = [...new Set(
        Object.entries(GENRE_MAP)
          .filter(([kw]) => qLower.includes(kw))
          .map(([, g]) => g)
      )].slice(0, 3);

      const matchedTags = [...new Set(
        Object.entries(TAG_MAP)
          .filter(([kw]) => qLower.includes(kw))
          .map(([, t]) => t)
      )].slice(0, 3);

      // Default to Drama if nothing matched
      const genreFilter = matchedGenres.length > 0 ? matchedGenres : ['Drama'];
      const tagFilter = matchedTags.length > 0 ? matchedTags : [];

      console.log(`[AniList] Using genres: ${genreFilter}, tags: ${tagFilter}`);

      const discoveryGql = `
        query ($genres: [String], $tags: [String]) {
          Page(perPage: 8) {
            media(
              type: ANIME,
              sort: SCORE_DESC,
              genre_in: $genres,
              tag_in: $tags,
              format_in: [TV, MOVIE, OVA, SPECIAL]
            ) {
              id
              title { romaji english }
              description
              averageScore
              genres
              tags { name rank }
            }
          }
        }
      `;
      const discoveryRes = await axios.post(
        'https://graphql.anilist.co',
        { query: discoveryGql, variables: { genres: genreFilter, tags: tagFilter.length > 0 ? tagFilter : undefined } },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 30000 }
      );
      media = discoveryRes.data?.data?.Page?.media || [];
      // If tag+genre combo returns nothing, try genre only
      if (media.length === 0 && tagFilter.length > 0) {
        const fallbackRes = await axios.post(
          'https://graphql.anilist.co',
          { query: discoveryGql, variables: { genres: genreFilter, tags: undefined } },
          { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 30000 }
        );
        media = fallbackRes.data?.data?.Page?.media || [];
      }
      console.log(`[AniList] Genre/tag discovery returned ${media.length} results`);
    }

    if (media.length === 0) {
      console.warn(`[AniList] No results at all for: "${query}"`);
      return [];
    }

    console.log(`[AniList] Got ${media.length} results for: "${query}"`);
    return media.map(m => {
      const title = m.title.english || m.title.romaji || 'Unknown';
      const desc = (m.description || '').replace(/<[^>]*>/g, '').substring(0, 300);
      const score = m.averageScore ? `AniList score: ${m.averageScore}/100.` : '';
      const genres = (m.genres || []).slice(0, 5).join(', ');
      const topTags = (m.tags || []).filter(t => t.rank >= 70).slice(0, 4).map(t => t.name).join(', ');
      return {
        title,
        snippet: `[AniList] ${title} (${genres}): ${desc} ${score} Tags: ${topTags}`.trim(),
        link: `https://anilist.co/anime/${m.id}`
      };
    });
  } catch (e) {
    console.warn(`[AniList] Search failed for "${query}":`, e.message);
    return [];
  }
};

// ─────────────────────────────────────────────────
// ANILIST RECOMMENDATIONS — for a known favorite title
// Used to supplement MAL community votes with AniList graph
// ─────────────────────────────────────────────────

const fetchAniListRecommendations = async (titles) => {
  if (!titles || titles.length === 0) return [];
  const results = [];

  for (const title of titles.slice(0, 2)) {
    try {
      console.log(`[AniList Recs] Fetching recommendations for: "${title}"`);
      const gql = `
        query ($search: String) {
          Media(search: $search, type: ANIME) {
            title { romaji english }
            recommendations(perPage: 8, sort: RATING_DESC) {
              nodes {
                rating
                mediaRecommendation {
                  title { romaji english }
                  description
                  averageScore
                  genres
                }
              }
            }
          }
        }
      `;
      const res = await axios.post(
        'https://graphql.anilist.co',
        { query: gql, variables: { search: title } },
        {
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          timeout: 30000
        }
      );
      const nodes = res.data?.data?.Media?.recommendations?.nodes || [];
      for (const node of nodes) {
        const rec = node.mediaRecommendation;
        if (!rec) continue;
        const recTitle = rec.title.english || rec.title.romaji;
        const desc = (rec.description || '').replace(/<[^>]*>/g, '').substring(0, 200);
        const genres = (rec.genres || []).slice(0, 4).join(', ');
        results.push({
          title: recTitle,
          snippet: `[AniList Recommendation based on ${title}]: ${recTitle} (${genres}) — ${desc} AniList score: ${rec.averageScore || 'N/A'}/100. Community rated this recommendation ${node.rating || 0} times.`,
          link: ''
        });
      }
      console.log(`[AniList Recs] Got ${nodes.length} recommendations for: "${title}"`);
    } catch (e) {
      console.warn(`[AniList Recs] Failed for "${title}":`, e.message);
    }
    await delay(300);
  }

  return results;
};

// ─────────────────────────────────────────────────
// VNDB API — Visual Novel Database (free, no auth)
// https://api.vndb.org/kana
// ─────────────────────────────────────────────────

// Map common VN taste keywords to VNDB tag IDs
// Full tag list: https://vndb.org/g
const VN_TAG_MAP = {
  romance:       'g134',  // Romance
  school:        'g136',  // School Setting
  'slice of life': 'g170', // Slice of Life
  emotional:     'g542',  // Emotionally Engaging
  tragedy:       'g175',  // Tragedy
  nakige:        'g204',  // Utsuge / Nakige (crying game)
  psychological: 'g128',  // Psychological
  fantasy:       'g11',   // Fantasy
  horror:        'g14',   // Horror
  mystery:       'g24',   // Mystery
  scifi:         'g18',   // Sci-fi
  'multiple routes': 'g153', // Multiple Endings / Routes
  harem:         'g30',   // Harem
};

/**
 * Fetch visual novels from VNDB using free-text search + optional tag/platform filters.
 * This replaces the old tag-only approach to return diverse results per query.
 * @param {string} queryHint - A descriptive query hint (used for both text search and tag matching)
 * @param {number} limit - Max titles to return
 * @param {string|string[]} platformHint - Optional platform filtering hints (e.g. "Android", ["Android only"])
 */
const fetchVNDBSnippets = async (queryHint = '', limit = 6, platformHint = null) => {
  try {
    console.log(`[VNDB] Searching by vibe: "${queryHint}" (platforms: ${JSON.stringify(platformHint)})`);

    const hintLower = queryHint.toLowerCase();

    // Clean the query: strip reddit/site: constraints, keep descriptive keywords
    const cleanQuery = queryHint
      .replace(/site:[^\s]+/gi, '')
      .replace(/\b(site|reddit|visualnovels|animesuggest|suggestmeabook)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80);

    // Platform filtering
    let platformFilter = null;
    const combinedHints = (queryHint + ' ' + (Array.isArray(platformHint) ? platformHint.join(' ') : (platformHint || ''))).toLowerCase();

    if (combinedHints.includes('android')) {
      platformFilter = ['platform', '=', 'and'];
    } else if (combinedHints.includes('web') || combinedHints.includes('browser')) {
      platformFilter = ['platform', '=', 'web'];
    } else if (combinedHints.includes('ios')) {
      platformFilter = ['platform', '=', 'ios'];
    }

    // Build filters: use free-text search as the primary filter
    // VNDB's "search" filter does title + description matching
    let queryFilters;
    if (cleanQuery.length > 3) {
      queryFilters = ['and', ['search', '=', cleanQuery]];
      if (platformFilter) {
        queryFilters.push(platformFilter);
      }
    } else {
      // Fallback to tag-based if cleaned query is too short
      const tagIds = [];
      for (const [keyword, tagId] of Object.entries(VN_TAG_MAP)) {
        if (hintLower.includes(keyword)) {
          tagIds.push(tagId);
          if (tagIds.length >= 2) break;
        }
      }
      if (tagIds.length === 0) tagIds.push('g134', 'g136');
      queryFilters = ['and', ['tag', '=', tagIds[0]]];
      if (tagIds[1]) queryFilters.push(['tag', '=', tagIds[1]]);
      if (platformFilter) queryFilters.push(platformFilter);
    }

    // Use searchrank sort for more query-relevant, diverse results
    const body = {
      filters: queryFilters,
      fields: 'title, alttitle, rating, votecount, description, tags.name, tags.rating, released, platforms',
      sort: 'searchrank',
      reverse: false,
      results: limit,
      page: 1
    };

    const res = await axios.post('https://api.vndb.org/kana/vn', body, {
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'CodaRecommendations/1.0'
      },
      timeout: 30000
    });

    const items = res.data?.results || [];
    if (items.length === 0) {
      console.warn(`[VNDB] No results for vibe: "${queryHint}"`);
      return [];
    }

    console.log(`[VNDB] Got ${items.length} results for: "${queryHint}"`);
    return items.map(vn => {
      const title = vn.title || vn.alttitle || 'Unknown';
      const desc = (vn.description || '').replace(/\[.+?\]/g, '').substring(0, 300);
      const rating = vn.rating ? `VNDB rating: ${(vn.rating / 10).toFixed(1)}/10` : '';
      const votes = vn.votecount ? `(${vn.votecount.toLocaleString()} votes)` : '';
      const platforms = (vn.platforms || []).join(', ');
      const topTags = (vn.tags || [])
        .filter(t => t.rating >= 1.5)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5)
        .map(t => t.name)
        .join(', ');
      return {
        title,
        snippet: `[VNDB] ${title}: ${desc} ${rating} ${votes}. Platforms: ${platforms}. Top tags: ${topTags}.`.trim(),
        link: `https://vndb.org/v${vn.id}`
      };
    });
  } catch (e) {
    console.warn(`[VNDB] Search failed for "${queryHint}":`, e.message);
    return [];
  }
};

/**
 * Look up a specific known VN title on VNDB and return its top VNDB recommendations
 * ("Users who liked X also liked Y") by checking similar-tagged high-rated titles.
 * @param {string[]} titles - Known VN titles the user likes (e.g. ["Katawa Shoujo", "Tsukihime"])
 */
const fetchVNDBRecommendations = async (titles) => {
  if (!titles || titles.length === 0) return [];
  const results = [];

  for (const title of titles.slice(0, 2)) {
    try {
      console.log(`[VNDB Recs] Looking up: "${title}"`);
      // Step 1: find the VN by title search
      const searchBody = {
        filters: ['search', '=', title],
        fields: 'title, id, rating, votecount, tags.name, tags.id, tags.rating, tags.spoiler',
        sort: 'searchrank',
        results: 1
      };
      const searchRes = await axios.post('https://api.vndb.org/kana/vn', searchBody, {
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'CodaRecommendations/1.0'
        },
        timeout: 30000
      });
      const found = searchRes.data?.results?.[0];
      if (!found) {
        console.warn(`[VNDB Recs] Title not found: "${title}"`);
        continue;
      }
      console.log(`[VNDB Recs] Found "${found.title}" (${found.id}). Tags: ${(found.tags || []).slice(0,5).map(t => t.name).join(', ')}`);

      // Step 2: pick the top non-spoiler content tags by rating to find similar VNs
      const topTags = (found.tags || [])
        .filter(t => t.spoiler === 0 && t.rating >= 1.5)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3);

      if (topTags.length === 0) {
        console.warn(`[VNDB Recs] No usable tags for "${title}", skipping tag-based search`);
        continue;
      }

      // Step 3: search by the first strong tag ID, filter by rating, exclude source VN
      const primaryTagId = topTags[0].id; // e.g. "g134"
      console.log(`[VNDB Recs] Using primary tag: "${topTags[0].name}" (${primaryTagId})`);
      const recBody = {
        filters: ['and',
          ['tag', '=', primaryTagId],
          ['rating', '>=', '70'],
          ['id', '!=', found.id]
        ],
        fields: 'title, rating, votecount, description, tags.name, tags.rating',
        sort: 'rating',
        reverse: true,
        results: 8
      };
      const recRes = await axios.post('https://api.vndb.org/kana/vn', recBody, {
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'CodaRecommendations/1.0'
        },
        timeout: 30000
      });
      const recs = recRes.data?.results || [];

      for (const vn of recs.slice(0, 6)) {
        const recTitle = vn.title || 'Unknown';
        const desc = (vn.description || '').replace(/\[.+?\]/g, '').substring(0, 200);
        const rating = vn.rating ? `${(vn.rating / 10).toFixed(1)}/10` : 'N/A';
        results.push({
          title: recTitle,
          snippet: `[VNDB Recommendation based on ${title}]: ${recTitle} — ${desc} VNDB rating: ${rating} (${(vn.votecount || 0).toLocaleString()} votes). Tags: ${(vn.tags || []).slice(0,4).map(t=>t.name).join(', ')}.`,
          link: `https://vndb.org/v${vn.id}`
        });
      }
      console.log(`[VNDB Recs] Found ${recs.length} similar VNs for "${title}" via tag "${topTags[0].name}"`);
    } catch (e) {
      console.warn(`[VNDB Recs] Failed for "${title}":`, e.message);
    }
    await delay(400);
  }

  return results;
};


const fetchAnimeMetadata = async (title) => {
  try {
    const gql = `
      query ($search: String) {
        Page(page: 1, perPage: 1) {
          media(search: $search, type: ANIME, format_in: [TV, MOVIE, OVA, ONA]) {
            id
            title { english romaji }
            description
            genres
            tags { name rank }
            coverImage { large }
          }
        }
      }
    `;
    const res = await axios.post('https://graphql.anilist.co', {
      query: gql,
      variables: { search: title }
    }, { timeout: 30000 });
    const media = res.data?.data?.Page?.media?.[0];
    if (media) {
      const tags = (media.tags || [])
        .filter(t => t.rank > 60)
        .map(t => t.name)
        .slice(0, 8);
      return {
        title: media.title.english || media.title.romaji || title,
        genres: media.genres || [],
        tags: tags,
        description: (media.description || '').replace(/<[^>]*>/g, ''),
        image: media.coverImage?.large || ''
      };
    }
  } catch (err) {
    console.warn(`[AniList Metadata Lookup failed for "${title}"]:`, err.message);
  }
  return null;
};

const fetchVNMetadata = async (title) => {
  try {
    const body = {
      filters: ['search', '=', title],
      fields: 'title, alttitle, rating, description, tags.name, tags.rating, platforms',
      sort: 'searchrank',
      results: 1
    };
    const res = await axios.post('https://api.vndb.org/kana/vn', body, {
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'CodaRecommendations/1.0'
      },
      timeout: 30000
    });
    const vn = res.data?.results?.[0];
    if (vn) {
      const tags = (vn.tags || [])
        .filter(t => t.rating >= 1.5)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 8)
        .map(t => t.name);
      return {
        title: vn.title || vn.alttitle || title,
        genres: vn.platforms || [],
        tags: tags,
        description: vn.description || '',
        image: ''
      };
    }
  } catch (err) {
    console.warn(`[VNDB Metadata Lookup failed for "${title}"]:`, err.message);
  }
  return null;
};

const fetchMovieMetadata = async (title) => {
  try {
    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) return null;
    const res = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`, { timeout: 30000 });
    if (res.data && res.data.Response === 'True') {
      const genres = res.data.Genre ? res.data.Genre.split(',').map(g => g.trim()) : [];
      return {
        title: res.data.Title || title,
        genres: genres,
        tags: res.data.Type ? [res.data.Type] : [],
        description: res.data.Plot || '',
        image: res.data.Poster && res.data.Poster !== 'N/A' ? res.data.Poster : ''
      };
    }
  } catch (err) {
    console.warn(`[OMDb Metadata Lookup failed for "${title}"]:`, err.message);
  }
  return null;
};

const fetchBookMetadata = async (title) => {
  try {
    const res = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=1`, { timeout: 30000 });
    const book = res.data?.items?.[0]?.volumeInfo;
    if (book) {
      return {
        title: book.title || title,
        genres: book.categories || [],
        tags: [],
        description: book.description || '',
        image: book.imageLinks?.thumbnail || ''
      };
    }
  } catch (err) {
    console.warn(`[Google Books Metadata Lookup failed for "${title}"]:`, err.message);
  }
  return null;
};

const fetchGameMetadata = async (title) => {
  try {
    const searchRes = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`, { timeout: 30000 });
    const item = searchRes.data?.items?.[0];
    if (item) {
      const detailsRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${item.id}`, { timeout: 30000 });
      const data = detailsRes.data?.[item.id]?.data;
      if (data) {
        return {
          title: data.name || title,
          genres: data.genres?.map(g => g.description) || [],
          tags: data.categories?.map(c => c.description) || [],
          description: data.short_description || '',
          image: data.header_image || ''
        };
      }
    }
  } catch (err) {
    console.warn(`[Steam Metadata Lookup failed for "${title}"]:`, err.message);
  }
  return null;
};

const fetchMangaMetadata = async (title) => {
  try {
    const res = await axios.get(`https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&includes[]=cover_art`, { timeout: 30000 });
    const manga = res.data?.data?.[0];
    if (manga) {
      const titleName = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || title;
      const tags = manga.attributes.tags.map(t => t.attributes.name.en);
      const coverRel = manga.relationships.find(r => r.type === 'cover_art');
      const coverFileName = coverRel?.attributes?.fileName;
      const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}` : '';
      return {
        title: titleName,
        genres: [],
        tags: tags,
        description: manga.attributes.description?.en || '',
        image: coverUrl
      };
    }
  } catch (err) {
    console.warn(`[MangaDex Metadata Lookup failed for "${title}"]:`, err.message);
  }
  return null;
};

const fetchMetadataForCandidate = async (title, mediaType) => {
  const normType = (mediaType || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (normType === 'anime') {
    return await fetchAnimeMetadata(title);
  } else if (normType === 'visual novel' || normType === 'visualnovel') {
    return await fetchVNMetadata(title);
  } else if (normType === 'movie' || normType === 'tv') {
    return await fetchMovieMetadata(title);
  } else if (normType === 'book') {
    return await fetchBookMetadata(title);
  } else if (normType === 'game') {
    return await fetchGameMetadata(title);
  } else if (normType === 'manga') {
    return await fetchMangaMetadata(title);
  }
  return null;
};

module.exports = {
  scrapeForums,
  fetchMALRecommendations,
  fetchMALReviews,
  fetchKitsuAnimeSnippets,
  fetchAniListAnimeSnippets,
  fetchAniListRecommendations,
  fetchVNDBSnippets,
  fetchVNDBRecommendations,
  fetchMetadataForCandidate
};
