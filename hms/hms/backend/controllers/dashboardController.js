const Patient     = require('../models/Patient');
const Appointment = require('../models/Appointment');
const User        = require('../models/User');
const { withCache, cacheInvalidatePattern } = require('../cache/redisClient');
const { CacheKeys, TTL } = require('../cache/cacheKeys');
const logger = require('../utils/logger');

/**
 * UPGRADE 7: Cached Dashboard Stats
 *
 * Previously: 12 parallel MongoDB aggregations on EVERY request.
 * Now:        Served from Redis (< 1ms) for 30 seconds.
 *             Auto-invalidated when patients/appointments change
 *             (socketManager.pushDashboardRefresh calls invalidateDashboardCache).
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const cacheKey = CacheKeys.DASHBOARD_STATS(req.user._id, req.user.role);
    const ttl      = TTL.DASHBOARD;

    const data = await withCache(cacheKey, ttl, async () => {
      // ── Heavy DB work (only runs on cache miss) ────────────
      const today        = new Date();
      const startOfToday = new Date(today.setHours(0, 0, 0, 0));
      const endOfToday   = new Date(today.setHours(23, 59, 59, 999));

      const apptFilter    = req.user.role === 'doctor' ? { doctor: req.user._id }     : {};
      const patientFilter = req.user.role === 'doctor' ? { assignedDoctor: req.user._id } : {};

      const [
        totalPatients, activePatients, criticalPatients,
        todayAppointments, pendingAppointments, completedAppointments,
        totalDoctors, totalStaff,
        recentPatients, upcomingAppointments,
        monthlyPatients, monthlyAppointments
      ] = await Promise.all([
        Patient.countDocuments(patientFilter),
        Patient.countDocuments({ ...patientFilter, status: 'active' }),
        Patient.countDocuments({ ...patientFilter, status: 'critical' }),
        Appointment.countDocuments({ ...apptFilter, date: { $gte: startOfToday, $lte: endOfToday } }),
        Appointment.countDocuments({ ...apptFilter, status: 'pending' }),
        Appointment.countDocuments({ ...apptFilter, status: 'completed' }),
        User.countDocuments({ role: 'doctor', isActive: true }),
        User.countDocuments({ role: { $in: ['nurse', 'staff'] }, isActive: true }),
        Patient.find(patientFilter).sort({ createdAt: -1 }).limit(5)
          .select('name patientId status gender createdAt').lean(),
        Appointment.find({
          ...apptFilter,
          date: { $gte: startOfToday, $lte: endOfToday },
          status: { $in: ['pending', 'confirmed'] }
        }).sort({ 'timeSlot.start': 1 }).limit(5)
          .populate('patient', 'name patientId')
          .populate('doctor', 'name specialization')
          .lean(),
        Patient.aggregate([
          { $match: { ...patientFilter, admissionDate: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) } } },
          { $group: { _id: { year: { $year: '$admissionDate' }, month: { $month: '$admissionDate' } }, count: { $sum: 1 } } },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]),
        Appointment.aggregate([
          { $match: { ...apptFilter, date: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) } } },
          { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, count: { $sum: 1 } } },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ])
      ]);

      logger.debug(`Dashboard computed from DB for role=${req.user.role}`);
      return {
        counts: {
          totalPatients, activePatients, criticalPatients,
          todayAppointments, pendingAppointments, completedAppointments,
          totalDoctors, totalStaff
        },
        recentPatients,
        upcomingAppointments,
        charts: { monthlyPatients, monthlyAppointments }
      };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

/**
 * Called by socketManager whenever data changes.
 * Wipes dashboard cache for all users immediately.
 */
const invalidateDashboardCache = async () => {
  await cacheInvalidatePattern(CacheKeys.DASHBOARD_PATTERN);
  logger.debug('[Cache] Dashboard cache invalidated');
};

module.exports = { getDashboardStats, invalidateDashboardCache };
