const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, deleteNotification, clearRead } = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', getNotifications);
router.put('/read', markAsRead);
router.delete('/clear-read', clearRead);
router.delete('/:id', deleteNotification);

module.exports = router;
