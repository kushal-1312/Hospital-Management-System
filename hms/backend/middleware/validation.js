const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to check validation results and return errors
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// Auth validation rules
const authValidation = {
  login: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
    validate
  ],
  register: [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name required (max 100 chars)'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['admin', 'doctor', 'nurse', 'staff']).withMessage('Invalid role'),
    validate
  ]
};

// Patient validation rules
const patientValidation = {
  create: [
    body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Patient name required'),
    body('age').isInt({ min: 0, max: 150 }).withMessage('Valid age required (0-150)'),
    body('gender').isIn(['male', 'female', 'other']).withMessage('Valid gender required'),
    body('contact.phone').optional().isMobilePhone().withMessage('Valid phone required'),
    body('contact.email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
    validate
  ],
  update: [
    body('name').optional().trim().isLength({ max: 100 }),
    body('age').optional().isInt({ min: 0, max: 150 }),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('status').optional().isIn(['active', 'discharged', 'critical', 'stable', 'under-observation']),
    validate
  ]
};

// Appointment validation rules
const appointmentValidation = {
  create: [
    body('patient').isMongoId().withMessage('Valid patient ID required'),
    body('doctor').isMongoId().withMessage('Valid doctor ID required'),
    body('date').isISO8601().withMessage('Valid date required'),
    body('timeSlot.start').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time required (HH:MM)'),
    body('timeSlot.end').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time required (HH:MM)'),
    body('type').optional().isIn(['consultation', 'follow-up', 'emergency', 'routine-checkup', 'procedure']),
    validate
  ],
  update: [
    body('status').optional().isIn(['pending', 'confirmed', 'completed', 'cancelled', 'no-show']),
    body('date').optional().isISO8601(),
    validate
  ]
};

// User/Staff validation
const userValidation = {
  create: [
    body('name').trim().notEmpty().withMessage('Name required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 characters'),
    body('role').isIn(['admin', 'doctor', 'nurse', 'staff']).withMessage('Invalid role'),
    validate
  ],
  update: [
    body('name').optional().trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'doctor', 'nurse', 'staff']),
    body('isActive').optional().isBoolean(),
    validate
  ]
};

// Pagination validation
const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validate
];

module.exports = {
  validate,
  authValidation,
  patientValidation,
  appointmentValidation,
  userValidation,
  paginationValidation
};
