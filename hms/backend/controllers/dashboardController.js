const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * @desc    Get comprehensive dashboard statistics
 * @route   GET /api/dashboard/stats
 * @access  All authenticated (filtered by role)
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const appointmentFilter = req.user.role === 'doctor' ? { doctor: req.user._id } : {};
    const patientFilter = req.user.role === 'doctor' ? { assignedDoctor: req.user._id } : {};

    const [
      totalPatients,
      activePatients,
      criticalPatients,
      todayAppointments,
      pendingAppointments,
      completedAppointments,
      totalDoctors,
      totalStaff,
      recentPatients,
      upcomingAppointments,
      monthlyPatients,
      monthlyAppointments
    ] = await Promise.all([
      Patient.countDocuments(patientFilter),
      Patient.countDocuments({ ...patientFilter, status: 'active' }),
      Patient.countDocuments({ ...patientFilter, status: 'critical' }),
      Appointment.countDocuments({
        ...appointmentFilter,
        date: { $gte: startOfToday, $lte: endOfToday }
      }),
      Appointment.countDocuments({ ...appointmentFilter, status: 'pending' }),
      Appointment.countDocuments({ ...appointmentFilter, status: 'completed' }),
      User.countDocuments({ role: 'doctor', isActive: true }),
      User.countDocuments({ role: { $in: ['nurse', 'staff'] }, isActive: true }),
      // Recently added patients
      Patient.find(patientFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name patientId status gender createdAt assignedDoctor')
        .populate('assignedDoctor', 'name'),
      // Next upcoming appointments today
      Appointment.find({
        ...appointmentFilter,
        date: { $gte: startOfToday, $lte: endOfToday },
        status: { $in: ['pending', 'confirmed'] }
      })
        .sort({ 'timeSlot.start': 1 })
        .limit(5)
        .populate('patient', 'name patientId')
        .populate('doctor', 'name specialization'),
      // Monthly patient trend (last 6 months)
      Patient.aggregate([
        {
          $match: {
            ...patientFilter,
            admissionDate: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$admissionDate' },
              month: { $month: '$admissionDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      // Monthly appointment trend
      Appointment.aggregate([
        {
          $match: {
            ...appointmentFilter,
            date: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        counts: {
          totalPatients,
          activePatients,
          criticalPatients,
          todayAppointments,
          pendingAppointments,
          completedAppointments,
          totalDoctors,
          totalStaff
        },
        recentPatients,
        upcomingAppointments,
        charts: {
          monthlyPatients,
          monthlyAppointments
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardStats };
