const express = require('express');
const router  = express.Router();
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getDepartmentReport,
  getDoctorPerformanceReport,
  getRevenueTrendReport,
  getDemographicsReport,
  getAppointmentAnalytics,
  getSummaryReport,
  scheduleReportEmail
} = require('../controllers/reportsController');

router.use(authenticate);

// All report routes — admin only (doctors get their own via doctor param)
router.get('/department',       authorize('admin'), getDepartmentReport);
router.get('/doctor-performance', authorize('admin', 'doctor'), getDoctorPerformanceReport);
router.get('/revenue',          authorize('admin'), getRevenueTrendReport);
router.get('/demographics',     authorize('admin'), getDemographicsReport);
router.get('/appointments',     authorize('admin', 'doctor'), getAppointmentAnalytics);
router.get('/summary',          authorize('admin'), getSummaryReport);

router.post('/schedule-email',  authorize('admin'), [
  body('reportType').notEmpty().isIn(['monthly-summary','department','demographics']),
  body('recipientEmail').isEmail().normalizeEmail(),
  validate
], scheduleReportEmail);

module.exports = router;
