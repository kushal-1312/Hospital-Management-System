const mongoose = require('mongoose');

/**
 * UPGRADE 2: Persistent Notification Model
 *
 * Used as a fallback/history store for in-app notifications.
 * The in-memory store in socketManager handles active sessions;
 * this handles history and offline delivery.
 */
const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Who triggered this (optional)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  body: {
    type: String,
    required: true,
    maxlength: 500
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'critical', 'appointment', 'patient', 'staff', 'system'],
    default: 'info'
  },
  // Deep link for click-through navigation
  link: {
    type: String
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  // Auto-delete old notifications after 30 days
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    index: { expireAfterSeconds: 0 } // MongoDB TTL index
  }
}, { timestamps: true });

// Compound index for fast unread count queries
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
