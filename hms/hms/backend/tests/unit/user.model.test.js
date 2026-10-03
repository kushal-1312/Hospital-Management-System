/**
 * Unit tests: User Model
 *
 * Tests the User model's security methods in isolation —
 * no HTTP layer involved, just direct model operations.
 *
 * Coverage:
 *  ✓ Password hashing on save
 *  ✓ comparePassword method
 *  ✓ Account lockout after failed attempts
 *  ✓ Lock release on successful login
 *  ✓ isLocked virtual
 *  ✓ Password reset token generation
 *  ✓ Hashed refresh token methods
 *  ✓ toSafeObject hides sensitive fields
 */

const User = require('../../models/User');

// jest.setup.js runs beforeAll/afterEach/afterAll via jest config

describe('User Model — Security Methods', () => {

  // ── Password hashing ─────────────────────────────────────────
  describe('Password hashing', () => {
    it('should hash the password before saving', async () => {
      const user = await User.create(global.sampleUser('staff', {
        email: 'hash@test.com', password: 'PlainText@123'
      }));
      expect(user.password).not.toBe('PlainText@123');
      expect(user.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
    });

    it('should not re-hash password if not modified', async () => {
      const user = await User.create(global.sampleUser('staff', { email: 'nohash@test.com' }));
      const originalHash = user.password;
      user.name = 'Updated Name';
      await user.save();
      // Re-fetch to confirm
      const fresh = await User.findById(user._id).select('+password');
      expect(fresh.password).toBe(originalHash);
    });
  });

  // ── comparePassword ───────────────────────────────────────────
  describe('comparePassword()', () => {
    it('should return true for the correct password', async () => {
      const user = await User.create(global.sampleUser('doctor', { email: 'cp1@test.com', password: 'Correct@123' }));
      const fresh = await User.findById(user._id).select('+password');
      await expect(fresh.comparePassword('Correct@123')).resolves.toBe(true);
    });

    it('should return false for an incorrect password', async () => {
      const user = await User.create(global.sampleUser('doctor', { email: 'cp2@test.com' }));
      const fresh = await User.findById(user._id).select('+password');
      await expect(fresh.comparePassword('WrongPassword!')).resolves.toBe(false);
    });
  });

  // ── Account lockout ───────────────────────────────────────────
  describe('Account lockout', () => {
    it('isLocked should be false for a new user', async () => {
      const user = await User.create(global.sampleUser('nurse', { email: 'lock1@test.com' }));
      expect(user.isLocked).toBe(false);
    });

    it('should lock account after MAX_LOGIN_ATTEMPTS failures', async () => {
      const max  = Number(process.env.MAX_LOGIN_ATTEMPTS);
      const user = await User.create(global.sampleUser('staff', { email: 'lock2@test.com' }));

      // Simulate (max) failed attempts — last one triggers lock
      for (let i = 0; i < max; i++) {
        await user.handleFailedLogin();
      }

      const fresh = await User.findById(user._id);
      expect(fresh.isLocked).toBe(true);
      expect(fresh.lockUntil).toBeDefined();
      expect(fresh.lockUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('clearLoginAttempts() should remove the lock', async () => {
      const user = await User.create(global.sampleUser('staff', { email: 'lock3@test.com' }));
      // Lock manually
      user.lockUntil    = new Date(Date.now() + 60_000);
      user.loginAttempts = 0;
      await user.save({ validateBeforeSave: false });

      await user.clearLoginAttempts();

      const fresh = await User.findById(user._id);
      expect(fresh.isLocked).toBe(false);
      expect(fresh.lockUntil).toBeNull();
    });
  });

  // ── Password reset token ──────────────────────────────────────
  describe('generatePasswordResetToken()', () => {
    it('should return a raw token and store its hash', async () => {
      const user  = await User.create(global.sampleUser('admin', { email: 'reset@test.com' }));
      const raw   = user.generatePasswordResetToken();

      // Raw token should be a hex string
      expect(typeof raw).toBe('string');
      expect(raw.length).toBe(64); // 32 bytes → 64 hex chars

      // Stored token should NOT equal the raw token
      expect(user.passwordResetToken).not.toBe(raw);

      // Expiry should be in the future
      expect(user.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it('stored hash should match SHA-256 of raw token', () => {
      const crypto = require('crypto');
      const user   = new User({ name: 'x', email: 'y@y.com', password: 'z', role: 'staff' });
      const raw    = user.generatePasswordResetToken();
      const expected = crypto.createHash('sha256').update(raw).digest('hex');
      expect(user.passwordResetToken).toBe(expected);
    });
  });

  // ── Refresh token hashing ─────────────────────────────────────
  describe('setRefreshToken() / verifyRefreshToken()', () => {
    it('should store a hash and verify correctly', async () => {
      const user  = await User.create(global.sampleUser('staff', { email: 'rt@test.com' }));
      const raw   = 'some_opaque_refresh_token_value_abc123';
      user.setRefreshToken(raw);

      expect(user.refreshTokenHash).toBeDefined();
      expect(user.refreshTokenHash).not.toBe(raw);
      expect(user.verifyRefreshToken(raw)).toBe(true);
      expect(user.verifyRefreshToken('wrong_token')).toBe(false);
    });
  });

  // ── toSafeObject ──────────────────────────────────────────────
  describe('toSafeObject()', () => {
    it('should strip all sensitive fields', async () => {
      const user = await User.create(global.sampleUser('doctor', { email: 'safe@test.com' }));
      const safe = user.toSafeObject();

      expect(safe.password).toBeUndefined();
      expect(safe.refreshTokenHash).toBeUndefined();
      expect(safe.passwordResetToken).toBeUndefined();
      expect(safe.twoFactorSecret).toBeUndefined();
      expect(safe.twoFactorBackupCodes).toBeUndefined();
      expect(safe.securityLog).toBeUndefined();
      // Public fields should still be present
      expect(safe.name).toBeDefined();
      expect(safe.email).toBeDefined();
      expect(safe.role).toBeDefined();
    });
  });
});
