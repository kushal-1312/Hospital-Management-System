const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * @desc    Get all staff members
 * @route   GET /api/users
 * @access  Admin only
 */
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, department, search, isActive } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single user
 * @route   GET /api/users/:id
 * @access  Admin or self
 */
const getUser = async (req, res, next) => {
  try {
    // Users can view their own profile
    if (req.user.role !== 'admin' && req.params.id !== req.user._id.toString()) {
      return next(new AppError('Access denied', 403));
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Admin or self (limited fields)
 */
const updateUser = async (req, res, next) => {
  try {
    const isSelf = req.params.id === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isSelf) {
      return next(new AppError('Access denied', 403));
    }

    // Non-admins cannot change role or active status
    if (!isAdmin) {
      delete req.body.role;
      delete req.body.isActive;
    }

    // Prevent password update through this route
    delete req.body.password;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    logger.info(`User ${user.email} updated by ${req.user.email}`);

    res.json({ success: true, message: 'User updated', data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Deactivate/Delete user (admin only)
 * @route   DELETE /api/users/:id
 * @access  Admin
 */
const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return next(new AppError('Cannot delete your own account', 400));
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Soft delete - deactivate instead of removing
    user.isActive = false;
    await user.save();

    logger.warn(`User ${user.email} deactivated by ${req.user.email}`);

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all doctors (for dropdowns)
 * @route   GET /api/users/doctors
 * @access  All authenticated
 */
const getDoctors = async (req, res, next) => {
  try {
    const doctors = await User.find({ role: 'doctor', isActive: true })
      .select('name email specialization department phone');

    res.json({ success: true, data: doctors });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get dashboard stats
 * @route   GET /api/users/stats
 * @access  Admin
 */
const getStaffStats = async (req, res, next) => {
  try {
    const stats = await User.aggregate([
      { $group: { _id: '$role', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
    ]);

    const departments = await User.aggregate([
      { $match: { department: { $exists: true, $ne: '' } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({ success: true, data: { byRole: stats, byDepartment: departments } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getUser, updateUser, deleteUser, getDoctors, getStaffStats };
