const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const TOKEN_STORE_PATH = path.join(CACHE_DIR, 'user_tokens.json');

let tokenRegistry = {};
try {
  if (fs.existsSync(TOKEN_STORE_PATH)) {
    tokenRegistry = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, 'utf8')) || {};
  }
} catch (_) {
  tokenRegistry = {};
}

function saveTokenRegistry() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(tokenRegistry, null, 2), 'utf8');
  } catch (_) {}
}

function hashToken(rawToken) {
  const secretSalt = process.env.CODA_AUTH_SALT || 'coda-walrus-identity-v1';
  return crypto
    .createHmac('sha256', secretSalt)
    .update(String(rawToken))
    .digest('hex');
}

/**
 * Lightweight per-account token authentication middleware.
 * Ensures that arbitrary `userId` strings from the client are never trusted
 * without their bound `X-Coda-Token` credential.
 */
function verifyUserIdentity(req, res, next) {
  const rawUserId =
    (req.body && req.body.userId) !== undefined
      ? req.body.userId
      : req.query
      ? req.query.userId
      : undefined;

  // Stateless / Amnesia mode requests (userId is null or omitted)
  if (rawUserId === null || rawUserId === undefined || rawUserId === '') {
    return next();
  }

  const userId = String(rawUserId).trim();

  // Enforce strict format so colons or traversal characters can never pollute Walrus namespaces
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(userId)) {
    return res.status(400).json({
      error: 'Invalid userId format.',
    });
  }

  const token = (
    req.headers['x-coda-token'] ||
    (req.body && req.body.userToken) ||
    (req.query && req.query.userToken) ||
    ''
  )
    .toString()
    .trim();

  if (!token || !/^tok_[a-fA-F0-9]{16,64}$/.test(token)) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid X-Coda-Token header for userId.',
    });
  }

  const incomingHash = hashToken(token);
  const existingHash = tokenRegistry[userId];

  if (!existingHash) {
    // First authenticated request for this account binds the token to the userId
    tokenRegistry[userId] = incomingHash;
    saveTokenRegistry();
    return next();
  }

  if (existingHash !== incomingHash) {
    return res.status(403).json({
      error: 'Forbidden: X-Coda-Token does not match the registered identity for this userId.',
    });
  }

  return next();
}

module.exports = {
  verifyUserIdentity,
};
