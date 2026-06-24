const express = require('express');
const router = express.Router();
const mediaEnrichmentService = require('../services/mediaEnrichmentService');

router.post('/sync', async (req, res) => {
  try {
    const { title, media_type } = req.body;
    if (!title || !media_type) {
      return res.status(400).json({ error: 'Missing title or media_type' });
    }

    console.log(`[Sync Enrich] App requested immediate enrichment for: ${title} (${media_type})`);
    
    // Synchronous enrichment
    const success = await mediaEnrichmentService.enrichSingleTitle(title, media_type);
    
    if (success) {
      res.json({ status: 'success', title, media_type });
    } else {
      res.status(500).json({ error: 'Enrichment failed. Could not process title.' });
    }
  } catch (error) {
    console.error('[Sync Enrich Error]:', error);
    res.status(500).json({ error: 'Enrichment pipeline exception', details: error.message });
  }
});

module.exports = router;
