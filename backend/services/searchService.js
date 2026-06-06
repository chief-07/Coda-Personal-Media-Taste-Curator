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
 * Fetch top-rated visual novels from VNDB by tag(s).
 * @param {string} queryHint - A hint string we map to known VNDB tags
 * @param {number} limit - Max titles to return
 */
const fetchVNDBSnippets = async (queryHint = '', limit = 6) => {
  try {
    console.log(`[VNDB] Searching by vibe: "${queryHint}"`);

    // Pick matching tag IDs from query hint
    const hintLower = queryHint.toLowerCase();
    const tagIds = [];
    for (const [keyword, tagId] of Object.entries(VN_TAG_MAP)) {
      if (hintLower.includes(keyword)) {
        tagIds.push(tagId);
        if (tagIds.length >= 2) break; // Cap at 2 tags to keep results tight
      }
    }

    // If no tags matched, fall back to romance + school (most common VN profile)
    if (tagIds.length === 0) {
      tagIds.push('g134', 'g136'); // romance + school
    }

    // VNDB POST /kana/vn — filter by tags, sort by rating, return top results
    const body = {
      filters: ['and', ['tag', '=', tagIds[0]], ...(tagIds[1] ? [['tag', '=', tagIds[1]]] : [])],
      fields: 'title, alttitle, rating, votecount, description, tags.name, tags.rating, released',
      sort: 'rating',
      reverse: true,
      results: limit,
      page: 1
    };

    const res = await axios.post('https://api.vndb.org/kana/vn', body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
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
      const topTags = (vn.tags || [])
        .filter(t => t.rating >= 1.5)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5)
        .map(t => t.name)
        .join(', ');
      return {
        title,
        snippet: `[VNDB] ${title}: ${desc} ${rating} ${votes}. Top tags: ${topTags}.`.trim(),
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
        fields: 'title, id, rating, tags.name, tags.rating',
        sort: 'searchrank',
        results: 1
      };
      const searchRes = await axios.post('https://api.vndb.org/kana/vn', searchBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      const found = searchRes.data?.results?.[0];
      if (!found) {
        console.warn(`[VNDB Recs] Title not found: "${title}"`);
        continue;
      }

      // Step 2: grab top tags from that VN to find similar titles
      const topTags = (found.tags || [])
        .filter(t => t.rating >= 2.0)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3)
        .map(t => t.name);

      // Step 3: search VNDB for other highly-rated VNs with those tags (excluding the source VN)
      const recBody = {
        filters: ['and', ['tag', '=', found.tags?.[0]?.name ? 'g134' : 'g134'], ['rating', '>=', '70']],
        fields: 'title, rating, votecount, description, tags.name, tags.rating',
        sort: 'rating',
        reverse: true,
        results: 8
      };
      const recRes = await axios.post('https://api.vndb.org/kana/vn', recBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      const recs = (recRes.data?.results || []).filter(vn => vn.id !== found.id);

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
      console.log(`[VNDB Recs] Found ${recs.length} similar VNs for: "${title}"`);
    } catch (e) {
      console.warn(`[VNDB Recs] Failed for "${title}":`, e.message);
    }
    await delay(400);
  }

  return results;
};

module.exports = {
  scrapeForums,
  fetchMALRecommendations,
  fetchKitsuAnimeSnippets,
  fetchAniListAnimeSnippets,
  fetchAniListRecommendations,
  fetchVNDBSnippets,
  fetchVNDBRecommendations
};
