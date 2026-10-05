const express = require('express');
const { isReady: isDatabaseReady } = require('../config/supabase');
const { isConnected: isRedisConnected } = require('../cache/redisClient');

const router = express.Router();
const startedAt = new Date();

const snapshot = () => {
  const databaseReady = isDatabaseReady();
  const cacheReady = isRedisConnected();
  const redisRequired = process.env.REDIS_REQUIRED === 'true';
  const ready = databaseReady && (!redisRequired || cacheReady);
  return {
    status: ready ? (cacheReady ? 'ready' : 'degraded') : 'not-ready',
    version: '3.0.0',
    build: process.env.BUILD_SHA || 'development',
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      api: 'up',
      database: databaseReady ? 'connected' : (process.env.SUPABASE_URL?.includes('placeholder') ? 'standby' : 'unavailable'),
      cache: cacheReady ? 'connected' : 'unavailable'
    }
  };
};

router.get('/', (_req, res) => {
  const health = snapshot();
  res.status(health.status === 'not-ready' ? 503 : 200).json(health);
});

router.get('/live', (_req, res) => res.json({ status: 'alive', version: '3.0.0', uptimeSeconds: Math.round(process.uptime()) }));

router.get('/ready', (_req, res) => {
  const health = snapshot();
  res.status(health.status === 'not-ready' ? 503 : 200).json(health);
});

module.exports = router;
