const axios = require('axios');
const path = require('path');
require('./loadEnv');
const qdrantService = require('./services/qdrantService');

async function testRichProfile() {
  console.log('Testing Recommendation Pipeline with Rich Profile...\n');

  const richMockUser = {
    userId: "test-user-rich-profile",
    currentMemory: {
      globalIdentity: [
        "Highly analytical, appreciates complex interwoven narratives.",
        "Drawn to melancholic, atmospheric, and emotionally devastating stories.",
        "Prefers slower pacing if the payoff is psychologically impactful.",
        "Fascinated by transhumanism, existentialism, and memory manipulation.",
        "Specifically looking for something that leaves a lasting feeling of profound emptiness or beautiful sorrow."
      ],
      categoryProfiles: {
        "anime": [
          "Loves retro cyberpunk aesthetics and psychological horror.",
          "Favorites include Serial Experiments Lain, Neon Genesis Evangelion, and Steins;Gate."
        ],
        "visual novel": [
          "Appreciates stories where player choices lead to drastically different emotional realities.",
          "Loves Steins;Gate (VN) and Saya no Uta."
        ],
        "movie": [
          "Enjoys surrealism and mind-bending thrillers.",
          "Loved Donnie Darko, Perfect Blue, and Memento."
        ]
      },
      media_reflections: [
        "I loved Serial Experiments Lain because it predicted the isolation of the internet age so perfectly. The humming power lines and quiet moments of reflection are etched into my brain.",
        "Saya no Uta is a masterpiece of cosmic horror romance, even if it's deeply disturbing. It made me question what beauty really is.",
        "Perfect Blue's editing and transitions are flawless. The way reality breaks down is exactly what I look for in psychological thrillers."
      ],
      recentContext: "I want an anime or movie that completely breaks my mind and leaves me staring at the wall. Something heavily psychological with a beautiful but lonely atmosphere."
    },
    requestedMediaType: "anime" // Let's test with anime first
  };

  try {
    console.log("--- 1. Syncing Mock User to Qdrant ---");
    qdrantService.init(); // make sure it's initialized
    const userSoulService = require('./services/userSoulService');
    await userSoulService.syncLivingMemory(richMockUser.userId, richMockUser.currentMemory);

    console.log("\n--- 2. Sending Request to /api/recommend ---");
    console.log(`Requested Media Type: ${richMockUser.requestedMediaType}`);
    console.log(`Recent Context (Craving): "${richMockUser.currentMemory.recentContext}"\n`);
    
    // Call the local backend API
    const response = await axios.post('http://localhost:8080/api/recommend', {
      userId: richMockUser.userId,
      requested_media_type: richMockUser.requestedMediaType
    });
    
    console.log("--- 3. Results Received ---\n");
    
    if (response.data && response.data.results) {
      console.log(`Found ${response.data.results.length} recommendations:\n`);
      response.data.results.forEach((rec, index) => {
        console.log(`[${index + 1}] ${rec.title}`);
        console.log(`   Confidence: ${rec.confidenceScore}%`);
        console.log(`   Why: ${rec.pitch}`);
        if (rec.metadata) {
            console.log(`   Genres: ${rec.metadata.genres?.join(', ') || 'N/A'}`);
            console.log(`   Themes: ${rec.metadata.themes?.join(', ') || 'N/A'}`);
        }
        console.log('');
      });
    } else {
      console.log("Unexpected response format:", response.data);
    }
    
  } catch (err) {
    console.error("Test failed!");
    if (err.response) {
      console.error(err.response.status, err.response.data);
    } else {
      console.error(err.message);
    }
  }
}

testRichProfile();
