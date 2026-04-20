const express = require('express');
const router = express.Router();
const {
  getAppointments, getAppointment, createAppointment,
  updateAppointment, deleteAppointment, getAppointmentStats, getAvailableSlots
} = require('../controllers/appointmentController');
const { authenticate, authorize } = require('../middleware/auth');
const { appointmentValidation, paginationValidation } = require('../middleware/validation');

router.use(authenticate);

router.get('/stats', getAppointmentStats);
router.get('/slots', getAvailableSlots);
router.get('/', paginationValidation, getAppointments);
router.post('/', authorize('admin', 'doctor', 'staff', 'nurse'), appointmentValidation.create, createAppointment);
router.get('/:id', getAppointment);
router.put('/:id', authorize('admin', 'doctor', 'staff', 'nurse'), appointmentValidation.update, updateAppointment);
router.delete('/:id', authorize('admin'), deleteAppointment);

module.exports = router;
