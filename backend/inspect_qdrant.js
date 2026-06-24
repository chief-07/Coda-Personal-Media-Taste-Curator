const path = require('path');
require('./loadEnv');

const qdrantService = require('./services/qdrantService');
const crypto = require('crypto');

function makeUuid(key) {
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return [hash.slice(0,8), hash.slice(8,12), hash.slice(12,16), hash.slice(16,20), hash.slice(20,32)].join('-');
}

async function inspect() {
  qdrantService.init();
  const checks = [
    { title: 'A Silent Voice', type: 'anime' },
    { title: 'Fight Club', type: 'movie' },
    { title: 'Steins;Gate', type: 'anime' },
  ];
  for (const { title, type } of checks) {
    const uuid = makeUuid(type + ':' + title.toLowerCase());
    let point = null;
    try {
      point = await qdrantService.getPoint('media_brain', uuid);
    } catch (e) {
      if (e.message !== 'Not Found') console.error('Error fetching point:', e.message);
    }
    
    if (point) {
      console.log('=== ' + point.payload.title + ' ===');
      console.log('SCORE/RATING: ' + (point.payload.score||'N/A'));
      console.log('YEAR: ' + (point.payload.release_year||'N/A'));
      console.log('STUDIO: ' + (point.payload.studio||'N/A'));
      console.log('DIRECTOR: ' + (point.payload.director||'N/A'));
      console.log('CAST: ' + (point.payload.cast ? point.payload.cast.join(', ') : 'N/A'));
      console.log('DESC:\n' + (point.payload.semantic_description||'').substring(0,800));
      console.log('');
    } else {
      console.log('STILL ENRICHING: ' + title);
    }
  }
}
inspect().catch(e => console.error(e.message));
