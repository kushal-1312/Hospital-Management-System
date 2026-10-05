const SupabaseModel = require('./SupabaseModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

class User extends SupabaseModel {
  static tableName = 'users';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.role = this.role || 'staff';
    this.isActive = this.isActive !== undefined ? this.isActive : true;
    this.twoFactorEnabled = Boolean(this.twoFactorEnabled);
    this.twoFactorPending = Boolean(this.twoFactorPending);
    this.twoFactorBackupCodes = Array.isArray(this.twoFactorBackupCodes) ? this.twoFactorBackupCodes : [];
    this.securityLog = Array.isArray(this.securityLog) ? this.securityLog : [];
    this.loginAttempts = Number(this.loginAttempts) || 0;
  }

  get isLocked() {
    return Boolean(this.lockUntil && new Date(this.lockUntil).getTime() > Date.now());
  }

  async _preSave() {
    if (this.email) {
      this.email = this.email.toLowerCase().trim();
    }
    if (this.password && (!this._isExisting || this.isModified('password'))) {
      if (!this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
      }
    }
  }

  async comparePassword(entered) {
    if (!this.password || !entered) return false;
    return bcrypt.compare(entered, this.password);
  }

  async handleFailedLogin() {
    const maxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    const lockDuration = Number(process.env.LOCKOUT_DURATION) || 15;

    this.loginAttempts = (this.loginAttempts || 0) + 1;
    if (this.loginAttempts >= maxAttempts) {
      this.lockUntil = new Date(Date.now() + lockDuration * 60 * 1000).toISOString();
      this.loginAttempts = 0;
    }
    await this.save();
  }

  async clearLoginAttempts() {
    if (this.loginAttempts !== 0 || this.lockUntil) {
      this.loginAttempts = 0;
      this.lockUntil = null;
      await this.save();
    }
  }

  generatePasswordResetToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    this.passwordResetExpires = new Date(
      Date.now() + (Number(process.env.RESET_TOKEN_EXPIRE) || 10) * 60 * 1000
    ).toISOString();
    return rawToken;
  }

  setRefreshToken(rawToken) {
    this.refreshTokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
  }

  verifyRefreshToken(rawToken) {
    if (!this.refreshTokenHash) return false;
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return this.refreshTokenHash === hash;
  }

  async logSecurityEvent(event, ip, userAgent) {
    this.securityLog = Array.isArray(this.securityLog) ? this.securityLog : [];
    this.securityLog.push({ event, ip, userAgent, timestamp: new Date().toISOString() });
    if (this.securityLog.length > 20) {
      this.securityLog = this.securityLog.slice(-20);
    }
    await this.save();
  }

  toSafeObject() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.refreshTokenHash;
    delete obj.passwordResetToken;
    delete obj.passwordResetExpires;
    delete obj.twoFactorSecret;
    delete obj.twoFactorBackupCodes;
    delete obj.securityLog;
    return obj;
  }
}

module.exports = User;
