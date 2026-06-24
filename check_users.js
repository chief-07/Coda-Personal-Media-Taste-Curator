const qdrantService = require('./backend/services/qdrantService');

async function run() {
  await qdrantService.init();
  try {
    const res = await qdrantService.client.getCollections();
    console.log("Collections:", res.collections.map(c => c.name));

    const souls = await qdrantService.client.scroll('user_souls', { limit: 1, with_payload: true });
    console.log("Sample Soul:", JSON.stringify(souls.points[0]?.payload || {}, null, 2));

    const oldUsers = await qdrantService.client.scroll('users', { limit: 1, with_payload: true }).catch(() => null);
    if (oldUsers) console.log("Sample old users:", oldUsers);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
