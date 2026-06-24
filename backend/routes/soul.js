const express = require('express');
const router = express.Router();
const userSoulService = require('../services/userSoulService');

// Update the user's soul summary directly
router.post('/update-summary', async (req, res) => {
  try {
    const { userId, summaryText, currentMemory } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // currentMemory is the full livingMemoryJson from the frontend
    // We update the globalIdentity and preserve the rest
    const updatedMemory = {
      ...currentMemory,
      globalIdentity: [summaryText]
    };

    // If there is an existing soul_graph, we update the coda_summary inside it
    if (updatedMemory.soul_graph) {
      updatedMemory.soul_graph.coda_summary = summaryText;
    }

    // Sync to Qdrant
    await userSoulService.syncLivingMemory(userId, updatedMemory);

    res.json({ status: "success", updatedMemory });
  } catch (e) {
    console.error("[Soul Route Error]:", e);
    res.status(500).json({ error: "Failed to update soul summary." });
  }
});

module.exports = router;
