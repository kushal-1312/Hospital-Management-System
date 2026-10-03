const crypto = require('crypto');
const mongoose = require('mongoose');

const AuditEventSchema = new mongoose.Schema({
  occurredAt: { type: Date, default: Date.now, immutable: true },
  requestId: { type: String, required: true, immutable: true },
  actor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true },
    name: { type: String, immutable: true },
    email: { type: String, immutable: true },
    role: { type: String, immutable: true }
  },
  action: { type: String, required: true, immutable: true },
  resource: { type: String, required: true, immutable: true },
  resourceId: { type: String, immutable: true },
  outcome: { type: String, enum: ['success', 'rejected'], required: true, immutable: true },
  statusCode: { type: Number, required: true, immutable: true },
  durationMs: { type: Number, immutable: true },
  source: {
    ip: { type: String, immutable: true },
    userAgent: { type: String, immutable: true }
  },
  integrity: { type: String, required: true, immutable: true }
}, {
  versionKey: false,
  collection: 'audit_events'
});

AuditEventSchema.index({ occurredAt: -1 });
AuditEventSchema.index({ 'actor.id': 1, occurredAt: -1 });
AuditEventSchema.index({ resource: 1, resourceId: 1, occurredAt: -1 });
AuditEventSchema.index({ requestId: 1 });

AuditEventSchema.statics.createSigned = function createSigned(event) {
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
  const key = process.env.AUDIT_HMAC_KEY || process.env.JWT_SECRET;
  event.integrity = crypto.createHmac('sha256', key).update(canonical).digest('hex');
  return this.create(event);
};

module.exports = mongoose.model('AuditEvent', AuditEventSchema);
