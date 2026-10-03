const { body, query, validationResult } = require('express-validator');

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

const patientValidation = {
  create: [
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('age').isInt({ min: 0, max: 150 }),
    body('gender').isIn(['male', 'female', 'other']),
    validate
  ],
  update: [
    body('age').optional().isInt({ min: 0, max: 150 }),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('status').optional().isIn(['active', 'discharged', 'critical', 'stable', 'under-observation']),
    validate
  ]
};

const appointmentValidation = {
  create: [
    body('patient').isMongoId(),
    body('doctor').isMongoId(),
    body('date').isISO8601(),
    body('timeSlot.start').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('timeSlot.end').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    validate
  ],
  update: [
    body('status').optional().isIn(['pending', 'confirmed', 'completed', 'cancelled', 'no-show']),
    validate
  ]
};

const userValidation = {
  update: [
    body('name').optional().trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'doctor', 'nurse', 'staff']),
    validate
  ]
};

const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validate
];

module.exports = { validate, patientValidation, appointmentValidation, userValidation, paginationValidation };
