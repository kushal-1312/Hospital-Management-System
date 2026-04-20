const express = require('express');
const router = express.Router();
const {
  getPatients, getPatient, createPatient, updatePatient,
  addMedicalHistory, deletePatient, exportPatients, getPatientStats
} = require('../controllers/patientController');
const { authenticate, authorize } = require('../middleware/auth');
const { patientValidation, paginationValidation } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

router.get('/export', authorize('admin'), exportPatients);
router.get('/stats', authorize('admin', 'doctor'), getPatientStats);
router.get('/', paginationValidation, getPatients);
router.post('/', authorize('admin', 'doctor', 'nurse'), patientValidation.create, createPatient);
router.get('/:id', getPatient);
router.put('/:id', authorize('admin', 'doctor', 'nurse'), patientValidation.update, updatePatient);
router.delete('/:id', authorize('admin'), deletePatient);
router.post('/:id/history', authorize('admin', 'doctor'), addMedicalHistory);

module.exports = router;
