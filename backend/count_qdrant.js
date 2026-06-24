const path = require('path');
require('./loadEnv');
const { QdrantClient } = require('@qdrant/js-client-rest');

async function count() {
  const isCloud = process.env.QDRANT_URL.includes('.cloud.qdrant.io');
  const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    ...(isCloud ? { port: 443 } : {}),
  });
  
  try {
    const info = await client.getCollection('media_brain');
    console.log(`Total Points in Qdrant: ${info.points_count}`);
  } catch (e) {
    console.log(e.message);
  }
}
count();
