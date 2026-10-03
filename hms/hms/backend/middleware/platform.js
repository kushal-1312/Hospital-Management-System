const crypto = require('crypto');
const { performance } = require('perf_hooks');
const logger = require('../utils/logger');
const { httpRequests, httpDuration } = require('../utils/metrics');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const requestContext = (req, res, next) => {
  const incomingId = req.get('x-request-id');
  req.id = incomingId && /^[a-zA-Z0-9._:-]{8,100}$/.test(incomingId)
    ? incomingId
    : crypto.randomUUID();
  req.startedAt = performance.now();
  res.setHeader('X-Request-ID', req.id);

  res.on('finish', () => {
    const durationMs = performance.now() - req.startedAt;
    const route = `${req.baseUrl || ''}${req.route?.path || req.path || 'unknown'}`
      .replace(/[a-f\d]{24}/gi, ':id');
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequests.inc(labels);
    httpDuration.observe(labels, durationMs / 1000);
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      requestId: req.id,
      durationMs: Math.round(durationMs),
      userId: req.user?._id
    });
  });
  next();
};

const rejectDangerousInput = (req, res, next) => {
  const findDangerousKey = (value) => {
    if (!value || typeof value !== 'object') return null;
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) return key;
      const nested = findDangerousKey(child);
      if (nested) return nested;
    }
    return null;
  };
  const dangerousKey = findDangerousKey(req.body) || findDangerousKey(req.query) || findDangerousKey(req.params);
  if (dangerousKey) {
    return res.status(400).json({ success: false, message: 'Request contains an unsupported field.', requestId: req.id });
  }
  next();
};

const complianceAudit = (req, res, next) => {
  if (process.env.NODE_ENV === 'test' || !MUTATING_METHODS.has(req.method)) return next();
  res.on('finish', () => {
    if (!req.user || res.statusCode >= 500) return;
    const cleanPath = req.originalUrl.split('?')[0];
    const parts = cleanPath.split('/').filter(Boolean);
    const resource = parts[1] || 'unknown';
    const resourceId = req.params?.id || req.params?.patientId || undefined;
    const event = {
      occurredAt: new Date(),
      requestId: req.id,
      actor: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
      action: `${req.method} ${req.path}`,
      resource,
      resourceId,
      outcome: res.statusCode < 400 ? 'success' : 'rejected',
      statusCode: res.statusCode,
      durationMs: Math.round(performance.now() - req.startedAt),
      source: { ip: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 300) }
    };
    setImmediate(() => {
      const AuditEvent = require('../models/AuditEvent');
      AuditEvent.createSigned(event).catch((error) => logger.error('Audit event persistence failed', {
        requestId: req.id,
        error: error.message
      }));
    });
  });
  next();
};

module.exports = { requestContext, rejectDangerousInput, complianceAudit };
