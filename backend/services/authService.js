const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ── Generate JWT access token (short-lived) ───────────────────
const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
};

// ── Generate refresh token (random bytes, not JWT) ─────────────
// Using crypto.randomBytes instead of JWT makes refresh tokens
// opaque, undecodable, and easier to invalidate.
const generateRefreshToken = () => {
  return crypto.randomBytes(48).toString('hex');
};

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: (Number(process.env.REFRESH_COOKIE_DAYS) || 7) * 24 * 60 * 60 * 1000
});

const setRefreshCookie = (res, rawRefreshToken) => {
  res.cookie('refreshToken', rawRefreshToken, refreshCookieOptions());
};

const clearRefreshCookie = (res) => {
  res.clearCookie('refreshToken', { ...refreshCookieOptions(), maxAge: undefined });
};

// ── Verify JWT ────────────────────────────────────────────────
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

// ── Send token response ───────────────────────────────────────
// UPGRADE: refresh token is stored as a SHA-256 hash in DB.
const sendTokenResponse = async (user, statusCode, res) => {
  const accessToken = generateAccessToken(user._id, user.role);
  const rawRefreshToken = generateRefreshToken();

  // Store the hash — never the raw token
  user.setRefreshToken(rawRefreshToken);
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  logger.info(`Tokens issued for user: ${user.email}`);

  setRefreshCookie(res, rawRefreshToken);

  res.status(statusCode).json({
    success: true,
    accessToken,
    // Test clients do not have a browser cookie jar. Never expose this in a
    // deployed environment; browsers receive it in an HttpOnly cookie above.
    ...(process.env.NODE_ENV === 'test' && { refreshToken: rawRefreshToken }),
    user: user.toSafeObject()
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  sendTokenResponse,
  setRefreshCookie,
  clearRefreshCookie
};
