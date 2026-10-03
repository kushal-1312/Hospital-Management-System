const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────
// AUTHENTICATE — verify JWT, attach user to req
// ─────────────────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired.',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // Block pre-auth tokens from accessing protected routes
    if (decoded.preAuth) {
      return res.status(401).json({
        success: false,
        message: 'Complete 2FA verification to access this resource.'
      });
    }

    const user = await User.findById(decoded.id).select('-password -refreshTokenHash');
    if (!user) return res.status(401).json({ success: false, message: 'User no longer exists.' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Account deactivated.' });

    req.user = user;
    next();
  } catch (err) {
    logger.error(`Auth middleware error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Authentication failed.' });
  }
};

// ─────────────────────────────────────────────────────────────
// AUTHORIZE — role-based access control
// ─────────────────────────────────────────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (!roles.includes(req.user.role)) {
    logger.warn(`Unauthorized: ${req.user.email} (${req.user.role}) → ${req.path}`);
    return res.status(403).json({
      success: false,
      message: `Access denied. Required roles: ${roles.join(', ')}`
    });
  }
  next();
};

// ─────────────────────────────────────────────────────────────
// UPGRADE 1E: CSRF PROTECTION middleware
// Uses the Double Submit Cookie pattern:
//   1. Server generates a CSRF token and puts it in a cookie.
//   2. Client reads the cookie and includes it in X-CSRF-Token header.
//   3. Server verifies they match on every mutating request.
// Attackers can't read cookies cross-origin, so they can't forge the header.
// ─────────────────────────────────────────────────────────────
const generateCsrfToken = (req, res, next) => {
  if (!req.cookies?.csrfToken) {
    const token = crypto.randomBytes(32).toString('hex');
    // HttpOnly: false so JS can read it to include in header
    res.cookie('csrfToken', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }
  next();
};

const verifyCsrf = (req, res, next) => {
  // Skip CSRF for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  const valid = cookieToken && headerToken && cookieToken.length === headerToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  if (!valid) {
    logger.warn(`CSRF validation failed from IP: ${req.ip}`);
    return res.status(403).json({ success: false, message: 'CSRF validation failed.' });
  }
  next();
};

// ─────────────────────────────────────────────────────────────
// AUDIT LOG middleware factory
// ─────────────────────────────────────────────────────────────
const auditLog = (action) => (req, res, next) => {
  req.auditAction = action;
  req.auditUser = req.user
    ? { id: req.user._id, name: req.user.name, role: req.user.role }
    : null;
  next();
};

module.exports = { authenticate, authorize, auditLog, generateCsrfToken, verifyCsrf };
