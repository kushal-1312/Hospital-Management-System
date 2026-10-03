const Patient = require('../models/Patient');
const { AppError } = require('../middleware/errorHandler');
const { socketManager } = require('../sockets/socketManager');
const { createAndPush } = require('./notificationController');
const logger = require('../utils/logger');

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATIENT_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'name', 'patientId', 'admissionDate', 'status']);

const buildAudit = (action, user, changes = null) => ({
  action, performedBy: user._id,
  performedByName: `${user.name} (${user.role})`,
  timestamp: new Date(), changes
});

const getPatients = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, status, gender, assignedDoctor, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const filter = {};
    if (search) {
      const safeSearch = escapeRegex(String(search).slice(0, 80));
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { patientId: { $regex: safeSearch, $options: 'i' } },
        { currentDiagnosis: { $regex: safeSearch, $options: 'i' } }
      ];
    }
    if (status) filter.status = status;
    if (gender) filter.gender = gender;
    if (assignedDoctor) filter.assignedDoctor = assignedDoctor;
    if (req.user.role === 'doctor') filter.assignedDoctor = req.user._id;
    const skip = (Number(page) - 1) * Number(limit);
    const safeSortBy = PATIENT_SORT_FIELDS.has(sortBy) ? sortBy : 'createdAt';
    const [patients, total] = await Promise.all([
      Patient.find(filter).populate('assignedDoctor', 'name email specialization').sort({ [safeSortBy]: sortOrder === 'asc' ? 1 : -1 }).skip(skip).limit(Number(limit)).select('-auditLog -files').lean(),
      Patient.countDocuments(filter)
    ]);
    res.json({ success: true, data: patients, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) { next(err); }
};

const getPatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('assignedDoctor', 'name email specialization department phone').populate('medicalHistory.doctor', 'name specialization');
    if (!patient) return next(new AppError('Patient not found', 404));
    if (req.user.role === 'doctor' && patient.assignedDoctor?._id.toString() !== req.user._id.toString()) return next(new AppError('Access denied', 403));
    res.json({ success: true, data: patient });
  } catch (err) { next(err); }
};

const createPatient = async (req, res, next) => {
  try {
    const patient = new Patient({ ...req.body, createdBy: req.user._id, updatedBy: req.user._id });
    patient.auditLog.push(buildAudit('Patient record created', req.user));
    await patient.save();
    socketManager.patientAdded(patient);
    if (patient.assignedDoctor) {
      await createAndPush({ recipientId: patient.assignedDoctor, senderId: req.user._id, title: '👤 New Patient Assigned', body: `${patient.name} (${patient.patientId}) has been assigned to you`, type: 'patient', link: `/patients/${patient._id}` });
    }
    logger.info(`Patient created: ${patient.patientId}`);
    res.status(201).json({ success: true, message: 'Patient created', data: patient });
  } catch (err) { next(err); }
};

const updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return next(new AppError('Patient not found', 404));
    if (req.user.role === 'doctor' && patient.assignedDoctor?.toString() !== req.user._id.toString()) return next(new AppError('Access denied', 403));
    if (req.user.role === 'nurse') { ['currentDiagnosis','currentPrescriptions','medicalHistory','assignedDoctor'].forEach(f => delete req.body[f]); }
    const previousStatus = patient.status;
    const changes = {};
    Object.keys(req.body).forEach(k => { if (JSON.stringify(patient[k]) !== JSON.stringify(req.body[k])) changes[k] = { from: patient[k], to: req.body[k] }; });
    Object.assign(patient, req.body);
    patient.updatedBy = req.user._id;
    patient.auditLog.push(buildAudit('Patient record updated', req.user, changes));
    await patient.save();
    if (req.body.status && req.body.status !== previousStatus) {
      socketManager.patientStatusChanged(patient, previousStatus);
      if (req.body.status === 'critical' && patient.assignedDoctor) {
        await createAndPush({ recipientId: patient.assignedDoctor, senderId: req.user._id, title: '🚨 Patient Critical', body: `${patient.name} (${patient.patientId}) is now critical`, type: 'critical', link: `/patients/${patient._id}` });
      }
    } else { socketManager.pushDashboardRefresh(); }
    res.json({ success: true, message: 'Patient updated', data: patient });
  } catch (err) { next(err); }
};

const addMedicalHistory = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return next(new AppError('Patient not found', 404));
    patient.medicalHistory.push({ ...req.body, doctor: req.user._id, doctorName: req.user.name, date: new Date() });
    patient.updatedBy = req.user._id;
    patient.auditLog.push(buildAudit('Medical history added', req.user));
    await patient.save();
    res.status(201).json({ success: true, data: patient.medicalHistory });
  } catch (err) { next(err); }
};

const deletePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return next(new AppError('Patient not found', 404));
    await patient.deleteOne();
    socketManager.pushDashboardRefresh();
    res.json({ success: true, message: 'Patient deleted' });
  } catch (err) { next(err); }
};

const exportPatients = async (req, res, next) => {
  try {
    const patients = await Patient.find({}).populate('assignedDoctor', 'name').select('patientId name age gender status currentDiagnosis contact address admissionDate');
    const headers = ['Patient ID','Name','Age','Gender','Status','Diagnosis','Phone','City','Admission Date','Doctor'];
    const rows = patients.map(p => [p.patientId, p.name, p.age, p.gender, p.status, p.currentDiagnosis || '', p.contact?.phone || '', p.address?.city || '', p.admissionDate ? new Date(p.admissionDate).toLocaleDateString() : '', p.assignedDoctor?.name || '']);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=patients_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) { next(err); }
};

const getPatientStats = async (req, res, next) => {
  try {
    const [statusStats, genderStats, monthlyStats] = await Promise.all([
      Patient.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Patient.aggregate([{ $group: { _id: '$gender', count: { $sum: 1 } } }]),
      Patient.aggregate([{ $match: { admissionDate: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) } } }, { $group: { _id: { year: { $year: '$admissionDate' }, month: { $month: '$admissionDate' } }, count: { $sum: 1 } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }])
    ]);
    res.json({ success: true, data: { statusStats, genderStats, monthlyStats } });
  } catch (err) { next(err); }
};

module.exports = { getPatients, getPatient, createPatient, updatePatient, addMedicalHistory, deletePatient, exportPatients, getPatientStats };
