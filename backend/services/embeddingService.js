const axios = require('axios');

/**
 * Service to handle OpenAI vector embeddings.
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY in environment.');
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0].embedding;
      } else {
        throw new Error('Invalid response structure from OpenAI embeddings API.');
      }
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embedding:', error.message);
      if (error.response && error.response.data) {
        console.error('[EmbeddingService] API Error:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
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
