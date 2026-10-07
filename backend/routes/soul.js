const express = require('express');
const router = express.Router();
const walrusMemoryService = require('../services/walrusMemoryService');

// Update the user's core taste summary directly on Walrus Protocol
router.post('/update-summary', async (req, res) => {
  try {
    const { userId, summaryText, currentMemory } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const updatedMemory = {
      ...(currentMemory || {}),
      globalIdentity: summaryText ? [summaryText] : []
    };

    let walrusWrite = null;
    if (summaryText && typeof summaryText === 'string' && summaryText.trim().length > 0) {
      walrusWrite = await walrusMemoryService.rememberFact(
        `[Core Taste & Aesthetic Identity] ${summaryText.trim()}`,
        walrusMemoryService.formatNamespace(userId, 'core'),
        1,
        'Core Identity Summary'
      ).catch(() => null);
    }

    res.json({
      status: "success",
      updatedMemory,
      walrus_writes: walrusWrite ? [walrusWrite] : []
    });
  } catch (e) {
    console.error("[Soul Route Error]:", e);
    res.status(500).json({ error: "Failed to update soul summary." });
  }
});

module.exports = router;
