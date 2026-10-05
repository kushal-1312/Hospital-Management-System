const SupabaseModel = require('./SupabaseModel');

class Dispensing extends SupabaseModel {
  static tableName = 'dispensings';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.items = Array.isArray(this.items) ? this.items : [];
    this.subtotal = Number(this.subtotal) || 0;
    this.discount = Number(this.discount) || 0;
    this.totalAmount = Number(this.totalAmount) || 0;
    this.paymentMethod = this.paymentMethod || 'cash';
    this.status = this.status || 'dispensed';
    this.dispensedAt = this.dispensedAt || new Date().toISOString();
  }

  async _preSave() {
    if (!this.dispensingId) {
      const count = await this.constructor.countDocuments();
      this.dispensingId = `RX-${String(count + 1).padStart(5, '0')}`;
    }
  }
}

module.exports = Dispensing;
