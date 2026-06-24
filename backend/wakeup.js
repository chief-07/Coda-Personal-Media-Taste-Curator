const https = require('https');
const url = 'https://48d1716b-6351-4e50-b8ae-c3d7144acad1.sa-east-1-0.aws.cloud.qdrant.io:6333/collections';

console.log('Waking up Qdrant cluster...');
https.get(url, {
  headers: { 'api-key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6ZDdhYTlkOGUtYzc5NS00NzFmLTk0ZmEtMzhkM2RmMjY3OTdmIn0.6wEdhsWatinBsGLE3YVl2lG1wFH2o0IV_kvuvgfz4s4' },
  timeout: 60000
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Woke up! Status:', res.statusCode, data));
}).on('error', (err) => {
  console.error('Wake up failed:', err.message);
});
