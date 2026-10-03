const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { paginationValidation, userValidation } = require('../middleware/validation');
const { getUsers, getUser, updateUser, deleteUser, getDoctors, getStaffStats } = require('../controllers/userController');

router.use(authenticate);
router.get('/doctors', getDoctors);
router.get('/stats', authorize('admin'), getStaffStats);
router.get('/', authorize('admin'), paginationValidation, getUsers);
router.get('/:id', getUser);
router.put('/:id', userValidation.update, updateUser);
router.delete('/:id', authorize('admin'), deleteUser);

module.exports = router;
