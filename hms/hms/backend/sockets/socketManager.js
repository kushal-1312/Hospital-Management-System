/**
 * UPGRADE 2: Socket.io Real-Time Server
 *
 * Architecture:
 *  - One Socket.io server attached to the HTTP server
 *  - JWT authentication on every socket connection
 *  - Role-based rooms: each user joins their own room + their role room
 *  - Admins join 'admin' room → receive all broadcasts
 *  - Doctors join 'doctor:<id>' room → receive their appointment updates
 *  - A singleton `socketManager` is exported so controllers can emit events
 */

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getClient } = require('../cache/redisClient');

let io; // singleton Socket.io instance
let socketRedisClients = [];

// ── In-memory notification store (per user, capped at 50) ──────
// In production, replace with Redis or MongoDB collection.
const notificationStore = new Map(); // userId → Notification[]

const MAX_NOTIFICATIONS = 50;

/**
 * Add a notification for a specific user
 */
const addNotification = (userId, notification) => {
  const id = String(userId);
  if (!notificationStore.has(id)) notificationStore.set(id, []);
  const list = notificationStore.get(id);
  list.unshift({ ...notification, id: Date.now(), read: false, timestamp: new Date() });
  if (list.length > MAX_NOTIFICATIONS) list.length = MAX_NOTIFICATIONS;
};

/**
 * Get notifications for a user
 */
const getNotifications = (userId) => {
  return notificationStore.get(String(userId)) || [];
};

/**
 * Mark notifications as read
 */
const markNotificationsRead = (userId, notificationIds) => {
  const list = notificationStore.get(String(userId)) || [];
  list.forEach(n => {
    if (!notificationIds || notificationIds.includes(n.id)) n.read = true;
  });
};

// ── Initialize Socket.io on the HTTP server ────────────────────
const initSocket = async (httpServer) => {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',').map(origin => origin.trim()).filter(Boolean);
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Reconnection ping interval
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Redis pub/sub lets Socket.io fan out events across every API replica.
  try {
    const pubClient = getClient();
    if (pubClient.status !== 'ready') {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Redis adapter connection timed out')), 2_000);
        pubClient.once('ready', () => { clearTimeout(timer); resolve(); });
        pubClient.once('error', error => { clearTimeout(timer); reject(error); });
      });
    }
    const subClient = pubClient.duplicate({ lazyConnect: true, enableOfflineQueue: false });
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    socketRedisClients = [subClient];
    logger.info('Socket.io Redis adapter active');
  } catch (error) {
    logger.warn(`Socket.io running on a single node: ${error.message}`);
  }

  // ── JWT Authentication middleware for every socket connection ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ||
                  socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.preAuth) return next(new Error('Complete 2FA first'));
      socket.user = decoded; // { id, role }
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────
  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;
    logger.info(`Socket connected: user=${userId} role=${role} socketId=${socket.id}`);

    // ── Join role-based rooms ───────────────────────────────────
    socket.join(`user:${userId}`);      // personal room
    socket.join(`role:${role}`);        // role-wide room
    if (role === 'admin') {
      socket.join('admin');             // admin-only events
    }
    if (role === 'doctor') {
      socket.join(`doctor:${userId}`);  // doctor-specific events
    }

    // ── Send queued notifications on connect ────────────────────
    const pending = getNotifications(userId);
    if (pending.length > 0) {
      socket.emit('notifications:init', pending);
    }

    // ── Client requests notification list ───────────────────────
    socket.on('notifications:get', () => {
      socket.emit('notifications:init', getNotifications(userId));
    });

    // ── Client marks notifications read ─────────────────────────
    socket.on('notifications:read', ({ ids }) => {
      markNotificationsRead(userId, ids);
      socket.emit('notifications:updated', getNotifications(userId));
    });

    // ── Client requests fresh dashboard stats ───────────────────
    socket.on('dashboard:request', async () => {
      try {
        const stats = await buildDashboardSnapshot(role, userId);
        socket.emit('dashboard:update', stats);
      } catch (err) {
        logger.error(`Dashboard snapshot error: ${err.message}`);
      }
    });

    // ── Disconnection ───────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: user=${userId} reason=${reason}`);
    });
  });

  logger.info('✅ Socket.io initialized');
  return io;
};

const closeSocket = async () => {
  await Promise.allSettled(socketRedisClients.map(client => client.quit()));
  socketRedisClients = [];
  if (io) await new Promise(resolve => io.close(resolve));
  io = undefined;
};

// ── Build a lightweight dashboard snapshot ─────────────────────
const buildDashboardSnapshot = async (role, userId) => {
  const Patient = require('../models/Patient');
  const Appointment = require('../models/Appointment');
  const User = require('../models/User');

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const apptFilter = role === 'doctor' ? { doctor: userId } : {};
  const patientFilter = role === 'doctor' ? { assignedDoctor: userId } : {};

  const [totalPatients, activePatients, criticalPatients,
         todayAppointments, pendingAppointments, totalDoctors] = await Promise.all([
    Patient.countDocuments(patientFilter),
    Patient.countDocuments({ ...patientFilter, status: 'active' }),
    Patient.countDocuments({ ...patientFilter, status: 'critical' }),
    Appointment.countDocuments({ ...apptFilter, date: { $gte: startOfDay, $lte: endOfDay } }),
    Appointment.countDocuments({ ...apptFilter, status: 'pending' }),
    User.countDocuments({ role: 'doctor', isActive: true })
  ]);

  return {
    totalPatients, activePatients, criticalPatients,
    todayAppointments, pendingAppointments, totalDoctors,
    timestamp: new Date()
  };
};

