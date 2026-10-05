const SupabaseModel = require('./SupabaseModel');

class Medicine extends SupabaseModel {
  static tableName = 'medicines';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.category = this.category || 'tablet';
    this.unit = this.unit || 'tablet';
    this.packSize = Number(this.packSize) || 1;
    this.currentStock = Number(this.currentStock) || 0;
    this.reorderLevel = Number(this.reorderLevel) || 10;
    this.maxStock = Number(this.maxStock) || 1000;
    this.costPrice = Number(this.costPrice) || 0;
    this.sellingPrice = Number(this.sellingPrice) || 0;
    this.gstRate = Number(this.gstRate) || 12;
    this.isActive = this.isActive !== undefined ? this.isActive : true;
    this.isDiscontinued = Boolean(this.isDiscontinued);
    this.batches = Array.isArray(this.batches) ? this.batches : [];
    this.movements = Array.isArray(this.movements) ? this.movements : [];
  }

  get isLowStock() {
    return this.currentStock <= this.reorderLevel && this.currentStock > 0;
  }

  get isOutOfStock() {
    return this.currentStock === 0;
  }

  get nearestExpiry() {
    if (!this.batches?.length) return null;
    const valid = this.batches.filter(b => b.quantity > 0 && b.expiryDate);
    if (!valid.length) return null;
    return valid.reduce((min, b) => (new Date(b.expiryDate) < new Date(min) ? b.expiryDate : min), valid[0].expiryDate);
  }

  get isExpiringSoon() {
    const threshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return this.batches?.some(b => b.quantity > 0 && b.expiryDate && new Date(b.expiryDate) <= threshold);
  }

  addStock(qty, reason, performedBy, performedByName, reference) {
    this.currentStock += qty;
    this.movements.push({
      type: 'in', quantity: qty, reason, reference,
      performedBy, performedByName, balanceAfter: this.currentStock,
      timestamp: new Date().toISOString()
    });
    if (this.movements.length > 200) this.movements = this.movements.slice(-200);
  }

  deductStock(qty, reason, performedBy, performedByName, patient, patientName, reference) {
    if (qty > this.currentStock) {
      throw new Error(`Insufficient stock. Available: ${this.currentStock}, Requested: ${qty}`);
    }
    this.currentStock -= qty;
    this.movements.push({
      type: 'out', quantity: qty, reason: reason || 'dispensed',
      reference, patient, patientName,
      performedBy, performedByName, balanceAfter: this.currentStock,
      timestamp: new Date().toISOString()
    });
    if (this.movements.length > 200) this.movements = this.movements.slice(-200);
  }
}

module.exports = Medicine;
