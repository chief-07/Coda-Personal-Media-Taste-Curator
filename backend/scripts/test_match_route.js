const axios = require('axios');

async function run() {
  const payload = {
    userId: 'test_user_match_123',
    title: 'All About Lily Chou-Chou',
    media_type: 'movie'
  };

  try {
    const res = await axios.post('http://127.0.0.1:8080/api/match', payload);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log("Error status:", e.response ? e.response.status : 'No response');
    console.log("Error data:", e.response ? e.response.data : e.message);
  }
}
run();
