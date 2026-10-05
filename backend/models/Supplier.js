const SupabaseModel = require('./SupabaseModel');

class Supplier extends SupabaseModel {
  static tableName = 'suppliers';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.isActive = this.isActive !== undefined ? this.isActive : true;
    this.totalOrders = Number(this.totalOrders) || 0;
    this.totalValue = Number(this.totalValue) || 0;
    this.address = this.address || {};
  }
}

module.exports = Supplier;
