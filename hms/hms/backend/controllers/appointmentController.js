const Appointment = require('../models/Appointment');
const Patient     = require('../models/Patient');
const User        = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { socketManager } = require('../sockets/socketManager');
const { createAndPush } = require('./notificationController');
const { withCache, cacheDel, cacheInvalidatePattern } = require('../cache/redisClient');
const { CacheKeys, TTL } = require('../cache/cacheKeys');
const logger = require('../utils/logger');

const getAppointments = async (req, res, next) => {
  try {
    const { page=1, limit=10, status, doctor, patient, date, sortBy='date', sortOrder='asc' } = req.query;
    const filter = {};
    if (status)  filter.status  = status;
    if (patient) filter.patient = patient;
    if (req.user.role === 'doctor') filter.doctor = req.user._id;
    else if (doctor) filter.doctor = doctor;
    if (date) {
      const d = new Date(date);
      filter.date = { $gte: new Date(d.setHours(0,0,0,0)), $lte: new Date(d.setHours(23,59,59,999)) };
    }
    const skip = (Number(page)-1)*Number(limit);
    const [appointments, total] = await Promise.all([
      Appointment.find(filter).populate('patient','name patientId contact').populate('doctor','name specialization department')
        .sort({ [sortBy]: sortOrder==='asc'?1:-1 }).skip(skip).limit(Number(limit)),
      Appointment.countDocuments(filter)
    ]);
    res.json({ success:true, data:appointments, pagination:{ total, page:Number(page), limit:Number(limit), pages:Math.ceil(total/Number(limit)) } });
  } catch(err){ next(err); }
};

const getAppointment = async (req, res, next) => {
  try {
    const a = await Appointment.findById(req.params.id)
      .populate('patient','name patientId age gender contact').populate('doctor','name specialization department phone');
    if (!a) return next(new AppError('Appointment not found',404));
    res.json({ success:true, data:a });
  } catch(err){ next(err); }
};

const createAppointment = async (req, res, next) => {
  try {
    const { patient, doctor, date, timeSlot, type, reason, notes } = req.body;
    const [patientDoc, doctorDoc] = await Promise.all([Patient.findById(patient), User.findById(doctor)]);
    if (!patientDoc) return next(new AppError('Patient not found',404));
    if (!doctorDoc || doctorDoc.role!=='doctor') return next(new AppError('Invalid doctor',404));
    const conflict = await Appointment.checkDoubleBooking(doctor, new Date(date), timeSlot.start, timeSlot.end);
    if (conflict) return next(new AppError(`Doctor booked ${conflict.timeSlot.start}-${conflict.timeSlot.end}`,409));
    if (new Date(date) < new Date()) return next(new AppError('Cannot schedule in the past',400));
    const appointment = await Appointment.create({ patient, doctor, patientName:patientDoc.name, doctorName:doctorDoc.name, date:new Date(date), timeSlot, type, reason, notes, createdBy:req.user._id });
    await cacheDel(CacheKeys.APPOINTMENT_SLOTS(doctor, date));
    await cacheInvalidatePattern(CacheKeys.APPOINTMENT_PATTERN);
    await cacheInvalidatePattern(CacheKeys.DASHBOARD_PATTERN);
    socketManager.appointmentScheduled(appointment);
    await createAndPush({ recipientId:doctor, senderId:req.user._id, title:'📅 New Appointment', body:`${patientDoc.name} — ${new Date(date).toLocaleDateString('en-IN')} at ${timeSlot.start}`, type:'appointment', link:'/appointments' });
    const populated = await appointment.populate([{ path:'patient',select:'name patientId' },{ path:'doctor',select:'name specialization' }]);
    res.status(201).json({ success:true, message:'Appointment scheduled', data:populated });
  } catch(err){ next(err); }
};

