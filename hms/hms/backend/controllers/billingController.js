const Invoice = require('../models/Invoice');
const Patient = require('../models/Patient');
const { AppError } = require('../middleware/errorHandler');
const { generateInvoicePDF } = require('../services/pdfService');
const { socketManager } = require('../sockets/socketManager');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────
// GET ALL INVOICES — with filters and pagination
// ─────────────────────────────────────────────────────────────
const getInvoices = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 10,
      status, patient, search,
      startDate, endDate,
      sortBy = 'issueDate', sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (patient) filter.patient = patient;

    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { patientName:   { $regex: search, $options: 'i' } },
        { patientId:     { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      filter.issueDate = {};
      if (startDate) filter.issueDate.$gte = new Date(startDate);
      if (endDate)   filter.issueDate.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('patient', 'name patientId contact')
        .populate('createdBy', 'name role')
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-lineItems -payments'), // exclude heavy fields from list
      Invoice.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: invoices,
      pagination: {
        total, page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET SINGLE INVOICE
// ─────────────────────────────────────────────────────────────
const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('patient', 'name patientId contact address')
      .populate('appointment', 'appointmentId date timeSlot type')
      .populate('createdBy', 'name role')
      .populate('payments.recordedBy', 'name');

    if (!invoice) return next(new AppError('Invoice not found', 404));
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// CREATE INVOICE
// ─────────────────────────────────────────────────────────────
const createInvoice = async (req, res, next) => {
  try {
    const {
      patientId, appointmentId, lineItems = [],
      insurance, notes, internalNotes, dueDate
    } = req.body;

    // Validate patient
    const patient = await Patient.findById(patientId);
    if (!patient) return next(new AppError('Patient not found', 404));

    const invoice = new Invoice({
      patient:      patientId,
      appointment:  appointmentId || undefined,
      patientName:  patient.name,
      patientId:    patient.patientId,
      lineItems,
      insurance:    insurance || {},
      notes,
      internalNotes,
      dueDate:      dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdBy:    req.user._id,
      updatedBy:    req.user._id
    });

    // Compute all financial totals
    invoice.recalculate();
    await invoice.save();

    logger.info(`Invoice ${invoice.invoiceNumber} created by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: invoice
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// UPDATE INVOICE (line items, insurance, notes)
// ─────────────────────────────────────────────────────────────
const updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return next(new AppError('Invoice not found', 404));

    // Cannot edit a paid / cancelled invoice's financial data
    if (['paid', 'cancelled', 'refunded'].includes(invoice.status)) {
      // Only allow notes + status updates
      const allowed = ['notes', 'internalNotes', 'status'];
      Object.keys(req.body).forEach(k => {
        if (allowed.includes(k)) invoice[k] = req.body[k];
      });
    } else {
      const { lineItems, insurance, notes, internalNotes, dueDate, status } = req.body;
      if (lineItems)     invoice.lineItems = lineItems;
      if (insurance)     invoice.insurance = insurance;
      if (notes !== undefined)         invoice.notes = notes;
      if (internalNotes !== undefined) invoice.internalNotes = internalNotes;
      if (dueDate)       invoice.dueDate = new Date(dueDate);
      if (status)        invoice.status = status;
      invoice.recalculate();
    }

    invoice.updatedBy = req.user._id;
    await invoice.save();

    res.json({ success: true, message: 'Invoice updated', data: invoice });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// RECORD A PAYMENT
// ─────────────────────────────────────────────────────────────
const recordPayment = async (req, res, next) => {
  try {
    const { amount, method, reference, note } = req.body;

    if (!amount || amount <= 0) {
      return next(new AppError('Valid payment amount required', 400));
    }
    if (!method) {
      return next(new AppError('Payment method required', 400));
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return next(new AppError('Invoice not found', 404));

    if (invoice.status === 'cancelled') {
      return next(new AppError('Cannot record payment on a cancelled invoice', 400));
    }

    // Prevent overpayment
    if (amount > invoice.amountDue + 0.01) {
      return next(new AppError(
        `Payment amount ₹${amount} exceeds amount due ₹${invoice.amountDue}`, 400
      ));
    }

    invoice.payments.push({
      amount: Number(amount),
      method,
      reference: reference || '',
      note: note || '',
      paidAt: new Date(),
      recordedBy: req.user._id
    });

    // Recompute totals and status
    invoice.recalculate();
    invoice.updatedBy = req.user._id;
    await invoice.save();

    logger.info(`Payment ₹${amount} recorded on ${invoice.invoiceNumber} by ${req.user.email}`);

    // Real-time dashboard refresh
    socketManager.pushDashboardRefresh();

    res.json({
      success: true,
      message: `Payment of ₹${amount} recorded`,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        status:       invoice.status,
        amountPaid:   invoice.amountPaid,
        amountDue:    invoice.amountDue,
        grandTotal:   invoice.grandTotal
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// DOWNLOAD INVOICE AS PDF
// ─────────────────────────────────────────────────────────────
const downloadPDF = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('patient', 'name patientId contact address')
      .populate('appointment', 'appointmentId date timeSlot');

    if (!invoice) return next(new AppError('Invoice not found', 404));

    logger.info(`PDF generated for ${invoice.invoiceNumber} by ${req.user.email}`);
    generateInvoicePDF(invoice, res);
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// DELETE INVOICE (admin only, draft/cancelled only)
// ─────────────────────────────────────────────────────────────
const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return next(new AppError('Invoice not found', 404));

    if (!['draft', 'cancelled'].includes(invoice.status)) {
      return next(new AppError(
        'Only draft or cancelled invoices can be deleted. Cancel the invoice first.', 400
      ));
    }

    await invoice.deleteOne();
    logger.warn(`Invoice ${invoice.invoiceNumber} deleted by ${req.user.email}`);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// BILLING STATISTICS — for dashboard / reports
// ─────────────────────────────────────────────────────────────
const getBillingStats = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      statusBreakdown,
      totalRevenue,
      monthlyRevenue,
      recentInvoices,
      overdueInvoices
    ] = await Promise.all([

      // Count by status
      Invoice.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }
      ]),

      // Overall totals
      Invoice.aggregate([
        { $group: {
          _id: null,
          totalBilled:     { $sum: '$grandTotal' },
          totalCollected:  { $sum: '$amountPaid' },
          totalOutstanding:{ $sum: '$amountDue' },
          totalInvoices:   { $sum: 1 }
        }}
      ]),

      // Monthly revenue last 6 months
      Invoice.aggregate([
        { $match: { issueDate: { $gte: startOf6Months }, status: { $ne: 'cancelled' } } },
        { $group: {
          _id: { year: { $year: '$issueDate' }, month: { $month: '$issueDate' } },
          billed:    { $sum: '$grandTotal' },
          collected: { $sum: '$amountPaid' }
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // 5 most recent invoices
      Invoice.find()
        .populate('patient', 'name patientId')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('invoiceNumber patientName grandTotal amountDue status issueDate'),

      // Overdue invoices (past due date, not paid, not cancelled)
      Invoice.countDocuments({
        dueDate: { $lt: now },
        status: { $in: ['sent', 'partially_paid'] }
      })
    ]);

    const totals = totalRevenue[0] || {
      totalBilled: 0, totalCollected: 0, totalOutstanding: 0, totalInvoices: 0
    };

    res.json({
      success: true,
      data: {
        statusBreakdown,
        totals,
        overdueInvoices,
        monthlyRevenue,
        recentInvoices
      }
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET INVOICES FOR A SPECIFIC PATIENT
// ─────────────────────────────────────────────────────────────
const getPatientInvoices = async (req, res, next) => {
  try {
    const invoices = await Invoice.find({ patient: req.params.patientId })
      .sort({ issueDate: -1 })
      .select('invoiceNumber grandTotal amountDue amountPaid status issueDate dueDate');

    const totals = invoices.reduce((acc, inv) => ({
      totalBilled:     acc.totalBilled + inv.grandTotal,
      totalPaid:       acc.totalPaid + inv.amountPaid,
      totalOutstanding:acc.totalOutstanding + inv.amountDue
    }), { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 });

    res.json({ success: true, data: invoices, totals });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// UPDATE INSURANCE STATUS
// ─────────────────────────────────────────────────────────────
const updateInsurance = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return next(new AppError('Invoice not found', 404));

    const { provider, policyNumber, claimNumber, coverageAmount, status, notes } = req.body;

    invoice.insurance = {
      provider:       provider || invoice.insurance?.provider,
      policyNumber:   policyNumber || invoice.insurance?.policyNumber,
      claimNumber:    claimNumber || invoice.insurance?.claimNumber,
      coverageAmount: coverageAmount !== undefined ? Number(coverageAmount) : (invoice.insurance?.coverageAmount || 0),
      status:         status || invoice.insurance?.status || 'not_claimed',
      notes:          notes || invoice.insurance?.notes
    };

    invoice.recalculate();
    invoice.updatedBy = req.user._id;
    await invoice.save();

    res.json({ success: true, message: 'Insurance updated', data: invoice });
  } catch (err) { next(err); }
};

module.exports = {
  getInvoices, getInvoice, createInvoice, updateInvoice,
  recordPayment, downloadPDF, deleteInvoice,
  getBillingStats, getPatientInvoices, updateInsurance
};
