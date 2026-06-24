const path = require('path');

// Load public app config plus ignored local backend secrets.
require('./loadEnv');

const qdrantService = require('./services/qdrantService');

async function testQdrant() {
  console.log('Testing Qdrant connection...');
  qdrantService.init();
  
  if (!qdrantService.isInitialized) {
    console.error('Failed to initialize QdrantService. Check environment variables.');
    return;
  }

  try {
    console.log('Setting up collections...');
    await qdrantService.setupCollections();
    
    console.log('Fetching collections to verify...');
    const collections = await qdrantService.client.getCollections();
    console.log('Current collections in Qdrant Cloud:', collections.collections.map(c => c.name));
    
    console.log('\nSuccess! Qdrant is fully connected and ready.');
  } catch (err) {
    console.error('Error during Qdrant test:', err.message);
  }
}

testQdrant();
