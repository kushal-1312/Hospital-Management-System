const mongoose = require('mongoose');

/**
 * UPGRADE 4: Supplier / Vendor Model
 *
 * Tracks pharmaceutical suppliers with:
 *   - Contact and GST details
 *   - Purchase order history summary
 *   - Rating / reliability score
 */
const SupplierSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  code:          { type: String, unique: true, sparse: true },
  contactPerson: { type: String, trim: true },
  phone:         { type: String, trim: true },
  email:         { type: String, trim: true, lowercase: true },
  address: {
    street: String, city: String, state: String, zipCode: String
  },
  gstNumber:     { type: String, trim: true },
  licenseNumber: { type: String, trim: true }, // drug license number
  isActive:      { type: Boolean, default: true },
  notes:         { type: String },
  // Summary counters (updated on each PO)
  totalOrders:   { type: Number, default: 0 },
  totalValue:    { type: Number, default: 0 },
  lastOrderDate: { type: Date },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

SupplierSchema.index({ name: 'text' });

module.exports = mongoose.model('Supplier', SupplierSchema);
