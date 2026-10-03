const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { isConnected } = require('../cache/redisClient');
const { getQueues } = require('../workers/queueManager');
const { getJobStatus } = require('../workers/queueManager');

/**
 * UPGRADE 7: Cache & Queue Management Routes (admin only)
 */
router.use(authenticate, authorize('admin'));

// GET /api/system/cache — Redis health + basic stats
router.get('/cache', async (req, res) => {
  const connected = isConnected();
  let info = {};

  if (connected) {
    const { getClient } = require('../cache/redisClient');
    try {
      const client = getClient();
      const dbSize  = await client.dbsize();
      info = { dbSize, connected: true };
    } catch {
      info = { connected: false };
    }
  }

  res.json({
    success: true,
    data: {
      redis: { connected, ...info },
      message: connected
        ? '✅ Redis is connected and caching is active'
        : '⚠️ Redis unavailable — app running without cache'
    }
  });
});

// DELETE /api/system/cache — flush all cache keys
router.delete('/cache', async (req, res) => {
  try {
    if (isConnected()) {
      const { getClient } = require('../cache/redisClient');
      await getClient().flushdb();
      return res.json({ success: true, message: 'All cache keys cleared' });
    }
    res.json({ success: true, message: 'Redis not connected — nothing to clear' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/system/queues — Bull queue stats
router.get('/queues', async (req, res) => {
  try {
    const { exportQueue, emailQueue, reportQueue } = getQueues();
    const stats = {};

    for (const [name, q] of Object.entries({ exports: exportQueue, emails: emailQueue, reports: reportQueue })) {
      if (!q) { stats[name] = { status: 'unavailable' }; continue; }
      const [waiting, active, completed, failed] = await Promise.all([
        q.getWaitingCount(), q.getActiveCount(),
        q.getCompletedCount(), q.getFailedCount()
      ]);
      stats[name] = { waiting, active, completed, failed };
    }

    res.json({ success: true, data: stats });
  } catch (err) {
    res.json({ success: true, data: {}, message: 'Queue stats unavailable (Redis offline)' });
  }
});

// GET /api/system/jobs/:queue/:id — job status polling
router.get('/jobs/:queue/:id', async (req, res) => {
  const status = await getJobStatus(req.params.queue, req.params.id);
  if (!status) return res.status(404).json({ success: false, message: 'Job not found' });
  res.json({ success: true, data: status });
});

module.exports = router;
