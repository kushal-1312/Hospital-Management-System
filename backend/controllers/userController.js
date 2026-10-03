const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { withCache, cacheDel } = require('../cache/redisClient');
const { CacheKeys, TTL } = require('../cache/cacheKeys');
const logger = require('../utils/logger');

const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, department, search, isActive } = req.query;
    const filter = {};
    if (role)     filter.role = role;
    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter)
    ]);
    res.json({ success: true, data: users, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) { next(err); }
};

const getUser = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.params.id !== req.user._id.toString())
      return next(new AppError('Access denied', 403));
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found', 404));
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const isSelf  = req.params.id === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && !isSelf) return next(new AppError('Access denied', 403));
    if (!isAdmin) { delete req.body.role; delete req.body.isActive; }
    delete req.body.password;
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!user) return next(new AppError('User not found', 404));
    // Invalidate doctors list cache on any user change
    await cacheDel(CacheKeys.DOCTORS_LIST, CacheKeys.STAFF_STATS);
    res.json({ success: true, message: 'User updated', data: user });
  } catch (err) { next(err); }
};

const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString())
      return next(new AppError('Cannot deactivate yourself', 400));
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found', 404));
    user.isActive = false;
    await user.save();
    await cacheDel(CacheKeys.DOCTORS_LIST, CacheKeys.STAFF_STATS);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
};

/**
 * UPGRADE 7: Doctors list cached for 5 minutes.
 * This is called on every appointment/dispense form load — high frequency.
 */
const getDoctors = async (req, res, next) => {
  try {
    const doctors = await withCache(CacheKeys.DOCTORS_LIST, TTL.DOCTORS, async () => {
      return User.find({ role: 'doctor', isActive: true })
        .select('name email specialization department phone')
        .lean();
    });
    res.json({ success: true, data: doctors });
  } catch (err) { next(err); }
};

/**
 * UPGRADE 7: Staff stats cached for 60s.
 */
const getStaffStats = async (req, res, next) => {
  try {
    const data = await withCache(CacheKeys.STAFF_STATS, TTL.STATS, async () => {
      const [byRole, byDept] = await Promise.all([
        User.aggregate([{ $group: { _id: '$role', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }]),
        User.aggregate([
          { $match: { department: { $exists: true, $ne: '' } } },
          { $group: { _id: '$department', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      ]);
      return { byRole, byDepartment: byDept };
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = { getUsers, getUser, updateUser, deleteUser, getDoctors, getStaffStats };
