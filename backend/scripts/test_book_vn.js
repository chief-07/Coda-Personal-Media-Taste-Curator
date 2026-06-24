const axios = require('axios');

async function testOpenLibrary(title) {
  try {
    const res = await axios.get(`https://openlibrary.org/search.json?q=${encodeURIComponent(title)}&limit=1`);
    const doc = res.data?.docs?.[0];
    if (doc) {
      console.log('Book Found Keys:', Object.keys(doc).slice(0, 15));
      console.log('Book Found:', {
        title: doc.title,
        author: doc.author_name?.[0],
        publish_year: doc.first_publish_year,
        subjects: doc.subject?.slice(0, 5) || doc.subject_facet?.slice(0, 5)
      });
    }
  } catch (e) {
    console.error('Book error:', e.message);
  }
}

async function testVNDB(title) {
  try {
    const res = await axios.post('https://api.vndb.org/kana/vn', {
      filters: ["search", "=", title],
      fields: "title, description, rating, length_minutes",
      results: 1
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    const vn = res.data?.results?.[0];
    if (vn) {
      console.log('VN Found:', vn);
    }
  } catch (e) {
    console.error('VN error:', e.message);
    if (e.response) console.error('VN data:', e.response.data);
  }
}

async function run() {
  await testOpenLibrary('House of Leaves');
  await testVNDB('Steins;Gate');
}

run();
