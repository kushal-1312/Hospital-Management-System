const mongoose = require('mongoose');

/**
 * UPGRADE 3: Invoice / Bill Model
 *
 * Covers the full billing lifecycle:
 *   draft → sent → partially_paid → paid → cancelled
 *
 * Supports:
 *   - Multiple line items (consultation, procedure, medicine, room, lab)
 *   - GST / tax computation
 *   - Insurance coverage deduction
 *   - Partial payments with running balance
 *   - Auto-incrementing invoice number (INV-00001)
 */

// ── Line Item sub-schema ───────────────────────────────────────
const LineItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['consultation', 'procedure', 'medicine', 'room', 'lab', 'nursing', 'other'],
    default: 'other'
  },
  quantity:    { type: Number, default: 1, min: 0 },
  unitPrice:   { type: Number, required: true, min: 0 },
  discount:    { type: Number, default: 0, min: 0, max: 100 }, // percentage
  taxRate:     { type: Number, default: 18, min: 0 },           // GST %
  // Computed — stored for fast retrieval
  lineTotal:   { type: Number }   // qty * unitPrice * (1-discount/100)
}, { _id: true });

// ── Payment sub-schema ─────────────────────────────────────────
const PaymentSchema = new mongoose.Schema({
  amount:    { type: Number, required: true, min: 0 },
  method:    {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'insurance', 'cheque'],
    required: true
  },
  reference: { type: String, trim: true }, // transaction ID / cheque no
  note:      { type: String, trim: true },
  paidAt:    { type: Date, default: Date.now },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

// ── Insurance sub-schema ───────────────────────────────────────
const InsuranceSchema = new mongoose.Schema({
  provider:    { type: String, trim: true },
  policyNumber:{ type: String, trim: true },
  claimNumber: { type: String, trim: true },
  coverageAmount: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['not_claimed', 'submitted', 'approved', 'rejected', 'partial'],
    default: 'not_claimed'
  },
  notes: { type: String }
}, { _id: false });

// ── Main Invoice Schema ────────────────────────────────────────
const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true },

  // References
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: [true, 'Patient is required']
  },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  // Denormalised for display without joins
  patientName:    { type: String },
  patientId:      { type: String },

  // Line items
  lineItems: [LineItemSchema],

  // Financial summary (all in INR ₹)
  subtotal:      { type: Number, default: 0 },   // sum of lineTotals before tax
  totalDiscount: { type: Number, default: 0 },   // total discount amount
  totalTax:      { type: Number, default: 0 },   // GST amount
  grandTotal:    { type: Number, default: 0 },   // subtotal + tax

  // Insurance
  insurance: InsuranceSchema,
  insuranceCovered: { type: Number, default: 0 }, // amount covered by insurance

  // Payments received
  payments: [PaymentSchema],
  amountPaid:    { type: Number, default: 0 },   // sum of payments
  amountDue:     { type: Number, default: 0 },   // grandTotal - insuranceCovered - amountPaid

  // Status
  status: {
    type: String,
    enum: ['draft', 'sent', 'partially_paid', 'paid', 'cancelled', 'refunded'],
    default: 'draft'
  },

  // Dates
  issueDate:     { type: Date, default: Date.now },
  dueDate:       { type: Date },
  paidDate:      { type: Date },

  // Notes
  notes:         { type: String, trim: true },
  internalNotes: { type: String, trim: true },

  // Audit
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────
InvoiceSchema.index({ patient: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ issueDate: -1 });
InvoiceSchema.index({ status: 1, amountDue: 1 });
InvoiceSchema.index({ 'payments.paidAt': -1 });

// ── Pre-save: auto invoice number ─────────────────────────────
InvoiceSchema.pre('save', async function (next) {
  try {
    if (!this.invoiceNumber) {
      const Sequence = require('./Sequence');
      const latest = await mongoose.model('Invoice')
        .findOne({ invoiceNumber: /^INV-\d+$/ })
        .sort({ invoiceNumber: -1 })
        .select('invoiceNumber')
        .lean();
      const initialValue = latest ? Number(latest.invoiceNumber.slice(4)) : 0;
      const nextValue = await Sequence.next('invoiceNumber', initialValue);
      this.invoiceNumber = `INV-${String(nextValue).padStart(5, '0')}`;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// ── Method: recompute all financial totals ────────────────────
// Call this whenever lineItems, insurance, or payments change.
InvoiceSchema.methods.recalculate = function () {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  this.lineItems.forEach(item => {
    const base = item.quantity * item.unitPrice;
    const discountAmt = base * (item.discount / 100);
    const afterDiscount = base - discountAmt;
    const taxAmt = afterDiscount * (item.taxRate / 100);

    item.lineTotal = Math.round(afterDiscount * 100) / 100;
    subtotal      += afterDiscount;
    totalDiscount += discountAmt;
    totalTax      += taxAmt;
  });

  this.subtotal      = Math.round(subtotal * 100) / 100;
  this.totalDiscount = Math.round(totalDiscount * 100) / 100;
  this.totalTax      = Math.round(totalTax * 100) / 100;
  this.grandTotal    = Math.round((subtotal + totalTax) * 100) / 100;

  this.insuranceCovered = this.insurance?.coverageAmount || 0;
  this.amountPaid   = this.payments.reduce((s, p) => s + p.amount, 0);
  this.amountDue    = Math.max(0, Math.round(
    (this.grandTotal - this.insuranceCovered - this.amountPaid) * 100
  ) / 100);

  // Auto-update status
  if (this.status !== 'cancelled' && this.status !== 'refunded') {
    if (this.amountDue <= 0) {
      this.status = 'paid';
      if (!this.paidDate) this.paidDate = new Date();
    } else if (this.amountPaid > 0) {
      this.status = 'partially_paid';
    }
  }
};

module.exports = mongoose.model('Invoice', InvoiceSchema);
