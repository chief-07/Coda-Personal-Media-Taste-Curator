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
}

module.exports = new EmbeddingService();
