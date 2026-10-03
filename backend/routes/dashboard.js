const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getDashboardStats } = require('../controllers/dashboardController');

router.use(authenticate);
// No cache middleware here — controller handles it with withCache()
router.get('/stats', getDashboardStats);

module.exports = router;
