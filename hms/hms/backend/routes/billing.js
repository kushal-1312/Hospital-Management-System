const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getInvoices, getInvoice, createInvoice, updateInvoice,
  recordPayment, downloadPDF, deleteInvoice,
  getBillingStats, getPatientInvoices, updateInsurance
} = require('../controllers/billingController');

router.use(authenticate);

// ── Stats & special routes first (before :id) ─────────────────
router.get('/stats', authorize('admin', 'staff'), getBillingStats);
router.get('/patient/:patientId', getPatientInvoices);

// ── Main CRUD ─────────────────────────────────────────────────
router.get('/', authorize('admin', 'staff', 'doctor'), getInvoices);

router.post('/', authorize('admin', 'staff'), [
  body('patientId').isMongoId().withMessage('Valid patient ID required'),
  body('lineItems').isArray({ min: 1 }).withMessage('At least one line item required'),
  body('lineItems.*.description').notEmpty().withMessage('Item description required'),
  body('lineItems.*.unitPrice').isFloat({ min: 0 }).withMessage('Valid unit price required'),
  validate
], createInvoice);

router.get('/:id', getInvoice);

router.put('/:id', authorize('admin', 'staff'), [
  body('lineItems').optional().isArray(),
  body('status').optional().isIn(['draft','sent','cancelled','refunded']),
  validate
], updateInvoice);

router.delete('/:id', authorize('admin'), deleteInvoice);

// ── Payment recording ─────────────────────────────────────────
router.post('/:id/payment', authorize('admin', 'staff'), [
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount required'),
  body('method').isIn(['cash','card','upi','bank_transfer','insurance','cheque'])
    .withMessage('Valid payment method required'),
  validate
], recordPayment);

// ── PDF download ──────────────────────────────────────────────
router.get('/:id/pdf', downloadPDF);

// ── Insurance update ──────────────────────────────────────────
router.put('/:id/insurance', authorize('admin', 'staff'), [
  body('status').optional()
    .isIn(['not_claimed','submitted','approved','rejected','partial']),
  body('coverageAmount').optional().isFloat({ min: 0 }),
  validate
], updateInsurance);

module.exports = router;
