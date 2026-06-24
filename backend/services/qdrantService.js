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
      console.warn('[QdrantService] setupCollections skipped: client not initialized.');
      return;
    }

    const requiredCollections = [
      { name: 'media_brain', size: 1536 },
      { name: 'user_souls', size: 1536 },
      { name: 'user_memory', size: 1536 },
      { name: 'media_queue', size: 1 } // Used as a simple queue
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
      
      // Ensure payload indices exist
      try {
        await this.client.createPayloadIndex('media_brain', {
          field_name: 'media_type',
          field_schema: 'keyword',
        });
      } catch (e) {
        // Ignore if already exists
      }

      console.log('[QdrantService] All required collections and indices are present.');
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
   * Automatically deduplicates identical titles.
   */
  async search(collectionName, queryVector, limit = 20, filter = null) {
    if (!this.isInitialized || !this.client) throw new Error('Qdrant not initialized');
    const results = await this.client.search(collectionName, {
      vector: queryVector,
      limit: limit * 2, // fetch extra to account for deduplication
      filter: filter,
      with_payload: true,
    });

    const uniqueTitles = new Set();
    const deduplicated = [];

    for (const r of results) {
      if (!r.payload || !r.payload.title) continue;
      // normalize title (lowercase, remove leading 'the ')
      const normalizedTitle = r.payload.title.toLowerCase().replace(/^the\s+/, '').trim();
      if (!uniqueTitles.has(normalizedTitle)) {
        uniqueTitles.add(normalizedTitle);
        deduplicated.push(r);
        if (deduplicated.length === limit) break;
      }
    }

    return deduplicated;
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

  /**
   * Retrieves multiple points by IDs.
   */
  async getPoints(collectionName, ids) {
    if (!this.isInitialized || !this.client) throw new Error('Qdrant not initialized');
    const result = await this.client.retrieve(collectionName, {
      ids: ids,
      with_payload: false,
      with_vector: false,
    });
    return result;
  }

  /**
   * Searches for a media title by name in a collection's payload.
   * Returns the best matching point's payload, or null if not found.
   */
  async searchByTitle(collectionName, title) {
    if (!this.isInitialized || !this.client) return null;
    try {
      const result = await this.client.scroll(collectionName, {
        filter: {
          must: [
            {
              key: 'title',
              match: { value: title }
            }
          ]
        },
        limit: 1,
        with_payload: true,
        with_vector: false,
      });
      return result.points?.length > 0 ? result.points[0].payload : null;
    } catch (e) {
      // Silent fail — title just isn't in the Brain yet
      return null;
    }
  }

  /**
   * Queue Push (Tier 1, 2, 3)
   */
  async pushToQueue(title, media_type, tier = 2) {
    if (!this.isInitialized || !this.client) return;
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    try {
      await this.client.upsert('media_queue', {
        wait: true,
        points: [
          {
            id,
            vector: [0], // Dummy size 1 vector
            payload: {
              title,
              media_type,
              tier,
              created_at: Date.now()
            }
          }
        ]
      });
      console.log(`[Qdrant Queue] Pushed ${title} to Tier ${tier}`);
    } catch (e) {
      console.error('[Qdrant Queue] Error pushing:', e.message);
    }
  }

  /**
   * Queue Pop
   * Prioritize Tier 1, then Tier 2, then Tier 3
   */
  async popFromQueue() {
    if (!this.isInitialized || !this.client) return null;
    
    // Check tiers in order
    for (const tier of [1, 2, 3]) {
      try {
        const response = await this.client.scroll('media_queue', {
          filter: {
            must: [
              { key: 'tier', match: { value: tier } }
            ]
          },
          limit: 1,
          with_payload: true
        });

        if (response.points && response.points.length > 0) {
          const point = response.points[0];
          // Delete it from the queue so no one else processes it
          await this.client.delete('media_queue', {
            wait: true,
            points: [point.id]
          });
          return point.payload;
        }
      } catch (e) {
        console.error(`[Qdrant Queue] Error popping tier ${tier}:`, e.message);
      }
    }
    return null;
  }
}

module.exports = new QdrantService();

