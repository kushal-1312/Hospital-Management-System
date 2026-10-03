const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { appointmentValidation, paginationValidation } = require('../middleware/validation');
const { getAppointments, getAppointment, createAppointment, updateAppointment, deleteAppointment, getAppointmentStats, getAvailableSlots } = require('../controllers/appointmentController');

router.use(authenticate);
router.get('/stats', getAppointmentStats);
router.get('/slots', getAvailableSlots);
router.get('/', paginationValidation, getAppointments);
router.post('/', appointmentValidation.create, createAppointment);
router.get('/:id', getAppointment);
router.put('/:id', appointmentValidation.update, updateAppointment);
router.delete('/:id', authorize('admin'), deleteAppointment);

module.exports = router;
