const Patient = require('../models/Patient');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Helper: Build audit log entry
 */
const buildAuditEntry = (action, user, changes = null) => ({
  action,
  performedBy: user._id,
  performedByName: `${user.name} (${user.role})`,
  timestamp: new Date(),
  changes
});

/**
 * @desc    Get all patients with pagination and search
 * @route   GET /api/patients
 * @access  All authenticated roles
 */
const getPatients = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      gender,
      assignedDoctor,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter query
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { patientId: { $regex: search, $options: 'i' } },
        { 'contact.phone': { $regex: search, $options: 'i' } },
        { currentDiagnosis: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) filter.status = status;
    if (gender) filter.gender = gender;
    if (assignedDoctor) filter.assignedDoctor = assignedDoctor;

    // Doctors only see their patients (unless admin)
    if (req.user.role === 'doctor') {
      filter.assignedDoctor = req.user._id;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .populate('assignedDoctor', 'name email specialization')
        .populate('createdBy', 'name role')
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit))
        .select('-auditLog -files'), // Exclude large fields from list
      Patient.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: patients,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single patient
 * @route   GET /api/patients/:id
 * @access  All authenticated
 */
const getPatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('assignedDoctor', 'name email specialization department phone')
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role')
      .populate('medicalHistory.doctor', 'name specialization');

    if (!patient) {
      return next(new AppError('Patient not found', 404));
    }

    // Doctors can only view their own patients
    if (req.user.role === 'doctor' &&
        patient.assignedDoctor?._id.toString() !== req.user._id.toString()) {
      return next(new AppError('Access denied to this patient record', 403));
    }

    res.json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create new patient
 * @route   POST /api/patients
 * @access  Admin, Doctor, Nurse
 */
const createPatient = async (req, res, next) => {
  try {
    const patientData = {
      ...req.body,
      createdBy: req.user._id,
      updatedBy: req.user._id
    };

    const patient = new Patient(patientData);

    // Initial audit log entry
    patient.auditLog.push(buildAuditEntry('Patient record created', req.user));

    await patient.save();

    logger.info(`Patient created: ${patient.patientId} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      data: patient
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update patient record
 * @route   PUT /api/patients/:id
 * @access  Admin, Doctor, Nurse (nurses: limited fields)
 */
const updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return next(new AppError('Patient not found', 404));
    }

    // Doctors can only update their patients
    if (req.user.role === 'doctor' &&
        patient.assignedDoctor?.toString() !== req.user._id.toString()) {
      return next(new AppError('Access denied to this patient record', 403));
    }

    // Nurses cannot update medical/diagnosis fields
    const nurseRestrictedFields = ['currentDiagnosis', 'currentPrescriptions', 'medicalHistory', 'assignedDoctor'];
    if (req.user.role === 'nurse') {
      nurseRestrictedFields.forEach(field => delete req.body[field]);
    }

    // Track what changed for audit
    const changes = {};
    Object.keys(req.body).forEach(key => {
      if (JSON.stringify(patient[key]) !== JSON.stringify(req.body[key])) {
        changes[key] = { from: patient[key], to: req.body[key] };
      }
    });

    // Apply updates
    Object.assign(patient, req.body);
    patient.updatedBy = req.user._id;
    patient.auditLog.push(buildAuditEntry('Patient record updated', req.user, changes));

    await patient.save();

    logger.info(`Patient ${patient.patientId} updated by ${req.user.email}`);

    res.json({ success: true, message: 'Patient updated', data: patient });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add medical history entry
 * @route   POST /api/patients/:id/history
 * @access  Admin, Doctor
 */
const addMedicalHistory = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return next(new AppError('Patient not found', 404));
    }

    const historyEntry = {
      ...req.body,
      doctor: req.user._id,
      doctorName: req.user.name,
      date: new Date()
    };

    patient.medicalHistory.push(historyEntry);
    patient.updatedBy = req.user._id;
    patient.auditLog.push(buildAuditEntry('Medical history entry added', req.user));

    await patient.save();

    res.status(201).json({
      success: true,
      message: 'Medical history added',
      data: patient.medicalHistory
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete patient (admin only)
 * @route   DELETE /api/patients/:id
 * @access  Admin only
 */
const deletePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return next(new AppError('Patient not found', 404));
    }

    await patient.deleteOne();

    logger.warn(`Patient ${patient.patientId} deleted by ${req.user.email}`);

    res.json({ success: true, message: 'Patient deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export patients as CSV
 * @route   GET /api/patients/export
 * @access  Admin only
 */
const exportPatients = async (req, res, next) => {
  try {
    const patients = await Patient.find({})
      .populate('assignedDoctor', 'name')
      .select('patientId name age gender status currentDiagnosis contact address admissionDate');

    // Build CSV manually for reliability
    const headers = ['Patient ID', 'Name', 'Age', 'Gender', 'Status', 'Diagnosis', 'Phone', 'City', 'Admission Date', 'Assigned Doctor'];

    const rows = patients.map(p => [
      p.patientId,
      p.name,
      p.age,
      p.gender,
      p.status,
      p.currentDiagnosis || '',
      p.contact?.phone || '',
      p.address?.city || '',
      p.admissionDate ? new Date(p.admissionDate).toLocaleDateString() : '',
      p.assignedDoctor?.name || ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=patients_${Date.now()}.csv`);

    logger.info(`Patient data exported by ${req.user.email}`);

    res.send(csv);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get patient statistics for dashboard
 * @route   GET /api/patients/stats
 * @access  Admin, Doctor
 */
const getPatientStats = async (req, res, next) => {
  try {
    const [statusStats, genderStats, monthlyStats] = await Promise.all([
      // By status
      Patient.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // By gender
      Patient.aggregate([
        { $group: { _id: '$gender', count: { $sum: 1 } } }
      ]),
      // Monthly admissions (last 6 months)
      Patient.aggregate([
        {
          $match: {
            admissionDate: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$admissionDate' },
              month: { $month: '$admissionDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: { statusStats, genderStats, monthlyStats }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  addMedicalHistory,
  deletePatient,
  exportPatients,
  getPatientStats
};
