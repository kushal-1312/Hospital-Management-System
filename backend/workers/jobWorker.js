require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const connectDB = require('../config/database');
const validateEnv = require('../config/validateEnv');
const logger = require('../utils/logger');
const { connection, initQueues, closeQueues, scheduleCacheWarm } = require('./queueManager');
const { initRedis, closeRedis, cacheSet } = require('../cache/redisClient');
const { CacheKeys, TTL } = require('../cache/cacheKeys');

const workerConnection = { ...connection, maxRetriesPerRequest: null, enableOfflineQueue: true };
const workers = [];

const models = () => ({
  Patient: require('../models/Patient'),
  Appointment: require('../models/Appointment'),
  User: require('../models/User'),
  Invoice: require('../models/Invoice')
});

const createWorker = (queue, processor, concurrency) => {
  const worker = new Worker(queue, processor, { connection: workerConnection, concurrency });
  worker.on('completed', job => logger.info(`[Worker:${queue}] job=${job.id} completed`));
  worker.on('failed', (job, error) => logger.error(`[Worker:${queue}] job=${job?.id} failed: ${error.message}`));
  worker.on('error', error => logger.error(`[Worker:${queue}] ${error.message}`));
  workers.push(worker);
};

const start = async () => {
  validateEnv();
  await connectDB();
  const redis = initRedis();
  initQueues();

  createWorker('exports', async job => {
    const { type, filters = {} } = job.data;
    await job.updateProgress(10);
    const { Patient } = models();
    const data = type === 'patients'
      ? await Patient.find(filters)
        .populate('assignedDoctor', 'name')
        .select('patientId name age gender status currentDiagnosis contact address admissionDate assignedDoctor')
        .lean()
      : [];
    await job.updateProgress(70);
    const headers = ['Patient ID', 'Name', 'Age', 'Gender', 'Status', 'Diagnosis', 'Phone', 'City', 'Admission Date', 'Doctor'];
    const rows = data.map(patient => [
      patient.patientId, patient.name, patient.age, patient.gender, patient.status,
      patient.currentDiagnosis || '', patient.contact?.phone || '', patient.address?.city || '',
      patient.admissionDate ? new Date(patient.admissionDate).toLocaleDateString('en-IN') : '',
      patient.assignedDoctor?.name || ''
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    await job.updateProgress(100);
    return { csv, rowCount: data.length };
  }, Number(process.env.JOB_CONCURRENCY) || 3);

  createWorker('emails', async job => {
    const { sendEmail } = require('../services/emailService');
    await sendEmail(job.data);
    return { sent: true };
  }, 5);

  createWorker('reports', async job => {
    const { reportType, dateRange } = job.data;
    const { Patient, Appointment, Invoice } = models();
    let reportData = {};
    if (reportType === 'monthly-summary') {
      const startDate = new Date(dateRange?.start || new Date().setDate(1));
      const endDate = new Date(dateRange?.end || new Date());
      const [newPatients, totalAppointments, revenue] = await Promise.all([
        Patient.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
        Appointment.countDocuments({ date: { $gte: startDate, $lte: endDate } }),
        Invoice.aggregate([
          { $match: { issueDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'cancelled' } } },
          { $group: { _id: null, total: { $sum: '$grandTotal' }, collected: { $sum: '$amountPaid' } } }
        ])
      ]);
      reportData = {
        reportType,
        dateRange: { start: startDate, end: endDate },
        newPatients,
        totalAppointments,
        revenue: revenue[0] || { total: 0, collected: 0 },
        generatedAt: new Date()
      };
    }
    await cacheSet(`report:${reportType}:${Date.now()}`, reportData, 3600);
    return reportData;
  }, 2);

  createWorker('cache-warm', async () => {
    const { Patient, Appointment, User, Invoice } = models();
    const [patientStatusStats, appointmentStatusStats, billingStats, doctors] = await Promise.all([
      Patient.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $group: { _id: null, totalBilled: { $sum: '$grandTotal' }, totalCollected: { $sum: '$amountPaid' }, totalOutstanding: { $sum: '$amountDue' }, totalInvoices: { $sum: 1 } } }]),
      User.find({ role: 'doctor', isActive: true }).select('name email specialization department phone').lean()
    ]);
    await Promise.all([
      cacheSet(CacheKeys.PATIENT_STATS, { statusStats: patientStatusStats }, TTL.STATS),
      cacheSet('appointment:stats', { statusStats: appointmentStatusStats }, TTL.STATS),
      cacheSet(CacheKeys.BILLING_STATS, billingStats[0] || {}, TTL.STATS),
      cacheSet(CacheKeys.DOCTORS_LIST, doctors, TTL.DOCTORS)
    ]);
    return { warmedAt: new Date(), keys: 4 };
  }, 1);

  if (redis.status !== 'ready') {
    await new Promise((resolve) => {
      redis.once('ready', resolve);
      redis.once('error', () => resolve());
      setTimeout(resolve, 2000);
    });
  }
  if (redis.status === 'ready') {
    await redis.ping();
  }
  await scheduleCacheWarm();
  logger.info('MedCare background workers are ready');
};

let closing = false;
const shutdown = async signal => {
  if (closing) return;
  closing = true;
  logger.info(`Worker graceful shutdown started (${signal})`);
  await Promise.allSettled(workers.map(worker => worker.close()));
  await Promise.allSettled([closeQueues(), closeRedis(), mongoose.disconnect()]);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch(error => {
  logger.error(`Worker startup failed: ${error.message}`);
  process.exit(1);
});
