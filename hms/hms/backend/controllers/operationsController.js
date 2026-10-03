const Appointment = require('../models/Appointment');
const AuditEvent = require('../models/AuditEvent');
const Invoice = require('../models/Invoice');
const Medicine = require('../models/Medicine');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { withCache } = require('../cache/redisClient');

const getCommandCenter = async (req, res, next) => {
  try {
    const data = await withCache(`operations:v1:${req.user.role}:${req.user._id}`, 15, async () => {
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
      const expiryThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const patientScope = req.user.role === 'doctor' ? { assignedDoctor: req.user._id } : {};
      const appointmentScope = req.user.role === 'doctor' ? { doctor: req.user._id } : {};

      const results = await Promise.all([
        Patient.countDocuments({ ...patientScope, status: { $in: ['active', 'critical', 'stable', 'under-observation'] } }),
        Patient.countDocuments({ ...patientScope, status: 'critical' }),
        Patient.countDocuments({ ...patientScope, status: 'under-observation' }),
        Patient.countDocuments({ ...patientScope, status: 'discharged', dischargeDate: { $gte: startOfDay, $lte: endOfDay } }),
        Appointment.countDocuments({ ...appointmentScope, date: { $gte: startOfDay, $lte: endOfDay } }),
        Appointment.countDocuments({ ...appointmentScope, date: { $gte: startOfDay, $lte: endOfDay }, status: 'pending' }),
        Appointment.countDocuments({ ...appointmentScope, date: { $gte: startOfDay, $lte: endOfDay }, status: 'completed' }),
        Appointment.countDocuments({ ...appointmentScope, date: { $gte: startOfDay, $lte: endOfDay }, status: 'no-show' }),
        User.countDocuments({ role: 'doctor', isActive: true }),
        User.countDocuments({ role: 'nurse', isActive: true }),
        User.countDocuments({ role: 'staff', isActive: true }),
        Medicine.countDocuments({ isActive: true, $expr: { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderLevel'] }] } }),
        Medicine.countDocuments({ isActive: true, currentStock: 0 }),
        Medicine.countDocuments({ batches: { $elemMatch: { quantity: { $gt: 0 }, expiryDate: { $gte: now, $lte: expiryThreshold } } } }),
        Invoice.aggregate([
          { $match: { status: { $nin: ['cancelled', 'refunded', 'paid'] }, amountDue: { $gt: 0 } } },
          { $group: { _id: null, outstandingAmount: { $sum: '$amountDue' }, unpaidInvoices: { $sum: 1 } } }
        ]),
        Invoice.aggregate([
          { $unwind: '$payments' },
          { $match: { 'payments.paidAt': { $gte: startOfDay, $lte: endOfDay } } },
          { $group: { _id: null, collectedToday: { $sum: '$payments.amount' } } }
        ])
      ]);

      const [patientsInCare, criticalPatients, underObservation, dischargedToday,
        appointmentsToday, awaitingConfirmation, completedToday, noShowsToday,
        activeDoctors, activeNurses, activeSupportStaff, lowStockItems, outOfStockItems,
        expiringBatches, financeOutstanding, financeCollected] = results;

      const alerts = [];
      if (criticalPatients) alerts.push({ id: 'critical-patients', severity: 'critical', title: `${criticalPatients} critical patient${criticalPatients === 1 ? '' : 's'}`, detail: 'Immediate clinical review and escalation may be required.', href: '/patients?status=critical' });
      if (awaitingConfirmation) alerts.push({ id: 'pending-appointments', severity: 'warning', title: `${awaitingConfirmation} appointment${awaitingConfirmation === 1 ? '' : 's'} awaiting confirmation`, detail: 'Confirm or reschedule to keep today’s flow on track.', href: '/appointments?status=pending' });
      if (noShowsToday) alerts.push({ id: 'no-shows', severity: 'warning', title: `${noShowsToday} no-show${noShowsToday === 1 ? '' : 's'} today`, detail: 'Follow-up may recover care continuity and capacity.', href: '/appointments?status=no-show' });
      if (['admin', 'staff', 'nurse'].includes(req.user.role) && outOfStockItems) alerts.push({ id: 'out-of-stock', severity: 'critical', title: `${outOfStockItems} medicine${outOfStockItems === 1 ? '' : 's'} out of stock`, detail: 'Replenish or approve a clinical substitute.', href: '/pharmacy' });
      if (['admin', 'staff', 'nurse'].includes(req.user.role) && lowStockItems) alerts.push({ id: 'low-stock', severity: 'warning', title: `${lowStockItems} medicine${lowStockItems === 1 ? '' : 's'} below reorder level`, detail: 'Create replenishment requests before stockout.', href: '/pharmacy' });

      const finance = financeOutstanding[0] || { outstandingAmount: 0, unpaidInvoices: 0 };
      return {
        generatedAt: new Date(),
        clinical: { patientsInCare, criticalPatients, underObservation, dischargedToday },
        flow: { appointmentsToday, awaitingConfirmation, completedToday, noShowsToday },
        capacity: { activeDoctors, activeNurses, activeSupportStaff },
        pharmacy: { lowStockItems, outOfStockItems, expiringBatches },
        ...(['admin', 'staff'].includes(req.user.role) && { finance: { ...finance, collectedToday: financeCollected[0]?.collectedToday || 0 } }),
        alerts
      };
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

const getAuditTrail = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {};
    if (req.query.resource) filter.resource = req.query.resource;
    if (req.query.actor) filter['actor.id'] = req.query.actor;
    const [events, total] = await Promise.all([
      AuditEvent.find(filter).sort({ occurredAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditEvent.countDocuments(filter)
    ]);
    res.json({ success: true, data: events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

module.exports = { getCommandCenter, getAuditTrail };
