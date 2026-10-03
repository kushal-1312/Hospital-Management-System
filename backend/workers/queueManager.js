const { Queue } = require('bullmq');
const logger = require('../utils/logger');
const { isConnected } = require('../cache/redisClient');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
};

const defaultJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 250 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 }
};

let exportQueue = null;
let emailQueue = null;
let reportQueue = null;
let cacheWarmQueue = null;

const initQueues = () => {
  if (exportQueue) return true;
  try {
    const options = { connection, defaultJobOptions };
    exportQueue = new Queue('exports', options);
    emailQueue = new Queue('emails', options);
    reportQueue = new Queue('reports', options);
    cacheWarmQueue = new Queue('cache-warm', options);
    [exportQueue, emailQueue, reportQueue, cacheWarmQueue].forEach(queue => {
      queue.on('error', error => logger.warn(`[Queue:${queue.name}] ${error.message}`));
    });
    logger.info('BullMQ job queues initialized');
    return true;
  } catch (error) {
    logger.warn(`Queue initialization failed: ${error.message}`);
    return false;
  }
};

const addJob = async (queue, name, data, options = {}) => {
  if (!queue || !isConnected()) return null;
  try {
    return await queue.add(name, data, options);
  } catch (error) {
    logger.warn(`[Queue:${queue.name}] Could not enqueue ${name}: ${error.message}`);
    return null;
  }
};

const addExportJob = async data => {
  const job = await addJob(exportQueue, 'csv-export', data, { priority: 1 });
  return job?.id || null;
};

const addEmailJob = data => addJob(emailQueue, 'send-email', data, { priority: 2 });

const addReportJob = (data, delay = 0) => addJob(reportQueue, 'generate-report', data, { delay, priority: 3 });

const scheduleCacheWarm = () => addJob(cacheWarmQueue, 'warm-cache', {}, {
  repeat: { pattern: '5 0 * * *' },
  jobId: 'daily-cache-warm'
});

const getJobStatus = async (queueName, jobId) => {
  const queue = { exports: exportQueue, emails: emailQueue, reports: reportQueue }[queueName];
  if (!queue || !isConnected()) return null;
  try {
    const job = await queue.getJob(jobId);
    if (!job) return null;
    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      data: job.returnvalue
    };
  } catch (error) {
    logger.warn(`[Queue:${queueName}] Could not read job ${jobId}: ${error.message}`);
    return null;
  }
};

const closeQueues = async () => {
  const queues = [exportQueue, emailQueue, reportQueue, cacheWarmQueue].filter(Boolean);
  await Promise.allSettled(queues.map(queue => queue.close()));
  exportQueue = emailQueue = reportQueue = cacheWarmQueue = null;
};

module.exports = {
  connection,
  initQueues,
  closeQueues,
  addExportJob,
  addEmailJob,
  addReportJob,
  scheduleCacheWarm,
  getJobStatus,
  getQueues: () => ({ exportQueue, emailQueue, reportQueue, cacheWarmQueue })
};
