const SupabaseModel = require('./SupabaseModel');

class Notification extends SupabaseModel {
  static tableName = 'notifications';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.type = this.type || 'info';
    this.read = Boolean(this.read);
    this.expiresAt = this.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
}

module.exports = Notification;
