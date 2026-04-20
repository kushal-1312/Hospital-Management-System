const express = require('express');
const router = express.Router();
const { getUsers, getUser, updateUser, deleteUser, getDoctors, getStaffStats } = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { userValidation, paginationValidation } = require('../middleware/validation');

router.use(authenticate);

router.get('/doctors', getDoctors);
router.get('/stats', authorize('admin'), getStaffStats);
router.get('/', authorize('admin'), paginationValidation, getUsers);
router.get('/:id', getUser);
router.put('/:id', userValidation.update, updateUser);
router.delete('/:id', authorize('admin'), deleteUser);

module.exports = router;
