const axios = require('axios');
const cheerio = require('cheerio');

async function testTraktScrape() {
  try {
    const res = await axios.get('https://trakt.tv/shows/watched/all', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(res.data);
    const titles = new Set();
    $('.grid-item .titles h3').each((i, el) => {
      titles.add($(el).text().trim());
    });
    console.log('Trakt Top TV (sample):', Array.from(titles).slice(0, 15));
    console.log('Total TV shows scraped from chart:', titles.size);
  } catch (e) {
    console.error('Trakt scrape error:', e.message);
  }
}

testTraktScrape();
