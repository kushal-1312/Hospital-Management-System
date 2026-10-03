const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * UPGRADE 7: Redis Client
 *
 * Singleton Redis connection with:
 *  - Graceful fallback: if Redis is unavailable, cache ops become no-ops
 *    so the app continues to work (just without caching benefits)
 *  - Auto-reconnect with exponential backoff
 *  - Helper methods: get, set, del, invalidatePattern
 */

let client = null;
let isReady = false;

const createClient = () => {
  let unavailableLogged = false;
  const redis = new Redis({
    host:     process.env.REDIS_HOST || '127.0.0.1',
    port:     Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db:       0,
    // Keep retrying so Redis can recover when it starts after the API.
    retryStrategy: (times) => {
      return Math.min(times * 200, 3000);
    },
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  redis.on('connect', () => {
    logger.debug('Redis transport connected');
  });

  redis.on('ready', () => {
    isReady = true;
    unavailableLogged = false;
    logger.info('Redis connected');
  });

  redis.on('error', (err) => {
    if (isReady || !unavailableLogged) {
      logger.warn(`Redis unavailable — caching disabled: ${err.message}`);
      unavailableLogged = true;
    }
    isReady = false;
  });

  redis.on('close', () => {
    const wasReady = isReady;
    isReady = false;
    if (wasReady) logger.warn('Redis connection closed');
  });

  // Attempt initial connection (non-blocking)
  redis.connect().catch(() => {
    logger.warn('Redis unavailable — caching disabled, app continues normally');
  });

  return redis;
};

const getClient = () => {
  if (!client) client = createClient();
  return client;
};

// Start the singleton connection explicitly during application bootstrap.
// Cache operations still remain no-ops until Redis reports that it is ready.
const initRedis = () => getClient();

const closeRedis = async () => {
  if (!client) return;
  const activeClient = client;
  client = null;
  isReady = false;
  try { await activeClient.quit(); } catch { activeClient.disconnect(); }
};

// ── Cache helpers ──────────────────────────────────────────────

/**
 * Get a cached value. Returns null if cache miss or Redis down.
 */
const cacheGet = async (key) => {
  if (!isReady) return null;
  try {
    const val = await getClient().get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

/**
 * Set a cached value with TTL (seconds).
 * Silently skips if Redis is unavailable.
 */
const cacheSet = async (key, value, ttlSeconds = 60) => {
  if (!isReady) return;
  try {
    await getClient().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch { /* silent */ }
};

/**
 * Delete one or more keys.
 */
const cacheDel = async (...keys) => {
  if (!isReady || keys.length === 0) return;
  try {
    await getClient().del(...keys);
  } catch { /* silent */ }
};

/**
 * Delete all keys matching a pattern (e.g. 'dashboard:*').
 * Uses SCAN to avoid blocking Redis with KEYS on large datasets.
 */
const cacheInvalidatePattern = async (pattern) => {
  if (!isReady) return;
  try {
    const redis = getClient();
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch { /* silent */ }
};

/**
 * Wrap an async function with cache-aside pattern.
 * If cached → return cached. If not → run fn, cache result, return.
 */
const withCache = async (key, ttlSeconds, fn) => {
  const cached = await cacheGet(key);
  if (cached !== null) {
    logger.debug(`Cache HIT: ${key}`);
    return cached;
  }
  logger.debug(`Cache MISS: ${key}`);
  const result = await fn();
  await cacheSet(key, result, ttlSeconds);
  return result;
};

module.exports = {
  initRedis,
  getClient,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheInvalidatePattern,
  withCache,
  closeRedis,
  isConnected: () => isReady
};
