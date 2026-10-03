const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getCommandCenter, getAuditTrail } = require('../controllers/operationsController');
const { paginationValidation } = require('../middleware/validation');

const router = express.Router();
router.use(authenticate);
router.get('/command-center', getCommandCenter);
router.get('/audit-trail', authorize('admin'), paginationValidation, getAuditTrail);

module.exports = router;