// ── socketManager: exported API used by controllers ────────────
const socketManager = {
  // ── Emit to everyone ───────────────────────────────────────
  broadcast: (event, data) => {
    if (!io) return;
    io.emit(event, data);
  },

  // ── Emit to a specific user ────────────────────────────────
  emitToUser: (userId, event, data) => {
    if (!io) return;
    io.to(`user:${userId}`).emit(event, data);
  },

  // ── Emit to all users with a specific role ─────────────────
  emitToRole: (role, event, data) => {
    if (!io) return;
    io.to(`role:${role}`).emit(event, data);
  },

  // ── Emit to admins only ────────────────────────────────────
  emitToAdmins: (event, data) => {
    if (!io) return;
    io.to('admin').emit(event, data);
  },

  // ── Push a dashboard refresh to all connected clients ──────
  // Called after any patient/appointment mutation
  pushDashboardRefresh: () => {
    if (!io) return;
    io.emit('dashboard:refresh'); // clients re-fetch on this signal
  },

  // ── Send a notification to a specific user ─────────────────
  // Stores it even if user is offline; delivered on next connect
  notify: (userId, notification) => {
    if (!io) return;
    addNotification(userId, notification);
    io.to(`user:${userId}`).emit('notification:new', {
      ...notification,
      id: Date.now(),
      read: false,
      timestamp: new Date()
    });
  },

  // ── Broadcast notification to a role ──────────────────────
  notifyRole: (role, notification) => {
    if (!io) return;
    io.to(`role:${role}`).emit('notification:new', {
      ...notification,
      id: Date.now(),
      read: false,
      timestamp: new Date()
    });
  },

  // ── Patient events ─────────────────────────────────────────
  patientAdded: (patient) => {
    if (!io) return;
    const payload = {
      type: 'patient_added',
      patientId: patient.patientId,
      name: patient.name,
      status: patient.status,
      timestamp: new Date()
    };
    // Notify all staff
    io.to('role:admin').to('role:nurse').to('role:staff').emit('patient:added', payload);
    // Notify assigned doctor specifically
    if (patient.assignedDoctor) {
      io.to(`doctor:${patient.assignedDoctor}`).emit('patient:added', payload);
    }
    // Push dashboard refresh for all
    socketManager.pushDashboardRefresh();
  },

  patientStatusChanged: (patient, previousStatus) => {
    if (!io) return;
    const payload = {
      patientId: patient.patientId,
      name: patient.name,
      previousStatus,
      newStatus: patient.status,
      timestamp: new Date()
    };
    // Critical patient alert → all roles get notified
    if (patient.status === 'critical') {
      io.emit('patient:critical', payload);
      socketManager.notifyRole('admin', {
        title: '🚨 Critical Patient Alert',
        body: `${patient.name} (${patient.patientId}) status changed to CRITICAL`,
        type: 'critical',
        link: `/patients/${patient._id}`
      });
      socketManager.notifyRole('doctor', {
        title: '🚨 Critical Patient Alert',
        body: `${patient.name} (${patient.patientId}) is now in critical condition`,
        type: 'critical',
        link: `/patients/${patient._id}`
      });
    }
    io.emit('patient:statusChanged', payload);
    socketManager.pushDashboardRefresh();
  },

  // ── Appointment events ─────────────────────────────────────
  appointmentScheduled: (appointment) => {
    if (!io) return;
    const payload = {
      appointmentId: appointment.appointmentId,
      patientName: appointment.patientName,
      doctorName: appointment.doctorName,
      date: appointment.date,
      timeSlot: appointment.timeSlot,
      type: appointment.type,
      timestamp: new Date()
    };
    // Notify the assigned doctor
    if (appointment.doctor) {
      const notification = {
        title: '📅 New Appointment',
        body: `${appointment.patientName} scheduled for ${new Date(appointment.date).toLocaleDateString()} at ${appointment.timeSlot?.start}`,
        type: 'appointment',
        link: `/appointments`
      };
      socketManager.notify(appointment.doctor, notification);
      io.to(`doctor:${appointment.doctor}`).emit('appointment:scheduled', payload);
    }
    // Notify admins
    io.to('admin').emit('appointment:scheduled', payload);
    socketManager.pushDashboardRefresh();
  },

  appointmentStatusChanged: (appointment) => {
    if (!io) return;
    const payload = {
      appointmentId: appointment.appointmentId,
      patientName: appointment.patientName,
      status: appointment.status,
      timestamp: new Date()
    };
    io.to(`doctor:${appointment.doctor}`).emit('appointment:statusChanged', payload);
    io.to('admin').emit('appointment:statusChanged', payload);
    socketManager.pushDashboardRefresh();
  },

  // ── Staff events ───────────────────────────────────────────
  staffStatusChanged: (user) => {
    if (!io) return;
    io.to('admin').emit('staff:statusChanged', {
      userId: user._id,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      timestamp: new Date()
    });
    socketManager.pushDashboardRefresh();
  },

  getIO: () => io
};

module.exports = { initSocket, closeSocket, socketManager };
