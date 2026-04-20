// ============================================================
// routes/auth.js
// ============================================================
const express = require('express');
const router = express.Router();
const { register, login, refreshToken, logout, getMe, changePassword } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const { authValidation } = require('../middleware/validation');

router.post('/login', authValidation.login, login);
router.post('/refresh', refreshToken);
router.use(authenticate); // All routes below require auth
router.get('/me', getMe);
router.post('/logout', logout);
router.put('/change-password', changePassword);
router.post('/register', authorize('admin'), authValidation.register, register);

module.exports = router;