const updateAppointment = async (req, res, next) => {
  try {
    const a = await Appointment.findById(req.params.id);
    if (!a) return next(new AppError('Appointment not found',404));
    if (req.user.role==='doctor' && a.doctor.toString()!==req.user._id.toString()) return next(new AppError('Access denied',403));
    if (req.body.timeSlot || req.body.date) {
      const newDate = req.body.date ? new Date(req.body.date) : a.date;
      const newSlot = req.body.timeSlot || a.timeSlot;
      const conflict = await Appointment.checkDoubleBooking(a.doctor, newDate, newSlot.start, newSlot.end, a._id);
      if (conflict) return next(new AppError(`Slot ${newSlot.start}-${newSlot.end} already booked`,409));
    }
    const previousStatus = a.status;
    if (req.body.status==='cancelled') req.body.cancelledBy = req.user._id;
    Object.assign(a, req.body);
    await a.save();
    await cacheDel(CacheKeys.APPOINTMENT_SLOTS(a.doctor.toString(), a.date.toISOString().split('T')[0]));
    await cacheInvalidatePattern(CacheKeys.APPOINTMENT_PATTERN);
    await cacheInvalidatePattern(CacheKeys.DASHBOARD_PATTERN);
    if (req.body.status && req.body.status!==previousStatus) {
      socketManager.appointmentStatusChanged(a);
      if (req.body.status==='cancelled') await createAndPush({ recipientId:a.doctor, senderId:req.user._id, title:'❌ Appointment Cancelled', body:`${a.patientName}'s appointment was cancelled`, type:'warning', link:'/appointments' });
      if (req.body.status==='confirmed') await createAndPush({ recipientId:a.doctor, senderId:req.user._id, title:'✅ Appointment Confirmed', body:`${a.patientName}'s appointment is confirmed`, type:'success', link:'/appointments' });
    } else { socketManager.pushDashboardRefresh(); }
    res.json({ success:true, message:'Appointment updated', data:a });
  } catch(err){ next(err); }
};

const deleteAppointment = async (req, res, next) => {
  try {
    const a = await Appointment.findById(req.params.id);
    if (!a) return next(new AppError('Appointment not found',404));
    await a.deleteOne();
    await cacheInvalidatePattern(CacheKeys.APPOINTMENT_PATTERN);
    await cacheInvalidatePattern(CacheKeys.DASHBOARD_PATTERN);
    socketManager.pushDashboardRefresh();
    res.json({ success:true, message:'Appointment deleted' });
  } catch(err){ next(err); }
};

const getAppointmentStats = async (req, res, next) => {
  try {
    const cacheKey = CacheKeys.APPOINTMENT_STATS(req.user._id, req.user.role);
    const data = await withCache(cacheKey, TTL.STATS, async () => {
      const filter = req.user.role==='doctor' ? { doctor:req.user._id } : {};
      const today = new Date();
      const [statusStats, typeStats, todayCount, upcomingCount] = await Promise.all([
        Appointment.aggregate([{ $match:filter },{ $group:{ _id:'$status', count:{ $sum:1 } } }]),
        Appointment.aggregate([{ $match:filter },{ $group:{ _id:'$type',   count:{ $sum:1 } } }]),
        Appointment.countDocuments({ ...filter, date:{ $gte:new Date(today.setHours(0,0,0,0)), $lte:new Date(today.setHours(23,59,59,999)) } }),
        Appointment.countDocuments({ ...filter, date:{ $gt:new Date() }, status:{ $in:['pending','confirmed'] } })
      ]);
      return { statusStats, typeStats, todayCount, upcomingCount };
    });
    res.json({ success:true, data });
  } catch(err){ next(err); }
};

const getAvailableSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) return next(new AppError('doctorId and date required',400));
    const data = await withCache(CacheKeys.APPOINTMENT_SLOTS(doctorId, date), TTL.SLOTS, async () => {
      const d = new Date(date);
      const booked = await Appointment.find({ doctor:doctorId, date:{ $gte:new Date(d.setHours(0,0,0,0)), $lte:new Date(d.setHours(23,59,59,999)) }, status:{ $nin:['cancelled','no-show'] } }).select('timeSlot');
      const allSlots = [];
      for (let h=8; h<18; h++) for (let m=0; m<60; m+=30) {
        const start = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const endH = m===30?h+1:h; const endM = m===30?0:30;
        allSlots.push({ start, end:`${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}` });
      }
      const bookedStarts = booked.map(a=>a.timeSlot.start);
      return { all:allSlots, available:allSlots.filter(s=>!bookedStarts.includes(s.start)), booked:bookedStarts };
    });
    res.json({ success:true, data });
  } catch(err){ next(err); }
};

module.exports = { getAppointments, getAppointment, createAppointment, updateAppointment, deleteAppointment, getAppointmentStats, getAvailableSlots };
