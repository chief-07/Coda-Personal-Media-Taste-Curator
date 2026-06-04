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

// ─────────────────────────────────────────────────
// WEB SCRAPERS (DDG → Yahoo → Bing fallback chain)
// ─────────────────────────────────────────────────

const scrapeDDG = async (query) => {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': getRandomUserAgent() }
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
      headers: { 'User-Agent': getRandomUserAgent() }
    });
    const $ = cheerio.load(response.data);
    const results = [];
    $('.algo').each((i, el) => {
      if (i >= 5) return false;
      const title = $(el).find('h3').text().trim();
      const snippet = $(el).find('.compText').text().trim() || $(el).find('.lh-16').text().trim() || $(el).find('.fc-drakgray').text().trim();
      const link = $(el).find('h3 a').attr('href') || $(el).find('a').attr('href');
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
      headers: { 'User-Agent': getRandomUserAgent() }
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

const scrapeForums = async (query) => {
  // Sanitize query to prevent search engine brand-name pollution
  const cleanedQuery = sanitizeQuery(query);
  if (cleanedQuery !== query) {
    console.log(`[SearchService] Query sanitized: "${query}" → "${cleanedQuery}"`);
  }

  // Add randomized delay to prevent instant blocks
  await delay(Math.floor(Math.random() * 300) + 200);

  console.log(`[SearchService] Scraping DDG for: "${cleanedQuery}"`);
  let results = await scrapeDDG(cleanedQuery);
  if (results && results.length > 0) {
    return results;
  }

  console.log(`[SearchService] DDG returned 0 results. Trying Yahoo fallback...`);
  await delay(Math.floor(Math.random() * 300) + 200);
  results = await scrapeYahoo(cleanedQuery);
  if (results && results.length > 0) {
    return results;
  }

  console.log(`[SearchService] Yahoo returned 0 results. Trying Bing fallback...`);
  await delay(Math.floor(Math.random() * 300) + 200);
  results = await scrapeBing(cleanedQuery);
  return results || [];
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
      const searchRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`, { timeout: 8000 });
      const anime = searchRes.data?.data?.[0];
      if (!anime) {
        console.warn(`[MAL/Jikan] No anime found for: "${title}"`);
        continue;
      }

      const malId = anime.mal_id;
      console.log(`[MAL/Jikan] Found mal_id: ${malId} for "${title}". Fetching recommendations...`);
      
      await delay(500);
      const recRes = await axios.get(`https://api.jikan.moe/v4/anime/${malId}/recommendations`, { timeout: 8000 });
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

// ─────────────────────────────────────────────────
// KITSU — Free anime/manga database (no auth)
// Gives structured title data: synopsis, rating, genres
// ─────────────────────────────────────────────────

const fetchKitsuAnimeSnippets = async (query) => {
  try {
    console.log(`[Kitsu] Searching for: "${query}"`);
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=5&fields[anime]=canonicalTitle,synopsis,averageRating,subtype,startDate`;
    const res = await axios.get(url, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      },
      timeout: 8000
    });

    const items = res.data?.data || [];
    if (items.length === 0) {
      console.warn(`[Kitsu] No results for: "${query}"`);
      return [];
    }

    console.log(`[Kitsu] Got ${items.length} results for: "${query}"`);
    return items.map(item => {
      const attrs = item.attributes;
      const titleStr = attrs.canonicalTitle || 'Unknown';
      const synopsis = (attrs.synopsis || '').replace(/<[^>]*>/g, '').substring(0, 350);
      const rating = attrs.averageRating ? `Kitsu rating: ${attrs.averageRating}/100.` : '';
      const type = attrs.subtype ? `(${attrs.subtype})` : '';
      return {
        title: titleStr,
        snippet: `[Kitsu] ${titleStr} ${type}: ${synopsis} ${rating}`.trim(),
        link: `https://kitsu.io/anime/${item.id}`
      };
    });
  } catch (e) {
    console.warn(`[Kitsu] Search failed for "${query}":`, e.message);
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
      { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 10000 }
    );
    let media = titleRes.data?.data?.Page?.media || [];

    // If title search returns nothing (e.g. for vibe queries like "emotional psychological anime"),
    // fall back to genre/tag-based discovery on AniList
    if (media.length === 0) {
      console.log(`[AniList] Title search found nothing — trying top-rated discovery mode...`);
      const discoveryGql = `
        query {
          Page(perPage: 8) {
            media(type: ANIME, sort: SCORE_DESC, isAdult: false, format_in: [TV, MOVIE, OVA]) {
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
        { query: discoveryGql },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 10000 }
      );
      media = discoveryRes.data?.data?.Page?.media || [];
      console.log(`[AniList] Discovery mode returned ${media.length} top-rated titles`);
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
          timeout: 10000
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

module.exports = {
  scrapeForums,
  fetchMALRecommendations,
  fetchKitsuAnimeSnippets,
  fetchAniListAnimeSnippets,
  fetchAniListRecommendations
};
