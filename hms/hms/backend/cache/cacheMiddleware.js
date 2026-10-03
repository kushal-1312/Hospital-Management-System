const { cacheGet, cacheSet, cacheInvalidatePattern } = require('../cache/redisClient');
const logger = require('../utils/logger');

/**
 * UPGRADE 7: Cache Middleware
 *
 * Route-level cache middleware — wrap any GET route to
 * serve from Redis when fresh, fall through to controller on miss.
 *
 * Usage:
 *   router.get('/stats', cacheMiddleware('billing:stats', 60), getStats);
 */
const cacheMiddleware = (keyOrFn, ttlSeconds = 60) => {
  return async (req, res, next) => {
    // Build cache key — supports static string or dynamic function
    const key = typeof keyOrFn === 'function' ? keyOrFn(req) : keyOrFn;

    try {
      const cached = await cacheGet(key);
      if (cached !== null) {
        logger.debug(`[Cache HIT] ${key}`);
        // Add header so client/dev can see cache status
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', key);
        return res.json(cached);
      }
    } catch { /* Redis down — fall through */ }

    logger.debug(`[Cache MISS] ${key}`);
    res.setHeader('X-Cache', 'MISS');

    // Intercept res.json to cache the response before sending
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success) {
        await cacheSet(key, body, ttlSeconds).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Invalidation middleware — clears specified cache patterns
 * AFTER a mutating request succeeds. Attach to POST/PUT/DELETE routes.
 *
 * Usage:
 *   router.post('/', invalidateCache('patient:*', 'dashboard:stats:*'), createPatient);
 */
const invalidateCache = (...patterns) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only invalidate on success
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await Promise.all(
          patterns.map(p => cacheInvalidatePattern(p).catch(() => {}))
        );
        if (patterns.length > 0) {
          logger.debug(`[Cache INVALIDATED] patterns: ${patterns.join(', ')}`);
        }
      }
      return originalJson(body);
    };
    next();
  };
};

module.exports = { cacheMiddleware, invalidateCache };
