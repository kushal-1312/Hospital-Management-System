const User = require('../models/User');
const { sendTokenResponse, verifyRefreshToken, generateAccessToken } = require('../services/authService');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Admin only
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, department, phone, specialization } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new AppError('Email already registered', 409));
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'staff',
      department,
      phone,
      specialization,
      createdBy: req.user?._id
    });

    logger.info(`New user created: ${email} with role ${role}`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: user.toSafeObject()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Fetch user WITH password (excluded by default)
    const user = await User.findOne({ email }).select('+password +refreshToken');

    if (!user) {
      // Generic message to prevent user enumeration
      return next(new AppError('Invalid email or password', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Account deactivated. Contact administrator.', 403));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn(`Failed login attempt for: ${email}`);
      return next(new AppError('Invalid email or password', 401));
    }

    await sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refresh access token using refresh token
 * @route   POST /api/auth/refresh
 * @access  Public (with refresh token)
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return next(new AppError('Refresh token required', 400));
    }

    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      return next(new AppError('Invalid or expired refresh token', 401));
    }

    // Verify token matches stored token
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== token) {
      return next(new AppError('Refresh token invalid or reused', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Account deactivated', 403));
    }

    const newAccessToken = generateAccessToken(user._id, user.role);

    res.json({
      success: true,
      accessToken: newAccessToken
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout - invalidate refresh token
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    logger.info(`User ${req.user.email} logged out`);

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current logged-in user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
};

/**
 * @desc    Change password
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return next(new AppError('Current password is incorrect', 400));
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, refreshToken, logout, getMe, changePassword };
