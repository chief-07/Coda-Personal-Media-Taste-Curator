const { QdrantClient } = require('@qdrant/js-client-rest');

/**
 * Service to manage interactions with Qdrant Cloud Vector Database.
 */
class QdrantService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
  }

  /**
   * Initializes the Qdrant client using environment variables.
   * Expected: QDRANT_URL and QDRANT_API_KEY
   */
  init() {
    if (this.isInitialized) return;

    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;

    if (!url || !apiKey) {
      console.warn('[QdrantService] Missing QDRANT_URL or QDRANT_API_KEY. Vector database features will be disabled until configured.');
      return;
    }

    try {
      const isCloud = url.includes('.cloud.qdrant.io');
      this.client = new QdrantClient({
        url: url,
        apiKey: apiKey,
        ...(isCloud ? { port: 443 } : {}),
        timeout: 60000
      });
      this.isInitialized = true;
      console.log('[QdrantService] Initialized Qdrant client successfully.');
    } catch (e) {
      console.error('[QdrantService] Failed to initialize client:', e.message);
    }
  }

  /**
   * Ensures the required collections exist in Qdrant.
   * If they don't, it creates them.
   */
  async setupCollections() {
    if (!this.isInitialized || !this.client) {
      throw new Error('Qdrant client not initialized');
    }

    const requiredCollections = [
      { name: 'media_brain', size: 1536 },
      { name: 'user_souls', size: 1536 },
      { name: 'user_memory', size: 1536 }
    ];

    try {
      const existingCollectionsResponse = await this.client.getCollections();
      const existingNames = existingCollectionsResponse.collections.map(c => c.name);

      for (const req of requiredCollections) {
        if (!existingNames.includes(req.name)) {
          console.log(`[QdrantService] Creating missing collection: ${req.name}`);
          await this.client.createCollection(req.name, {
            vectors: {
              size: req.size,
              distance: 'Cosine',
            },
          });
        }
      }
      console.log('[QdrantService] All required collections are present.');
    } catch (e) {
      console.error('[QdrantService] Error setting up collections:', e.message);
      throw e;
    }
  }

  /**
   * Upserts a point (vector + payload) into a specific collection.
   */
  async upsert(collectionName, id, vector, payload) {
    if (!this.isInitialized || !this.client) throw new Error('Qdrant not initialized');
    return this.client.upsert(collectionName, {
      wait: true,
      points: [
        {
          id: id,
          vector: vector,
          payload: payload,
        }
      ]
    });
  }

  /**
   * Searches for the closest vectors in a collection.
   */
  async search(collectionName, queryVector, limit = 20, filter = null) {
    if (!this.isInitialized || !this.client) throw new Error('Qdrant not initialized');
    return this.client.search(collectionName, {
      vector: queryVector,
      limit: limit,
      filter: filter,
      with_payload: true,
    });
  }

  /**
   * Retrieves a specific point by ID.
   */
  async getPoint(collectionName, id) {
    if (!this.isInitialized || !this.client) throw new Error('Qdrant not initialized');
    const result = await this.client.retrieve(collectionName, {
      ids: [id],
      with_payload: true,
      with_vector: true,
    });
    return result.length > 0 ? result[0] : null;
  }
}

module.exports = new QdrantService();
