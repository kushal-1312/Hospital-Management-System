const express = require('express');
const router = express.Router();
const {
  register, login, verifyTwoFactor, refreshToken, logout, getMe,
  forgotPassword, resetPassword, changePassword,
  setup2FA, verify2FA, disable2FA, getSecurityLog
} = require('../controllers/authController');
const { authenticate, authorize, verifyCsrf } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');

// ── Rate limiters (tighter for auth endpoints) ────────────────
const rateLimit = require('express-rate-limit');

// Unit/integration tests exercise account lockout directly and should not
// share an IP-based limiter across otherwise isolated test cases.
const testSafeRateLimit = (options) => process.env.NODE_ENV === 'test'
  ? (_req, _res, next) => next()
  : rateLimit(options);

const loginLimiter = testSafeRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Wait 15 minutes.' }
});

const passwordResetLimiter = testSafeRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { success: false, message: 'Too many reset requests. Wait 1 hour.' }
});

// ── Public routes ─────────────────────────────────────────────
router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate
], login);

router.post('/verify-2fa', loginLimiter, [
  body('preAuthToken').notEmpty(),
  body('code').notEmpty().isLength({ min: 6, max: 8 }),
  validate
], verifyTwoFactor);

router.post('/refresh', process.env.NODE_ENV === 'test' ? (_req, _res, next) => next() : verifyCsrf, refreshToken);

router.post('/forgot-password', passwordResetLimiter, [
  body('email').isEmail().normalizeEmail(),
  validate
], forgotPassword);

router.post('/reset-password/:token', [
  body('password').isLength({ min: 8 }),
  validate
], resetPassword);

// ── Protected routes (require auth) ──────────────────────────
router.use(authenticate);

router.get('/me', getMe);
router.post('/logout', logout);

router.put('/change-password', [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
  validate
], changePassword);

// ── 2FA management ────────────────────────────────────────────
router.post('/2fa/setup', setup2FA);
router.post('/2fa/verify', [
  body('code').notEmpty().isLength({ min: 6, max: 8 }),
  validate
], verify2FA);
router.post('/2fa/disable', [
  body('password').notEmpty(),
  validate
], disable2FA);

// ── Security log ──────────────────────────────────────────────
router.get('/security-log', getSecurityLog);

// ── Admin: register new user ──────────────────────────────────
router.post('/register', authorize('admin'), [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['admin', 'doctor', 'nurse', 'staff']),
  validate
], register);

module.exports = router;
