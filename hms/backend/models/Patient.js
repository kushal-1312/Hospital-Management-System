const mongoose = require('mongoose');

// Sub-schema for medical history entries
const MedicalHistorySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  diagnosis: { type: String, required: true },
  treatment: { type: String },
  prescription: { type: String },
  notes: { type: String },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  doctorName: { type: String } // Denormalized for quick access
}, { _id: true });

// Sub-schema for uploaded files
const FileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String },
  mimetype: { type: String },
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const PatientSchema = new mongoose.Schema({
  // Patient ID - auto-generated readable ID
  patientId: {
    type: String,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [0, 'Age cannot be negative'],
    max: [150, 'Age seems invalid']
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['male', 'female', 'other']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '']
  },
  // Contact information
  contact: {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    emergencyContact: { type: String, trim: true },
    emergencyPhone: { type: String, trim: true }
  },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' }
  },
  // Current medical status
  currentDiagnosis: {
    type: String,
    trim: true
  },
  currentPrescriptions: [{
    medicine: { type: String },
    dosage: { type: String },
    frequency: { type: String },
    startDate: { type: Date },
    endDate: { type: Date }
  }],
  allergies: [{ type: String, trim: true }],
  // Historical records
  medicalHistory: [MedicalHistorySchema],
  // Uploaded documents
  files: [FileSchema],
  // Assigned doctor
  assignedDoctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Status
  status: {
    type: String,
    enum: ['active', 'discharged', 'critical', 'stable', 'under-observation'],
    default: 'active'
  },
  admissionDate: {
    type: Date,
    default: Date.now
  },
  dischargeDate: {
    type: Date
  },
  ward: {
    type: String,
    trim: true
  },
  bedNumber: {
    type: String,
    trim: true
  },
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Audit log for compliance
  auditLog: [{
    action: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
    timestamp: { type: Date, default: Date.now },
    changes: { type: Object }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
PatientSchema.index({ patientId: 1 });
PatientSchema.index({ name: 'text' }); // Full-text search
PatientSchema.index({ status: 1 });
PatientSchema.index({ assignedDoctor: 1 });
PatientSchema.index({ createdAt: -1 });

// Auto-generate readable patient ID before saving
PatientSchema.pre('save', async function(next) {
  if (!this.patientId) {
    const count = await mongoose.model('Patient').countDocuments();
    this.patientId = `PAT-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Patient', PatientSchema);
