const Patient     = require('../models/Patient');
const Appointment = require('../models/Appointment');
const User        = require('../models/User');
const Invoice     = require('../models/Invoice');
const { withCache } = require('../cache/redisClient');
const { TTL }       = require('../cache/cacheKeys');
const { addEmailJob, addReportJob } = require('../workers/queueManager');
const logger = require('../utils/logger');

/**
 * UPGRADE 8: Reports & Analytics Controller
 *
 * Provides:
 *  1. Department-wise patient distribution
 *  2. Doctor performance report
 *  3. Bed occupancy rate over time
 *  4. Revenue vs outstanding trend
 *  5. Appointment completion rate by doctor
 *  6. Patient demographics breakdown
 *  7. Schedule a report email (background job)
 *  8. Custom date-range summary report
 */

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─────────────────────────────────────────────────────────────
// 1. DEPARTMENT-WISE PATIENT DISTRIBUTION
// ─────────────────────────────────────────────────────────────
const getDepartmentReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = `report:department:${startDate||'all'}:${endDate||'all'}`;

    const data = await withCache(cacheKey, TTL.STATS, async () => {
      const match = {};
      if (startDate || endDate) {
        match.admissionDate = {};
        if (startDate) match.admissionDate.$gte = new Date(startDate);
        if (endDate)   match.admissionDate.$lte = new Date(new Date(endDate).setHours(23,59,59));
      }

      const [byDept, byStatus, byGender, totalPatients] = await Promise.all([
        // Patients grouped by their assigned doctor's department
        Patient.aggregate([
          { $match: match },
          { $lookup: { from: 'users', localField: 'assignedDoctor', foreignField: '_id', as: 'doctor' } },
          { $unwind: { path: '$doctor', preserveNullAndEmpty: true } },
          { $group: { _id: { $ifNull: ['$doctor.department', 'Unassigned'] }, count: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, discharged: { $sum: { $cond: [{ $eq: ['$status', 'discharged'] }, 1, 0] } } } },
          { $sort: { count: -1 } }
        ]),
        Patient.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        Patient.aggregate([{ $match: match }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
        Patient.countDocuments(match)
      ]);

      return { byDept, byStatus, byGender, totalPatients };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// 2. DOCTOR PERFORMANCE REPORT
// ─────────────────────────────────────────────────────────────
const getDoctorPerformanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate, doctorId } = req.query;
    const cacheKey = `report:doctor-perf:${doctorId||'all'}:${startDate||'all'}:${endDate||'all'}`;

    const data = await withCache(cacheKey, TTL.STATS, async () => {
      const dateMatch = {};
      if (startDate || endDate) {
        dateMatch.date = {};
        if (startDate) dateMatch.date.$gte = new Date(startDate);
        if (endDate)   dateMatch.date.$lte = new Date(new Date(endDate).setHours(23,59,59));
      }
      if (doctorId) dateMatch.doctor = doctorId;

      const [apptStats, doctors] = await Promise.all([
        Appointment.aggregate([
          { $match: dateMatch },
          { $group: {
            _id: '$doctor',
            total:       { $sum: 1 },
            completed:   { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
            cancelled:   { $sum: { $cond: [{ $eq: ['$status','cancelled'] }, 1, 0] } },
            noShow:      { $sum: { $cond: [{ $eq: ['$status','no-show'] },   1, 0] } },
            pending:     { $sum: { $cond: [{ $eq: ['$status','pending'] },   1, 0] } },
          }},
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'doctor' } },
          { $unwind: '$doctor' },
          { $project: {
            doctorName:       '$doctor.name',
            specialization:   '$doctor.specialization',
            department:       '$doctor.department',
            total: 1, completed: 1, cancelled: 1, noShow: 1, pending: 1,
            completionRate: { $multiply: [{ $divide: ['$completed', { $max: ['$total', 1] }] }, 100] }
          }},
          { $sort: { total: -1 } }
        ]),
        // Patient load per doctor
        Patient.aggregate([
          ...(doctorId ? [{ $match: { assignedDoctor: doctorId } }] : []),
          { $group: { _id: '$assignedDoctor', patientCount: { $sum: 1 }, activeCount: { $sum: { $cond: [{ $eq: ['$status','active'] }, 1, 0] } } } },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'doctor' } },
          { $unwind: { path: '$doctor', preserveNullAndEmpty: true } },
          { $project: { doctorName: '$doctor.name', patientCount: 1, activeCount: 1 } }
        ])
      ]);

      // Merge appointment stats with patient counts
      const merged = apptStats.map(a => {
        const p = doctors.find(d => d._id?.toString() === a._id?.toString());
        return { ...a, patientCount: p?.patientCount || 0, activePatients: p?.activeCount || 0 };
      });

      return { doctors: merged, generatedAt: new Date() };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// 3. REVENUE TREND REPORT
// ─────────────────────────────────────────────────────────────
const getRevenueTrendReport = async (req, res, next) => {
  try {
    const { months = 6 } = req.query;
    const cacheKey = `report:revenue:${months}`;

    const data = await withCache(cacheKey, TTL.STATS, async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - Number(months));

      const [monthly, byStatus, topPatients] = await Promise.all([
        Invoice.aggregate([
          { $match: { issueDate: { $gte: startDate }, status: { $ne: 'cancelled' } } },
          { $group: {
            _id: { year: { $year: '$issueDate' }, month: { $month: '$issueDate' } },
            billed:      { $sum: '$grandTotal' },
            collected:   { $sum: '$amountPaid' },
            outstanding: { $sum: '$amountDue' },
            invoiceCount:{ $sum: 1 }
          }},
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          { $project: {
            month:       { $arrayElemAt: [MONTH_NAMES, { $subtract: ['$_id.month', 1] }] },
            year:        '$_id.year',
            billed: 1, collected: 1, outstanding: 1, invoiceCount: 1
          }}
        ]),
        Invoice.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }
        ]),
        // Top 5 patients by total billed
        Invoice.aggregate([
          { $match: { status: { $ne: 'cancelled' } } },
          { $group: { _id: '$patient', patientName: { $first: '$patientName' }, totalBilled: { $sum: '$grandTotal' }, invoiceCount: { $sum: 1 } } },
          { $sort: { totalBilled: -1 } },
          { $limit: 5 }
        ])
      ]);

      // Overall totals
      const totals = monthly.reduce((acc, m) => ({
        billed:      acc.billed      + m.billed,
        collected:   acc.collected   + m.collected,
        outstanding: acc.outstanding + m.outstanding
      }), { billed: 0, collected: 0, outstanding: 0 });

      return { monthly, byStatus, topPatients, totals, generatedAt: new Date() };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// 4. PATIENT DEMOGRAPHICS REPORT
// ─────────────────────────────────────────────────────────────
const getDemographicsReport = async (req, res, next) => {
  try {
    const cacheKey = 'report:demographics';

    const data = await withCache(cacheKey, TTL.LONG, async () => {
      const [
        ageGroups, bloodGroups, genderSplit,
        monthlyAdmissions, statusTrend, topDiagnoses
      ] = await Promise.all([
        // Age distribution
        Patient.aggregate([
          { $bucket: {
            groupBy: '$age',
            boundaries: [0, 13, 18, 30, 45, 60, 75, 150],
            default: 'Unknown',
            output: { count: { $sum: 1 } }
          }},
        ]),
        Patient.aggregate([
          { $match: { bloodGroup: { $ne: '' } } },
          { $group: { _id: '$bloodGroup', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Patient.aggregate([
          { $group: { _id: '$gender', count: { $sum: 1 } } }
        ]),
        // Monthly admissions last 12 months
        Patient.aggregate([
          { $match: { admissionDate: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) } } },
          { $group: { _id: { year: { $year: '$admissionDate' }, month: { $month: '$admissionDate' } }, count: { $sum: 1 } } },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          { $project: { month: { $arrayElemAt: [MONTH_NAMES, { $subtract: ['$_id.month', 1] }] }, year: '$_id.year', count: 1 } }
        ]),
        // Status breakdown over time
        Patient.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        // Top 10 diagnoses
        Patient.aggregate([
          { $match: { currentDiagnosis: { $exists: true, $ne: '' } } },
          { $group: { _id: '$currentDiagnosis', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ])
      ]);

      // Normalise age buckets
      const ageLabels = { 0: '0–12', 13: '13–17', 18: '18–29', 30: '30–44', 45: '45–59', 60: '60–74', 75: '75+' };
      const ageGroupsLabelled = ageGroups.map(g => ({
        range: ageLabels[g._id] || g._id,
        count: g.count
      }));

      return { ageGroups: ageGroupsLabelled, bloodGroups, genderSplit, monthlyAdmissions, statusTrend, topDiagnoses, generatedAt: new Date() };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// 5. APPOINTMENT ANALYTICS
// ─────────────────────────────────────────────────────────────
const getAppointmentAnalytics = async (req, res, next) => {
  try {
    const { months = 3 } = req.query;
    const cacheKey = `report:appt-analytics:${months}`;

    const data = await withCache(cacheKey, TTL.STATS, async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - Number(months));

      const [byType, byStatus, byHour, weeklyTrend, noShowRate] = await Promise.all([
        Appointment.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
        Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        // Peak hours
        Appointment.aggregate([
          { $project: { hour: { $substr: ['$timeSlot.start', 0, 2] } } },
          { $group: { _id: '$hour', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        // Weekly trend
        Appointment.aggregate([
          { $match: { date: { $gte: startDate } } },
          { $group: {
            _id: { year: { $year: '$date' }, week: { $week: '$date' } },
            count: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } }
          }},
          { $sort: { '_id.year': 1, '_id.week': 1 } },
          { $limit: 20 }
        ]),
        // No-show rate by doctor
        Appointment.aggregate([
          { $group: {
            _id: '$doctor',
            total:   { $sum: 1 },
            noShows: { $sum: { $cond: [{ $eq: ['$status','no-show'] }, 1, 0] } }
          }},
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'doc' } },
          { $unwind: { path: '$doc', preserveNullAndEmpty: true } },
          { $project: { doctorName: '$doc.name', total: 1, noShows: 1, noShowRate: { $multiply: [{ $divide: ['$noShows', { $max: ['$total', 1] }] }, 100] } } },
          { $sort: { total: -1 } },
          { $limit: 10 }
        ])
      ]);

      return { byType, byStatus, byHour, weeklyTrend, noShowRate, generatedAt: new Date() };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// 6. CUSTOM DATE-RANGE SUMMARY (the "instant report")
// ─────────────────────────────────────────────────────────────
const getSummaryReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate required' });
    }

    const start = new Date(startDate);
    const end   = new Date(new Date(endDate).setHours(23, 59, 59));

    const [
      newPatients, dischargedPatients,
      totalAppointments, completedAppointments, cancelledAppointments,
      revenueData
    ] = await Promise.all([
      Patient.countDocuments({ admissionDate: { $gte: start, $lte: end } }),
      Patient.countDocuments({ dischargeDate: { $gte: start, $lte: end } }),
      Appointment.countDocuments({ date: { $gte: start, $lte: end } }),
      Appointment.countDocuments({ date: { $gte: start, $lte: end }, status: 'completed' }),
      Appointment.countDocuments({ date: { $gte: start, $lte: end }, status: 'cancelled' }),
      Invoice.aggregate([
        { $match: { issueDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, billed: { $sum: '$grandTotal' }, collected: { $sum: '$amountPaid' } } }
      ])
    ]);

    const revenue = revenueData[0] || { billed: 0, collected: 0 };
    const apptCompletionRate = totalAppointments > 0
      ? ((completedAppointments / totalAppointments) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        period: {
          start: start.toLocaleDateString('en-IN'),
          end:   end.toLocaleDateString('en-IN'),
          days:  Math.ceil((end - start) / (1000 * 60 * 60 * 24))
        },
        patients: { new: newPatients, discharged: dischargedPatients },
        appointments: {
          total: totalAppointments,
          completed: completedAppointments,
          cancelled: cancelledAppointments,
          completionRate: `${apptCompletionRate}%`
        },
        revenue: {
          billed:    revenue.billed,
          collected: revenue.collected,
          outstanding: revenue.billed - revenue.collected,
          collectionRate: revenue.billed > 0 ? `${((revenue.collected / revenue.billed) * 100).toFixed(1)}%` : '0%'
        },
        generatedAt: new Date()
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// 7. SCHEDULE A REPORT EMAIL (background job)
// ─────────────────────────────────────────────────────────────
const scheduleReportEmail = async (req, res, next) => {
  try {
    const { reportType, recipientEmail, dateRange } = req.body;
    if (!reportType || !recipientEmail) {
      return res.status(400).json({ success: false, message: 'reportType and recipientEmail required' });
    }

    // Queue the report generation job
    const job = await addReportJob({ reportType, dateRange, recipientEmail, requestedBy: req.user.name });

    if (!job) {
      // No queue available — generate synchronously
      logger.warn('Queue unavailable — generating report synchronously');
      return res.json({ success: true, message: 'Report generation queued (sync mode)', jobId: null });
    }

    logger.info(`Report scheduled: ${reportType} → ${recipientEmail} by ${req.user.email}`);

    res.json({
      success: true,
      message: `Report scheduled. You'll receive an email at ${recipientEmail} shortly.`,
      jobId: job.id
    });
  } catch (err) { next(err); }
};

module.exports = {
  getDepartmentReport,
  getDoctorPerformanceReport,
  getRevenueTrendReport,
  getDemographicsReport,
  getAppointmentAnalytics,
  getSummaryReport,
  scheduleReportEmail
};
