const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  appointmentId: {
    type: String,
    unique: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: [true, 'Patient is required']
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Doctor is required']
  },
  // Denormalized for quick display without joins
  patientName: { type: String },
  doctorName: { type: String },
  // Scheduling
  date: {
    type: Date,
    required: [true, 'Appointment date is required']
  },
  timeSlot: {
    start: { type: String, required: true }, // e.g. "09:00"
    end: { type: String, required: true }    // e.g. "09:30"
  },
  duration: {
    type: Number,
    default: 30 // minutes
  },
  // Appointment details
  type: {
    type: String,
    enum: ['consultation', 'follow-up', 'emergency', 'routine-checkup', 'procedure'],
    default: 'consultation'
  },
  reason: {
    type: String,
    trim: true,
    maxlength: [500, 'Reason cannot exceed 500 characters']
  },
  notes: {
    type: String,
    trim: true
  },
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'],
    default: 'pending'
  },
  // Doctor's notes after appointment
  diagnosis: { type: String },
  prescription: { type: String },
  followUpDate: { type: Date },
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: { type: String }
}, {
  timestamps: true
});

// Compound index to prevent double-booking
AppointmentSchema.index(
  { doctor: 1, date: 1, 'timeSlot.start': 1 },
  { unique: true, sparse: true }
);

AppointmentSchema.index({ patient: 1 });
AppointmentSchema.index({ date: 1 });
AppointmentSchema.index({ status: 1 });

// Auto-generate appointment ID
AppointmentSchema.pre('save', async function(next) {
  if (!this.appointmentId) {
    const count = await mongoose.model('Appointment').countDocuments();
    this.appointmentId = `APT-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

/**
 * Static method to check for double-booking
 * @param {ObjectId} doctorId
 * @param {Date} date
 * @param {string} startTime
 * @param {string} endTime
 * @param {ObjectId} excludeId - exclude current appointment when updating
 */
AppointmentSchema.statics.checkDoubleBooking = async function(doctorId, date, startTime, endTime, excludeId = null) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    doctor: doctorId,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $nin: ['cancelled', 'no-show'] },
    $or: [
      // New appointment starts during existing
      { 'timeSlot.start': { $lte: startTime }, 'timeSlot.end': { $gt: startTime } },
      // New appointment ends during existing
      { 'timeSlot.start': { $lt: endTime }, 'timeSlot.end': { $gte: endTime } },
      // New appointment contains existing
      { 'timeSlot.start': { $gte: startTime }, 'timeSlot.end': { $lte: endTime } }
    ]
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const conflict = await this.findOne(query);
  return conflict;
};

module.exports = mongoose.model('Appointment', AppointmentSchema);
