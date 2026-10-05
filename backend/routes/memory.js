const express = require('express');
const router = express.Router();
const walrus = require('../services/walrusMemoryService');

/**
 * GET /api/memory/recall
 * Recall memories for a given user and category/query.
 */
router.get('/recall', async (req, res) => {
  const { userId, query, category } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    const mediaType = category || 'anime';
    const result = await walrus.recallForRecommendation(userId, mediaType, query || '');
    res.json({
      userId,
      mediaType,
      ...result,
    });
  } catch (err) {
    console.error('[API Memory Recall Error]:', err.message);
    res.status(500).json({ error: 'Failed to recall memory', details: err.message });
  }
});

/**
 * GET /api/memory/health
 * Verify Walrus Relayer status and active account.
 */
router.get('/health', async (req, res) => {
  try {
    const client = await walrus.getClient();
    const health = await client.health();
    res.json({
      status: 'connected',
      accountId: process.env.MEMWAL_ACCOUNT_ID || '0x48b30fecc266bef51e01ae32c4f610bbe2910ed09a4c022e27383999aa331d55',
      relayer: process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz',
      health,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', details: err.message });
  }
});

module.exports = router;
