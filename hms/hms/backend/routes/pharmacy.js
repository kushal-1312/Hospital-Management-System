const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getMedicines, getMedicine, createMedicine, updateMedicine, deleteMedicine,
  stockIn, adjustStock,
  dispense, getDispensingRecords,
  getSuppliers, createSupplier, updateSupplier,
  getPharmacyStats
} = require('../controllers/pharmacyController');

router.use(authenticate);

// ── Stats (must be before :id routes) ─────────────────────────
router.get('/stats', authorize('admin', 'staff', 'doctor', 'nurse'), getPharmacyStats);

// ── Medicines ─────────────────────────────────────────────────
router.get('/medicines', getMedicines);

router.post('/medicines', authorize('admin', 'staff'), [
  body('name').trim().notEmpty().withMessage('Medicine name required'),
  body('reorderLevel').optional().isInt({ min: 0 }),
  body('currentStock').optional().isInt({ min: 0 }),
  validate
], createMedicine);

router.get('/medicines/:id', getMedicine);

router.put('/medicines/:id', authorize('admin', 'staff'), [
  body('name').optional().trim().notEmpty(),
  validate
], updateMedicine);

router.delete('/medicines/:id', authorize('admin'), deleteMedicine);

// ── Stock management ──────────────────────────────────────────
router.post('/medicines/:id/stock-in', authorize('admin', 'staff'), [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  validate
], stockIn);

router.post('/medicines/:id/adjust', authorize('admin'), [
  body('newStock').isInt({ min: 0 }).withMessage('New stock level required (>= 0)'),
  body('reason').notEmpty().withMessage('Reason for adjustment required'),
  validate
], adjustStock);

// ── Dispensing ────────────────────────────────────────────────
router.get('/dispensing', getDispensingRecords);

router.post('/dispense', authorize('admin', 'staff', 'nurse'), [
  body('patientId').isMongoId().withMessage('Valid patient ID required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.medicineId').isMongoId().withMessage('Valid medicine ID required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  validate
], dispense);

// ── Suppliers ─────────────────────────────────────────────────
router.get('/suppliers', getSuppliers);

router.post('/suppliers', authorize('admin', 'staff'), [
  body('name').trim().notEmpty().withMessage('Supplier name required'),
  validate
], createSupplier);

router.put('/suppliers/:id', authorize('admin', 'staff'), updateSupplier);

module.exports = router;
