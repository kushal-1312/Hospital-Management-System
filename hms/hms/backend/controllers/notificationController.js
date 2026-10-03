const Notification = require('../models/Notification');
const { socketManager } = require('../sockets/socketManager');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * @desc  Get notifications for current user
 * @route GET /api/notifications
 */
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const filter = { recipient: req.user._id };
    if (unreadOnly === 'true') filter.read = false;

    const skip = (Number(page) - 1) * Number(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, read: false })
    ]);

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) { next(err); }
};

/**
 * @desc  Mark one or all notifications as read
 * @route PUT /api/notifications/read
 */
const markAsRead = async (req, res, next) => {
  try {
    const { ids } = req.body; // if omitted → mark all as read

    const filter = { recipient: req.user._id, read: false };
    if (ids && ids.length > 0) filter._id = { $in: ids };

    const result = await Notification.updateMany(filter, { read: true });

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id, read: false
    });

    // Push updated unread count over socket
    socketManager.emitToUser(req.user._id, 'notifications:unreadCount', { count: unreadCount });

    res.json({
      success: true,
      message: `${result.modifiedCount} notification(s) marked as read`,
      unreadCount
    });
  } catch (err) { next(err); }
};

/**
 * @desc  Delete a notification
 * @route DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id
    });
    if (!notification) return next(new AppError('Notification not found', 404));
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) { next(err); }
};

/**
 * @desc  Delete all read notifications for current user
 * @route DELETE /api/notifications/clear-read
 */
const clearRead = async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user._id, read: true
    });
    res.json({ success: true, message: `${result.deletedCount} notifications cleared` });
  } catch (err) { next(err); }
};

/**
 * Helper: Create and persist a notification, then push over socket.
 * Used by other controllers (patient, appointment) to trigger notifications.
 */
const createAndPush = async ({ recipientId, senderId, title, body, type = 'info', link }) => {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      title, body, type, link
    });
    // Also push live via socket
    socketManager.emitToUser(recipientId, 'notification:new', notification);

    // Update unread badge count
    const unreadCount = await Notification.countDocuments({
      recipient: recipientId, read: false
    });
    socketManager.emitToUser(recipientId, 'notifications:unreadCount', { count: unreadCount });

    return notification;
  } catch (err) {
    logger.error(`Failed to create notification: ${err.message}`);
  }
};

module.exports = { getNotifications, markAsRead, deleteNotification, clearRead, createAndPush };
