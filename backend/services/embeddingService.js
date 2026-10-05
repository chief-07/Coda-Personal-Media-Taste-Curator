const axios = require('axios');

/**
 * Service to handle Gemini vector embeddings.
 */
class EmbeddingService {
  /**
   * Generates a vector embedding for a given text.
   * Uses text-embedding-3-small which returns a 1536-dimensional vector.
   * 
   * @param {string} text The text to embed.
   * @returns {Promise<number[]>} The vector embedding.
   */
  async embed(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Valid text is required for embedding.');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY in environment.');
    }

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
          {
            model: 'models/gemini-embedding-001',
            content: {
              parts: [{ text: text }]
            },
            outputDimensionality: 1536,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 15000
          }
        );

        if (response.data && response.data.embedding && response.data.embedding.values) {
          return response.data.embedding.values;
        } else {
          throw new Error('Invalid response structure from Gemini embeddings API.');
        }
      } catch (error) {
        console.warn(`[EmbeddingService] Embed attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        if (attempt === maxRetries) {
          console.error('[EmbeddingService] Failed to generate embedding after max retries:', error.message);
          if (error.response && error.response.data) {
            console.error('[EmbeddingService] API Error:', JSON.stringify(error.response.data, null, 2));
          }
          throw error;
        }
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  /**
   * Calculates the cosine similarity between two vectors.
   * @param {number[]} vecA 
   * @param {number[]} vecB 
   * @returns {number|null}
   */
  calculateCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return null;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = new EmbeddingService();
