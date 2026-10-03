require('dotenv').config({ quiet: true });
const fs = require('fs');
const http = require('http');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoose = require('mongoose');

const connectDB = require('./config/database');
const validateEnv = require('./config/validateEnv');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { generateCsrfToken } = require('./middleware/auth');
const { requestContext, rejectDangerousInput, complianceAudit } = require('./middleware/platform');
const { initSocket, closeSocket } = require('./sockets/socketManager');
const { initQueues, closeQueues } = require('./workers/queueManager');
const { initRedis, closeRedis } = require('./cache/redisClient');
const { registry } = require('./utils/metrics');

const authRoutes = require('./routes/auth');
const notificationRoutes = require('./routes/notifications');
const billingRoutes = require('./routes/billing');
const pharmacyRoutes = require('./routes/pharmacy');
const systemRoutes = require('./routes/system');
const operationsRoutes = require('./routes/operations');
const healthRoutes = require('./routes/health');

const app = express();
const httpServer = http.createServer(app);
const isTest = process.env.NODE_ENV === 'test';

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
}

['./logs', './uploads'].forEach(directory => {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
});

app.use(requestContext);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  strictTransportSecurity: process.env.NODE_ENV === 'production'
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
    : false
}));

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => !origin || allowedOrigins.includes(origin)
    ? callback(null, true)
    : callback(new Error('Origin is not allowed by CORS')),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID']
}));

if (!isTest) {
  app.use('/api/', rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW || 15) * 60_000,
    limit: Number(process.env.RATE_LIMIT_MAX || 1000),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Request capacity exceeded. Try again shortly.' }
  }));
}

app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '100kb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT || '100kb' }));
app.use(cookieParser());
app.use(rejectDangerousInput);
app.use(compression());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { fallthrough: false, maxAge: '1h' }));
app.use(generateCsrfToken);
app.use(complianceAudit);

app.use('/health', healthRoutes);
app.get('/metrics', async (req, res) => {
  const expected = process.env.METRICS_TOKEN;
  if (process.env.NODE_ENV === 'production' && (!expected || req.get('authorization') !== `Bearer ${expected}`)) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/patients', require('./routes/patients'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/billing', billingRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/reports', require('./routes/reports'));

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
httpServer.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS) || 30_000;
httpServer.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS) || 35_000;
httpServer.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 65_000;

let shuttingDown = false;
const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Graceful shutdown started (${signal})`);
  const forceTimer = setTimeout(() => process.exit(1), 15_000);
  forceTimer.unref();
  httpServer.close(async () => {
    await Promise.allSettled([closeSocket(), closeQueues(), closeRedis(), mongoose.disconnect()]);
    logger.info('Graceful shutdown complete');
    process.exit(exitCode);
  });
};

const startServer = async () => {
  validateEnv();
  await connectDB();
  initRedis();
  await initSocket(httpServer);
  initQueues();
  httpServer.listen(PORT, () => {
    logger.info(`MedCare One API v3.0.0 listening on ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
};

if (!isTest) {
  startServer().catch(error => {
    logger.error(`Startup failed: ${error.message}`);
    process.exit(1);
  });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', error => {
    logger.error(`Unhandled rejection: ${error.message}`);
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', error => {
    logger.error(`Uncaught exception: ${error.message}`);
    shutdown('uncaughtException', 1);
  });
}

module.exports = app;
