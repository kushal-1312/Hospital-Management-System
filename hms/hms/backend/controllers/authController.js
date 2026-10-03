const crypto = require('crypto');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const User = require('../models/User');
const {
  sendTokenResponse, generateAccessToken, generateRefreshToken,
  setRefreshCookie, clearRefreshCookie
} = require('../services/authService');
const { sendPasswordResetEmail, sendTwoFactorSetupEmail, sendLoginAlertEmail } = require('../services/emailService');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ── Helper: get client IP ─────────────────────────────────────
const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';

// ─────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, department, phone, specialization } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return next(new AppError('Email already registered', 409));

    const user = await User.create({
      name, email, password,
      role: role || 'staff',
      department, phone, specialization,
      createdBy: req.user?._id
    });

    logger.info(`New user registered: ${email} [${role}]`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: user.toSafeObject()
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// LOGIN — with lockout + 2FA check
// ─────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'];

    // Fetch with sensitive fields
    const user = await User.findOne({ email })
      .select('+password +refreshTokenHash +loginAttempts +lockUntil +twoFactorEnabled +twoFactorSecret');

    // UPGRADE 1B: Check account lockout before anything else
    if (user?.isLocked) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      logger.warn(`Locked account login attempt: ${email} from ${ip}`);
      return next(new AppError(
        `Account locked after too many failed attempts. Try again in ${minutesLeft} minute(s).`, 423
      ));
    }

    // Validate credentials (generic error prevents user enumeration)
    if (!user || !(await user.comparePassword(password))) {
      if (user) await user.handleFailedLogin();
      logger.warn(`Failed login attempt for: ${email} from ${ip}`);
      return next(new AppError('Invalid email or password', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Account deactivated. Contact administrator.', 403));
    }

    // UPGRADE 1D: If 2FA is enabled, return a pre-auth token instead
    // of a full session. Client must present TOTP code to complete login.
    if (user.twoFactorEnabled) {
      // Issue a short-lived pre-auth token (5 min), no refresh token yet
      const preAuthToken = require('jsonwebtoken').sign(
        { id: user._id, preAuth: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        success: true,
        requiresTwoFactor: true,
        preAuthToken,
        message: 'Enter your authenticator code to complete login'
      });
    }

    // Successful login: clear any lockout state
    await user.clearLoginAttempts();

    // Persist the security event before issuing tokens. Both operations save
    // the same Mongoose document, so running them concurrently can throw a
    // ParallelSaveError and turn an otherwise valid login into a 500.
    await user.logSecurityEvent('login', ip, ua);

    await sendTokenResponse(user, 200, res);
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// VERIFY 2FA — complete login after TOTP code submitted
// ─────────────────────────────────────────────────────────────
const verifyTwoFactor = async (req, res, next) => {
  try {
    const { preAuthToken, code } = req.body;
    if (!preAuthToken || !code) {
      return next(new AppError('Pre-auth token and code required', 400));
    }

    // Verify the pre-auth token
    let decoded;
    try {
      decoded = require('jsonwebtoken').verify(preAuthToken, process.env.JWT_SECRET);
    } catch {
      return next(new AppError('Pre-auth token expired. Please login again.', 401));
    }

    if (!decoded.preAuth) return next(new AppError('Invalid pre-auth token', 401));

    const user = await User.findById(decoded.id)
      .select('+twoFactorSecret +twoFactorBackupCodes +twoFactorEnabled +loginAttempts +lockUntil');

    if (!user || !user.twoFactorEnabled) {
      return next(new AppError('2FA not configured for this account', 400));
    }

    // Validate TOTP code
    const isValid = authenticator.verify({
      token: code.replace(/\s/g, ''),
      secret: user.twoFactorSecret
    });

    // Also check backup codes (one-time use)
    let usedBackupCode = false;
    if (!isValid) {
      const bcrypt = require('bcryptjs');
      for (let i = 0; i < (user.twoFactorBackupCodes || []).length; i++) {
        if (await bcrypt.compare(code, user.twoFactorBackupCodes[i])) {
          // Consume the backup code
          user.twoFactorBackupCodes.splice(i, 1);
          await user.save({ validateBeforeSave: false });
          usedBackupCode = true;
          break;
        }
      }
    }

    if (!isValid && !usedBackupCode) {
      await user.handleFailedLogin();
      return next(new AppError('Invalid authenticator code', 401));
    }

    await user.clearLoginAttempts();
    const ip = getClientIp(req);
    user.logSecurityEvent('2fa_verified', ip, req.headers['user-agent']).catch(() => {});

    await sendTokenResponse(user, 200, res);
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// REFRESH TOKEN
// ─────────────────────────────────────────────────────────────
const refreshToken = async (req, res, next) => {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!rawToken) return next(new AppError('Refresh token required', 400));

    // Find user by hashed token
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const user = await User.findOne({ refreshTokenHash: hash }).select('+refreshTokenHash');

    if (!user) return next(new AppError('Invalid or expired refresh token', 401));
    if (!user.isActive) return next(new AppError('Account deactivated', 403));

    const newAccessToken = generateAccessToken(user._id, user.role);

    // Rotate refresh credentials on every use to limit replay windows.
    const nextRefreshToken = generateRefreshToken();
    user.setRefreshToken(nextRefreshToken);
    await user.save({ validateBeforeSave: false });
    setRefreshCookie(res, nextRefreshToken);

    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshTokenHash: null });
    clearRefreshCookie(res);
    logger.info(`User logged out: ${req.user.email}`);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET ME
// ─────────────────────────────────────────────────────────────
const getMe = (req, res) => {
  res.json({ success: true, user: req.user });
};

// ─────────────────────────────────────────────────────────────
// FORGOT PASSWORD — send reset email
// ─────────────────────────────────────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Email is required', 400));

    const user = await User.findOne({ email });

    // Always return 200 to prevent user enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists, a password reset email has been sent.'
      });
    }

    // Generate token (raw returned, hash stored)
    const rawToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user, rawToken);
      logger.info(`Password reset email sent to: ${email}`);
    } catch (emailErr) {
      // Roll back token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      logger.error(`Failed to send reset email: ${emailErr.message}`);
      return next(new AppError('Failed to send reset email. Try again later.', 500));
    }

    res.json({
      success: true,
      message: 'If an account exists, a password reset email has been sent.'
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// RESET PASSWORD — via token from email
// ─────────────────────────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return next(new AppError('Password must be at least 8 characters', 400));
    }

    // Hash the incoming raw token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return next(new AppError('Reset token is invalid or has expired', 400));
    }

    // Apply new password and clear reset fields
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    // Invalidate all sessions on password change
    user.refreshTokenHash = null;
    await user.save();

    logger.info(`Password reset completed for: ${user.email}`);
    user.logSecurityEvent('password_reset', getClientIp(req), req.headers['user-agent']).catch(() => {});

    res.json({ success: true, message: 'Password reset successfully. Please login.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// CHANGE PASSWORD (authenticated)
// ─────────────────────────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return next(new AppError('Both current and new password required', 400));
    }
    if (newPassword.length < 8) {
      return next(new AppError('New password must be at least 8 characters', 400));
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return next(new AppError('Current password is incorrect', 400));
    }

    user.password = newPassword;
    user.refreshTokenHash = null; // invalidate all sessions
    await user.save();

    logger.info(`Password changed for: ${user.email}`);
    res.json({ success: true, message: 'Password changed. Please login again.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// SETUP 2FA — generate TOTP secret + QR code
// ─────────────────────────────────────────────────────────────
const setup2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret +twoFactorEnabled');

    if (user.twoFactorEnabled) {
      return next(new AppError('2FA is already enabled on this account', 400));
    }

    // Generate a new TOTP secret
    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(
      user.email,
      process.env.TOTP_APP_NAME || 'MedCare HMS',
      secret
    );

    // Store secret temporarily (not yet active — requires verification)
    user.twoFactorSecret = secret;
    user.twoFactorPending = true;
    await user.save({ validateBeforeSave: false });

    // Generate QR code as data URL for display in browser
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

    res.json({
      success: true,
      message: 'Scan the QR code with your authenticator app, then verify with a code.',
      data: {
        qrCode: qrCodeDataUrl,
        manualKey: secret, // for manual entry if QR fails
        otpAuthUrl
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// VERIFY & ENABLE 2FA — confirm TOTP code, activate 2FA
// ─────────────────────────────────────────────────────────────
const verify2FA = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return next(new AppError('Authenticator code required', 400));

    const user = await User.findById(req.user._id)
      .select('+twoFactorSecret +twoFactorPending +twoFactorEnabled');

    if (!user.twoFactorSecret || !user.twoFactorPending) {
      return next(new AppError('No pending 2FA setup found. Start setup first.', 400));
    }

    const isValid = authenticator.verify({
      token: code.replace(/\s/g, ''),
      secret: user.twoFactorSecret
    });

    if (!isValid) return next(new AppError('Invalid code. Please try again.', 400));

    // Generate 8 single-use backup codes
    const rawCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    const bcrypt = require('bcryptjs');
    const hashedCodes = await Promise.all(
      rawCodes.map(c => bcrypt.hash(c, 10))
    );

    user.twoFactorEnabled = true;
    user.twoFactorPending = false;
    user.twoFactorBackupCodes = hashedCodes;
    await user.save({ validateBeforeSave: false });

    // Notify user by email
    sendTwoFactorSetupEmail(user).catch(() => {});
    logger.info(`2FA enabled for: ${user.email}`);

    res.json({
      success: true,
      message: '2FA enabled successfully.',
      backupCodes: rawCodes // shown ONCE — user must save these
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// DISABLE 2FA — requires password confirmation
// ─────────────────────────────────────────────────────────────
const disable2FA = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return next(new AppError('Password required to disable 2FA', 400));

    const user = await User.findById(req.user._id)
      .select('+password +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes');

    if (!(await user.comparePassword(password))) {
      return next(new AppError('Incorrect password', 401));
    }

    if (!user.twoFactorEnabled) {
      return next(new AppError('2FA is not enabled on this account', 400));
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = [];
    user.twoFactorPending = false;
    await user.save({ validateBeforeSave: false });

    logger.warn(`2FA disabled for: ${user.email}`);
    res.json({ success: true, message: '2FA disabled successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET SECURITY LOG
// ─────────────────────────────────────────────────────────────
const getSecurityLog = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+securityLog');
    res.json({
      success: true,
      data: (user.securityLog || []).slice().reverse() // newest first
    });
  } catch (err) { next(err); }
};

module.exports = {
  register, login, verifyTwoFactor, refreshToken, logout, getMe,
  forgotPassword, resetPassword, changePassword,
  setup2FA, verify2FA, disable2FA, getSecurityLog
};
