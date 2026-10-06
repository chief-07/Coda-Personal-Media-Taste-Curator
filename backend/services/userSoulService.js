/**
 * Legacy UserSoulService Stub.
 * The authoritative memory layer is Walrus Protocol (see walrusMemoryService.js).
 */

const crypto = require('crypto');

class UserSoulService {
  generateUserUuid(userId) {
    if (!userId) return '00000000-0000-0000-0000-000000000000';
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      hash.substring(12, 16),
      hash.substring(16, 20),
      hash.substring(20, 32)
    ].join('-');
  }

  async getUserMemory(userId) {
    return {
      userId,
      permanent_soul: null,
      soul_vector: null,
      transient_memory: null,
    };
  }

  async updatePermanentSoul(userId, livingMemoryJson) {
    return true;
  }

  async updateTransientMemory(userId, livingMemoryJson) {
    return true;
  }

  async syncLivingMemory(userId, livingMemoryJson) {
    // Delegated to Walrus Protocol
    return true;
  }

  calculateSoulCentroid(permanentVector, transientVector, alpha = 0.5) {
    return permanentVector || transientVector || [];
  }

  calculatePersonalizedCandidateScore(itemPayload, itemScore, soul, userContext) {
    return itemScore || 0;
  }
}

module.exports = new UserSoulService();
