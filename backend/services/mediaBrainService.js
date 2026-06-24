const crypto = require('crypto');
const qdrantService = require('./qdrantService');
const embeddingService = require('./embeddingService');

/**
 * Service to interact with the Media Brain vector database.
 */
class MediaBrainService {
  /**
   * Helper to generate consistent UUIDs for media keys.
   */
  generateUuid(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      hash.substring(12, 16),
      hash.substring(16, 20),
      hash.substring(20, 32)
    ].join('-');
  }

  /**
   * Retrieves a specific media item by its key (e.g. "anime:steins gate")
   */
  async getMediaByKey(key) {
    const uuid = this.generateUuid(key);
    const point = await qdrantService.getPoint('media_brain', uuid);
    if (point && point.payload) {
      return point.payload;
    }
    return null;
  }

  /**
   * Performs a semantic search for media using a natural language query.
   * 
   * @param {string} query The natural language search query.
   * @param {number} limit Maximum number of results.
   * @param {object} filter Optional Qdrant filter (e.g. filter by media_type).
   * @returns {Promise<Array>} Array of media payloads.
   */
  async semanticSearch(query, limit = 10, filter = null) {
    // 1. Embed the search query
    const queryVector = await embeddingService.embed(query);

    // 2. Search Qdrant
    const results = await qdrantService.search('media_brain', queryVector, limit, filter);

    // 3. Return the payloads
    return results.map(r => r.payload);
  }

  /**
   * Finds media similar to a specific vector (e.g., a user's soul vector).
   */
  async findSimilarByVector(vector, limit = 10, filter = null) {
    const results = await qdrantService.search('media_brain', vector, limit, filter);
    return results.map(r => r.payload);
  }

  /**
   * Retrieves a media's full soul by title. If not found, falls back to enriching it.
   */
  async getMediaSoulByTitle(title, media_type = null) {
    try {
      // 1. Check Qdrant directly
      const existingPayload = await qdrantService.searchByTitle('media_brain', title);

      if (existingPayload) {
        return existingPayload;
      }
      
      // 2. If not found, do an on-demand enrichment
      console.log(`[MediaBrain] Title "${title}" not found in brain. Triggering on-demand enrichment...`);
      const mediaEnrichmentService = require('./mediaEnrichmentService');
      
      // We pass the title. If media_type is null, enrichment service will default to movie
      await mediaEnrichmentService.enrichSingleTitle(title, media_type || 'movie');
      
      // 3. Check Qdrant again
      const payloadAfter = await qdrantService.searchByTitle('media_brain', title);
      return payloadAfter;

    } catch (e) {
      console.error(`[MediaBrain] Error getting soul for ${title}:`, e.message);
    }
    return null;
  }
}

module.exports = new MediaBrainService();
