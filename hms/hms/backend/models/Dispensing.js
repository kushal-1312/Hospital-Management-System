const mongoose = require('mongoose');

/**
 * UPGRADE 4: Dispensing Record
 *
 * Created by pharmacy staff when medicines from a doctor's
 * prescription are physically handed out to a patient.
 * Each record links patient → prescription → medicines dispensed.
 */
const DispensedItemSchema = new mongoose.Schema({
  medicine:     { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: { type: String },
  quantity:     { type: Number, required: true, min: 1 },
  unitPrice:    { type: Number, min: 0 },
  totalPrice:   { type: Number, min: 0 },
  batchNumber:  { type: String },
  expiryDate:   { type: Date },
  instructions: { type: String }  // dosage instruction for this dispense
}, { _id: true });

const DispensingSchema = new mongoose.Schema({
  dispensingId: { type: String, unique: true },

  patient:      { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  patientName:  { type: String },

  // Optional link to appointment or doctor's note
  appointment:  { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  prescribedByName: { type: String },

  // Items dispensed
  items:        [DispensedItemSchema],

  // Totals
  subtotal:     { type: Number, default: 0 },
  discount:     { type: Number, default: 0 },
  totalAmount:  { type: Number, default: 0 },

  // Payment
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'insurance', 'bill_to_invoice'],
    default: 'cash'
  },
  // Link to billing invoice if charged to patient's bill
  invoice:      { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

  notes:        { type: String },
  status: {
    type: String,
    enum: ['pending', 'dispensed', 'partially_dispensed', 'cancelled'],
    default: 'dispensed'
  },

  dispensedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispensedAt:  { type: Date, default: Date.now }
}, { timestamps: true });

DispensingSchema.index({ patient: 1 });
DispensingSchema.index({ dispensedAt: -1 });

DispensingSchema.pre('save', async function (next) {
  if (!this.dispensingId) {
    const count = await mongoose.model('Dispensing').countDocuments();
    this.dispensingId = `RX-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Dispensing', DispensingSchema);
