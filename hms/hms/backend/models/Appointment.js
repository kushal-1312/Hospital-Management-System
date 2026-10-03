const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  appointmentId: { type: String, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientName: String, doctorName: String,
  date: { type: Date, required: true },
  timeSlot: { start: { type: String, required: true }, end: { type: String, required: true } },
  duration: { type: Number, default: 30 },
  type: { type: String, enum: ['consultation','follow-up','emergency','routine-checkup','procedure'], default: 'consultation' },
  reason: String, notes: String,
  status: { type: String, enum: ['pending','confirmed','completed','cancelled','no-show'], default: 'pending' },
  diagnosis: String, prescription: String, followUpDate: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String
}, { timestamps: true });

// Keep active appointments unique while allowing a cancelled/no-show slot
// to be booked again. This matches checkDoubleBooking() below.
AppointmentSchema.index(
  { doctor: 1, date: 1, 'timeSlot.start': 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'confirmed', 'completed'] }
    }
  }
);
AppointmentSchema.index({ patient: 1 });
AppointmentSchema.index({ date: 1 });
AppointmentSchema.index({ doctor: 1, date: 1, status: 1 });
AppointmentSchema.index({ status: 1, date: 1 });

AppointmentSchema.pre('save', async function (next) {
  try {
    if (!this.appointmentId) {
      const Sequence = require('./Sequence');
      const latest = await mongoose.model('Appointment')
        .findOne({ appointmentId: /^APT-\d+$/ })
        .sort({ appointmentId: -1 })
        .select('appointmentId')
        .lean();
      const initialValue = latest ? Number(latest.appointmentId.slice(4)) : 0;
      const nextValue = await Sequence.next('appointmentId', initialValue);
      this.appointmentId = `APT-${String(nextValue).padStart(5, '0')}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

AppointmentSchema.statics.checkDoubleBooking = async function (doctorId, date, startTime, endTime, excludeId = null) {
  const d = new Date(date);
  const start = new Date(d.setHours(0,0,0,0));
  const end = new Date(d.setHours(23,59,59,999));
  const query = {
    doctor: doctorId,
    date: { $gte: start, $lte: end },
    status: { $nin: ['cancelled','no-show'] },
    $or: [
      { 'timeSlot.start': { $lte: startTime }, 'timeSlot.end': { $gt: startTime } },
      { 'timeSlot.start': { $lt: endTime }, 'timeSlot.end': { $gte: endTime } },
      { 'timeSlot.start': { $gte: startTime }, 'timeSlot.end': { $lte: endTime } }
    ]
  };
  if (excludeId) query._id = { $ne: excludeId };
  return this.findOne(query);
};

module.exports = mongoose.model('Appointment', AppointmentSchema);
