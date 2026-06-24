const axios = require('axios');

async function test() {
  console.log('Testing new Recommend Pipeline (Phase 3)...');
  
  const payload = {
    userId: 'test-user-123',
    requested_media_type: 'anime'
  };

  try {
    const res = await axios.post('http://localhost:8080/api/recommend', payload);
    console.log('\n--- SUCCESS! ---');
    console.log('Returned candidates:', res.data.recommendations.length);
    res.data.recommendations.forEach((r, i) => {
      console.log(`\nCandidate ${i + 1}: ${r.title} (${r.media_type})`);
      if (r.pitch_paragraphs && r.pitch_paragraphs.length > 0) {
        console.log(`Pitch: "${r.pitch_paragraphs[0].substring(0, 100)}..."`);
      } else {
        console.log('Pitch: (Lazy load - none yet)');
      }
    });
  } catch (e) {
    console.error('Test failed:', e.response ? e.response.data : e.message);
  }
}

test();
