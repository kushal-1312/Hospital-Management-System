const mongoose = require('mongoose');

const MedicalHistorySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  diagnosis: { type: String, required: true },
  treatment: String, prescription: String, notes: String,
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  doctorName: String
}, { _id: true });

const PatientSchema = new mongoose.Schema({
  patientId: { type: String, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  age: { type: Number, required: true, min: 0, max: 150 },
  gender: { type: String, required: true, enum: ['male', 'female', 'other'] },
  bloodGroup: { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-',''] },
  contact: {
    phone: String, email: String,
    emergencyContact: String, emergencyPhone: String
  },
  address: { street: String, city: String, state: String, zipCode: String, country: { type: String, default: 'India' } },
  currentDiagnosis: String,
  currentPrescriptions: [{ medicine: String, dosage: String, frequency: String, startDate: Date, endDate: Date }],
  allergies: [String],
  medicalHistory: [MedicalHistorySchema],
  files: [{ filename: String, originalName: String, mimetype: String, size: Number, uploadedAt: { type: Date, default: Date.now } }],
  assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active','discharged','critical','stable','under-observation'], default: 'active' },
  admissionDate: { type: Date, default: Date.now },
  dischargeDate: Date,
  ward: String, bedNumber: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  auditLog: [{ action: String, performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, performedByName: String, timestamp: { type: Date, default: Date.now }, changes: Object }]
}, { timestamps: true });

PatientSchema.index({ name: 'text' });
PatientSchema.index({ status: 1 });
PatientSchema.index({ assignedDoctor: 1 });
PatientSchema.index({ assignedDoctor: 1, status: 1, createdAt: -1 });
PatientSchema.index({ status: 1, dischargeDate: -1 });

PatientSchema.pre('save', async function (next) {
  try {
    if (!this.patientId) {
      const Sequence = require('./Sequence');
      const latest = await mongoose.model('Patient')
        .findOne({ patientId: /^PAT-\d+$/ })
        .sort({ patientId: -1 })
        .select('patientId')
        .lean();
      const initialValue = latest ? Number(latest.patientId.slice(4)) : 0;
      const nextValue = await Sequence.next('patientId', initialValue);
      this.patientId = `PAT-${String(nextValue).padStart(5, '0')}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Patient', PatientSchema);
