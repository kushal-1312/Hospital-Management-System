const mongoose = require('mongoose');

/**
 * UPGRADE 4: Medicine / Drug Inventory Model
 *
 * Tracks every medicine in the pharmacy with:
 *   - Stock quantity and unit
 *   - Reorder threshold and automatic low-stock detection
 *   - Expiry date tracking per batch
 *   - Supplier linkage
 *   - Full stock movement history (audit trail)
 */

// ── Batch sub-schema ───────────────────────────────────────────
// Each delivery/purchase adds a batch so expiry dates are tracked
// per batch rather than globally.
const BatchSchema = new mongoose.Schema({
  batchNumber:   { type: String, required: true },
  quantity:      { type: Number, required: true, min: 0 },
  costPrice:     { type: Number, min: 0 },        // per unit
  sellingPrice:  { type: Number, min: 0 },        // per unit
  manufacturedDate: { type: Date },
  expiryDate:    { type: Date, required: true },
  supplier:      { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName:  { type: String },
  receivedAt:    { type: Date, default: Date.now },
  receivedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

// ── Stock movement sub-schema ──────────────────────────────────
// Append-only log: every stock in/out is recorded here.
const MovementSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['in', 'out', 'adjustment', 'expired', 'returned'],
    required: true
  },
  quantity:    { type: Number, required: true },   // always positive
  reason:      { type: String },                    // dispensed / purchase / expired / damaged
  reference:   { type: String },                    // prescription ID, PO number, etc.
  patient:     { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  patientName: { type: String },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String },
  balanceAfter:{ type: Number },                    // stock level after this movement
  timestamp:   { type: Date, default: Date.now }
}, { _id: true });

// ── Main Medicine Schema ───────────────────────────────────────
const MedicineSchema = new mongoose.Schema({
  // Identity
  name:          { type: String, required: true, trim: true },
  genericName:   { type: String, trim: true },
  brand:         { type: String, trim: true },
  category: {
    type: String,
    enum: ['tablet','capsule','syrup','injection','cream','drops','inhaler','patch','powder','other'],
    default: 'tablet'
  },
  // Medicine code for barcode/lookup
  code:          { type: String, unique: true, sparse: true },

  // Dosage & packaging
  strength:      { type: String, trim: true }, // e.g. "500mg", "10mg/5ml"
  unit:          { type: String, default: 'tablet', trim: true }, // tablet, ml, mg, pcs
  packSize:      { type: Number, default: 1 },  // tablets per strip/bottle

  // Stock
  currentStock:  { type: Number, default: 0, min: 0 },
  reorderLevel:  { type: Number, default: 10 }, // alert when stock falls below this
  maxStock:      { type: Number, default: 1000 },// max shelf capacity
  location:      { type: String, trim: true },  // shelf/rack location, e.g. "A-3"

  // Pricing
  costPrice:     { type: Number, min: 0, default: 0 },    // buying price
  sellingPrice:  { type: Number, min: 0, default: 0 },    // dispensing price

  // Regulatory
  requiresPrescription: { type: Boolean, default: false },
  schedule:      { type: String, enum: ['OTC','H','H1','X',''] , default: '' }, // drug schedule
  hsn:           { type: String, trim: true },  // HSN code for GST
  gstRate:       { type: Number, default: 12 }, // GST percentage

  // Status
  isActive:      { type: Boolean, default: true },
  isDiscontinued:{ type: Boolean, default: false },

  // Descriptions
  description:   { type: String },
  sideEffects:   { type: String },
  contraindications: { type: String },
  storageInstructions: { type: String, default: 'Store in a cool, dry place below 25°C' },

  // Batches (current inventory with expiry)
  batches:       [BatchSchema],

  // Movement history (last 200 kept)
  movements:     [MovementSchema],

  // Audit
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true, toJSON: { virtuals: true } });

// ── Indexes ───────────────────────────────────────────────────
MedicineSchema.index({ name: 'text', genericName: 'text', brand: 'text' });
MedicineSchema.index({ currentStock: 1 });
MedicineSchema.index({ isActive: 1 });
MedicineSchema.index({ isActive: 1, currentStock: 1, reorderLevel: 1 });
MedicineSchema.index({ 'batches.expiryDate': 1, 'batches.quantity': 1 });

// ── Virtual: is stock low? ────────────────────────────────────
MedicineSchema.virtual('isLowStock').get(function () {
  return this.currentStock <= this.reorderLevel && this.currentStock > 0;
});

// ── Virtual: is stock out? ────────────────────────────────────
MedicineSchema.virtual('isOutOfStock').get(function () {
  return this.currentStock === 0;
});

// ── Virtual: nearest expiry date across all batches ───────────
MedicineSchema.virtual('nearestExpiry').get(function () {
  if (!this.batches?.length) return null;
  const valid = this.batches.filter(b => b.quantity > 0 && b.expiryDate);
  if (!valid.length) return null;
  return valid.reduce((min, b) =>
    b.expiryDate < min ? b.expiryDate : min, valid[0].expiryDate
  );
});

// ── Virtual: is any batch expiring within 30 days? ────────────
MedicineSchema.virtual('isExpiringSoon').get(function () {
  const threshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return this.batches?.some(b => b.quantity > 0 && b.expiryDate && b.expiryDate <= threshold);
});

// ── Method: add stock (purchase / return) ─────────────────────
MedicineSchema.methods.addStock = function (qty, reason, performedBy, performedByName, reference) {
  this.currentStock += qty;
  this.movements.push({
    type: 'in', quantity: qty, reason, reference,
    performedBy, performedByName, balanceAfter: this.currentStock
  });
  // Keep movements capped at 200
  if (this.movements.length > 200) this.movements = this.movements.slice(-200);
};

// ── Method: deduct stock (dispense) ──────────────────────────
MedicineSchema.methods.deductStock = function (qty, reason, performedBy, performedByName, patient, patientName, reference) {
  if (qty > this.currentStock) {
    throw new Error(`Insufficient stock. Available: ${this.currentStock}, Requested: ${qty}`);
  }
  this.currentStock -= qty;
  this.movements.push({
    type: 'out', quantity: qty, reason: reason || 'dispensed',
    reference, patient, patientName,
    performedBy, performedByName, balanceAfter: this.currentStock
  });
  if (this.movements.length > 200) this.movements = this.movements.slice(-200);
};

module.exports = mongoose.model('Medicine', MedicineSchema);
