const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'doctor', 'nurse', 'staff'],
    default: 'staff'
  },
  department: { type: String, trim: true },
  phone: { type: String, trim: true },
  specialization: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  avatar: { type: String, default: null },
  lastLogin: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ── UPGRADE 1A: Hashed refresh token ──────────────────────
  // Store SHA-256 hash instead of plaintext for security.
  // Even if DB is compromised, raw tokens can't be extracted.
  refreshTokenHash: {
    type: String,
    select: false
  },

  // ── UPGRADE 1B: Account lockout after failed logins ────────
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },

  // ── UPGRADE 1C: Password reset via email ───────────────────
  // Token is stored as a SHA-256 hash — only the raw token is
  // emailed to the user. This prevents DB leaks from being used.
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },

  // ── UPGRADE 1D: Two-factor authentication (TOTP) ───────────
  // TOTP secret is AES-encrypted before storage.
  twoFactorSecret: {
    type: String,
    select: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  // Backup codes for 2FA recovery (stored as bcrypt hashes)
  twoFactorBackupCodes: {
    type: [String],
    select: false
  },
  // True during setup — user must verify before 2FA is enabled
  twoFactorPending: {
    type: Boolean,
    default: false
  },

  // ── UPGRADE 1E: Security audit log ─────────────────────────
  securityLog: [{
    event: { type: String },         // 'login', 'failed_login', 'password_reset', '2fa_enabled'
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now }
  }]

}, { timestamps: true, toJSON: { virtuals: true } });

// ── Indexes ──────────────────────────────────────────────────
UserSchema.index({ role: 1 });
UserSchema.index({ lockUntil: 1 }, { sparse: true }); // TTL-friendly

// ── Virtual: is the account currently locked? ─────────────────
UserSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ── Pre-save: hash password ───────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Method: compare password ──────────────────────────────────
UserSchema.methods.comparePassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// ── Method: handle failed login attempt ──────────────────────
// Increments counter; locks account after MAX_LOGIN_ATTEMPTS.
UserSchema.methods.handleFailedLogin = async function () {
  const maxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS) || 5;
  const lockDuration = Number(process.env.LOCKOUT_DURATION) || 15;

  this.loginAttempts += 1;

  if (this.loginAttempts >= maxAttempts) {
    // Lock account for LOCKOUT_DURATION minutes
    this.lockUntil = new Date(Date.now() + lockDuration * 60 * 1000);
    this.loginAttempts = 0; // reset counter after locking
  }

  await this.save({ validateBeforeSave: false });
};

// ── Method: clear lockout on successful login ─────────────────
UserSchema.methods.clearLoginAttempts = async function () {
  if (this.loginAttempts !== 0 || this.lockUntil) {
    this.loginAttempts = 0;
    this.lockUntil = null;
    await this.save({ validateBeforeSave: false });
  }
};

// ── Method: generate password reset token ─────────────────────
// Returns the raw token (to be emailed). Stores only the hash.
UserSchema.methods.generatePasswordResetToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  // Store SHA-256 hash in DB, not the raw token
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');
  this.passwordResetExpires = new Date(
    Date.now() + (Number(process.env.RESET_TOKEN_EXPIRE) || 10) * 60 * 1000
  );
  return rawToken; // returned so it can be emailed
};

// ── Method: set hashed refresh token ─────────────────────────
UserSchema.methods.setRefreshToken = function (rawToken) {
  this.refreshTokenHash = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');
};

// ── Method: verify refresh token ─────────────────────────────
UserSchema.methods.verifyRefreshToken = function (rawToken) {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return this.refreshTokenHash === hash;
};

// ── Method: add security event to log ────────────────────────
UserSchema.methods.logSecurityEvent = async function (event, ip, userAgent) {
  // Keep only last 20 events to cap document size
  this.securityLog.push({ event, ip, userAgent });
  if (this.securityLog.length > 20) {
    this.securityLog = this.securityLog.slice(-20);
  }
  await this.save({ validateBeforeSave: false });
};

// ── Method: safe object for API responses ─────────────────────
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokenHash;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.twoFactorSecret;
  delete obj.twoFactorBackupCodes;
  delete obj.securityLog;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
