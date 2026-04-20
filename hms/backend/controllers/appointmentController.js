const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * @desc    Get appointments with filters
 * @route   GET /api/appointments
 * @access  All authenticated
 */
const getAppointments = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 10,
      status, doctor, patient,
      date, startDate, endDate,
      sortBy = 'date', sortOrder = 'asc'
    } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (patient) filter.patient = patient;

    // Doctors only see their appointments
    if (req.user.role === 'doctor') {
      filter.doctor = req.user._id;
    } else if (doctor) {
      filter.doctor = doctor;
    }

    // Date filtering
    if (date) {
      const d = new Date(date);
      filter.date = {
        $gte: new Date(d.setHours(0, 0, 0, 0)),
        $lte: new Date(d.setHours(23, 59, 59, 999))
      };
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .populate('patient', 'name patientId contact')
        .populate('doctor', 'name specialization department')
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(Number(limit)),
      Appointment.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: appointments,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single appointment
 * @route   GET /api/appointments/:id
 */
const getAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patient', 'name patientId age gender contact')
      .populate('doctor', 'name specialization department phone')
      .populate('createdBy', 'name role');

    if (!appointment) {
      return next(new AppError('Appointment not found', 404));
    }

    res.json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create appointment with double-booking prevention
 * @route   POST /api/appointments
 * @access  Admin, Staff, Doctor
 */
const createAppointment = async (req, res, next) => {
  try {
    const { patient, doctor, date, timeSlot, type, reason, notes } = req.body;

    // Verify patient exists
    const patientDoc = await Patient.findById(patient);
    if (!patientDoc) {
      return next(new AppError('Patient not found', 404));
    }

    // Verify doctor exists and has doctor role
    const doctorDoc = await User.findById(doctor);
    if (!doctorDoc || doctorDoc.role !== 'doctor') {
      return next(new AppError('Invalid doctor', 404));
    }

    // Check for double-booking
    const conflict = await Appointment.checkDoubleBooking(
      doctor, new Date(date), timeSlot.start, timeSlot.end
    );

    if (conflict) {
      return next(new AppError(
        `Doctor is already booked from ${conflict.timeSlot.start} to ${conflict.timeSlot.end}`,
        409
      ));
    }

    // Check that appointment is in the future
    const appointmentDateTime = new Date(date);
    if (appointmentDateTime < new Date()) {
      return next(new AppError('Cannot schedule appointments in the past', 400));
    }

    const appointment = await Appointment.create({
      patient,
      doctor,
      patientName: patientDoc.name,
      doctorName: doctorDoc.name,
      date: new Date(date),
      timeSlot,
      type,
      reason,
      notes,
      createdBy: req.user._id
    });

    logger.info(`Appointment ${appointment.appointmentId} created by ${req.user.email}`);

    const populated = await appointment.populate([
      { path: 'patient', select: 'name patientId' },
      { path: 'doctor', select: 'name specialization' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Appointment scheduled successfully',
      data: populated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update appointment
 * @route   PUT /api/appointments/:id
 */
const updateAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return next(new AppError('Appointment not found', 404));
    }

    // Only owning doctor or admin can update
    if (req.user.role === 'doctor' &&
        appointment.doctor.toString() !== req.user._id.toString()) {
      return next(new AppError('Access denied', 403));
    }

    // If rescheduling, check for conflicts
    if (req.body.timeSlot || req.body.date) {
      const newDate = req.body.date ? new Date(req.body.date) : appointment.date;
      const newSlot = req.body.timeSlot || appointment.timeSlot;

      const conflict = await Appointment.checkDoubleBooking(
        appointment.doctor,
        newDate,
        newSlot.start,
        newSlot.end,
        appointment._id
      );

      if (conflict) {
        return next(new AppError(
          `Time slot ${newSlot.start}-${newSlot.end} is already booked`,
          409
        ));
      }
    }

    // Handle cancellation
    if (req.body.status === 'cancelled') {
      req.body.cancelledBy = req.user._id;
    }

    Object.assign(appointment, req.body);
    await appointment.save();

    logger.info(`Appointment ${appointment.appointmentId} updated by ${req.user.email}`);

    res.json({ success: true, message: 'Appointment updated', data: appointment });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete appointment (admin only)
 * @route   DELETE /api/appointments/:id
 */
const deleteAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return next(new AppError('Appointment not found', 404));
    }

    await appointment.deleteOne();

    res.json({ success: true, message: 'Appointment deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get appointment statistics
 * @route   GET /api/appointments/stats
 */
const getAppointmentStats = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'doctor') filter.doctor = req.user._id;

    const [statusStats, typeStats, weeklyStats, todayCount, upcomingCount] = await Promise.all([
      Appointment.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Appointment.aggregate([
        { $match: filter },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      // Weekly appointments (last 4 weeks)
      Appointment.aggregate([
        {
          $match: {
            ...filter,
            date: { $gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $week: '$date' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Today's appointments
      Appointment.countDocuments({
        ...filter,
        date: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999))
        }
      }),
      // Upcoming (future, non-cancelled)
      Appointment.countDocuments({
        ...filter,
        date: { $gt: new Date() },
        status: { $in: ['pending', 'confirmed'] }
      })
    ]);

    res.json({
      success: true,
      data: { statusStats, typeStats, weeklyStats, todayCount, upcomingCount }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get available time slots for a doctor on a date
 * @route   GET /api/appointments/slots
 */
const getAvailableSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return next(new AppError('Doctor ID and date are required', 400));
    }

    const d = new Date(date);
    const booked = await Appointment.find({
      doctor: doctorId,
      date: {
        $gte: new Date(d.setHours(0, 0, 0, 0)),
        $lte: new Date(d.setHours(23, 59, 59, 999))
      },
      status: { $nin: ['cancelled', 'no-show'] }
    }).select('timeSlot');

    // Generate all 30-minute slots from 08:00 to 18:00
    const allSlots = [];
    for (let h = 8; h < 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const endH = m === 30 ? h + 1 : h;
        const endM = m === 30 ? 0 : 30;
        const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        allSlots.push({ start, end });
      }
    }

    const bookedStarts = booked.map(a => a.timeSlot.start);
    const available = allSlots.filter(s => !bookedStarts.includes(s.start));

    res.json({ success: true, data: { all: allSlots, available, booked: bookedStarts } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getAppointmentStats,
  getAvailableSlots
};
