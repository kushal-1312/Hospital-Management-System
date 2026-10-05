const SupabaseModel = require('./SupabaseModel');
const crypto = require('crypto');

class AuditEvent extends SupabaseModel {
  static tableName = 'audit_events';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.occurredAt = this.occurredAt || new Date().toISOString();
  }

  static async createSigned(event) {
    event.occurredAt = event.occurredAt || new Date().toISOString();
    const canonical = JSON.stringify({
      requestId: event.requestId,
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId,
      outcome: event.outcome,
      statusCode: event.statusCode,
      occurredAt: event.occurredAt
    });
    const key = process.env.AUDIT_HMAC_KEY || process.env.JWT_SECRET || 'audit-secret-key-minimum-32-chars';
    event.integrity = crypto.createHmac('sha256', key).update(canonical).digest('hex');
    return await this.create(event);
  }
}

module.exports = AuditEvent;
