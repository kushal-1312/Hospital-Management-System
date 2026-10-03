const Medicine = require('../models/Medicine');
const Supplier = require('../models/Supplier');
const Dispensing = require('../models/Dispensing');
const Patient = require('../models/Patient');
const { AppError } = require('../middleware/errorHandler');
const { socketManager } = require('../sockets/socketManager');
const { createAndPush } = require('./notificationController');
const logger = require('../utils/logger');

// ── Helper: push low-stock alerts ─────────────────────────────
const checkAndAlertLowStock = async (medicine) => {
  if (medicine.currentStock <= medicine.reorderLevel) {
    const notification = {
      title: medicine.currentStock === 0 ? '🚫 Medicine Out of Stock' : '⚠️ Low Stock Alert',
      body: `${medicine.name} — Stock: ${medicine.currentStock} ${medicine.unit}${medicine.currentStock === 0 ? ' (OUT OF STOCK)' : ` (reorder at ${medicine.reorderLevel})`}`,
      type: medicine.currentStock === 0 ? 'critical' : 'warning',
      link: '/pharmacy'
    };
    // Notify admins via socket
    socketManager.notifyRole('admin', notification);
    socketManager.notifyRole('staff', notification);
    logger.warn(`Low stock alert: ${medicine.name} (${medicine.currentStock} remaining)`);
  }
};

// ═══════════════════════════════════════════════════════════════
// MEDICINE CRUD
// ═══════════════════════════════════════════════════════════════

const getMedicines = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 15, search, category,
      lowStock, outOfStock, expiringSoon,
      sortBy = 'name', sortOrder = 'asc'
    } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    if (category) filter.category = category;

    // Stock filters — done via aggregation-style post-filtering
    // We fetch all and filter in JS for virtual support
    let medicines = await Medicine.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .select('-movements -batches'); // exclude heavy arrays from list

    // Apply virtual-based filters
    if (lowStock === 'true') {
      medicines = medicines.filter(m => m.currentStock > 0 && m.currentStock <= m.reorderLevel);
    }
    if (outOfStock === 'true') {
      medicines = medicines.filter(m => m.currentStock === 0);
    }
    if (expiringSoon === 'true') {
      const threshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      medicines = medicines.filter(m =>
        m.batches?.some(b => b.quantity > 0 && b.expiryDate && new Date(b.expiryDate) <= threshold)
      );
    }

    const total = medicines.length;
    const page_ = Number(page);
    const limit_ = Number(limit);
    const paginated = medicines.slice((page_ - 1) * limit_, page_ * limit_);

    res.json({
      success: true,
      data: paginated,
      pagination: { total, page: page_, limit: limit_, pages: Math.ceil(total / limit_) }
    });
  } catch (err) { next(err); }
};

const getMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id)
      .populate('batches.supplier', 'name')
      .populate('movements.performedBy', 'name')
      .populate('movements.patient', 'name patientId');

    if (!medicine) return next(new AppError('Medicine not found', 404));
    res.json({ success: true, data: medicine });
  } catch (err) { next(err); }
};

const createMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.create({
      ...req.body,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    logger.info(`Medicine created: ${medicine.name} by ${req.user.email}`);
    res.status(201).json({ success: true, message: 'Medicine added to inventory', data: medicine });
  } catch (err) { next(err); }
};

const updateMedicine = async (req, res, next) => {
  try {
    // Don't allow direct stock editing — must use stock-in/out endpoints
    delete req.body.currentStock;
    delete req.body.movements;
    delete req.body.batches;

    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!medicine) return next(new AppError('Medicine not found', 404));
    res.json({ success: true, message: 'Medicine updated', data: medicine });
  } catch (err) { next(err); }
};

const deleteMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return next(new AppError('Medicine not found', 404));

    if (medicine.currentStock > 0) {
      return next(new AppError(
        `Cannot delete medicine with ${medicine.currentStock} units in stock. Adjust stock to zero first.`, 400
      ));
    }

    await medicine.deleteOne();
    res.json({ success: true, message: 'Medicine removed from inventory' });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
// STOCK MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * @desc  Add stock (purchase / return / adjustment)
 * @route POST /api/pharmacy/medicines/:id/stock-in
 */
const stockIn = async (req, res, next) => {
  try {
    const { quantity, reason, reference, batchNumber, expiryDate,
            costPrice, sellingPrice, supplierId } = req.body;

    if (!quantity || quantity <= 0) {
      return next(new AppError('Valid quantity required', 400));
    }

    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return next(new AppError('Medicine not found', 404));

    // Add to movement log
    medicine.addStock(
      Number(quantity), reason || 'purchase',
      req.user._id, req.user.name, reference
    );

    // Add batch if expiry date provided
    if (expiryDate) {
      let supplierName;
      if (supplierId) {
        const supplier = await Supplier.findById(supplierId);
        supplierName = supplier?.name;
      }
      medicine.batches.push({
        batchNumber: batchNumber || `BATCH-${Date.now()}`,
        quantity: Number(quantity),
        expiryDate: new Date(expiryDate),
        costPrice, sellingPrice,
        supplier: supplierId,
        supplierName,
        receivedBy: req.user._id
      });
    }

    medicine.updatedBy = req.user._id;
    if (costPrice)   medicine.costPrice   = Number(costPrice);
    if (sellingPrice) medicine.sellingPrice = Number(sellingPrice);

    await medicine.save();

    // Dashboard refresh for stock watchers
    socketManager.pushDashboardRefresh();

    logger.info(`Stock IN: ${quantity} × ${medicine.name} — by ${req.user.email}`);

    res.json({
      success: true,
      message: `${quantity} ${medicine.unit}(s) added to stock`,
      data: { currentStock: medicine.currentStock, medicineName: medicine.name }
    });
  } catch (err) { next(err); }
};

/**
 * @desc  Adjust stock (damaged, expired, manual correction)
 * @route POST /api/pharmacy/medicines/:id/adjust
 */
const adjustStock = async (req, res, next) => {
  try {
    const { newStock, reason } = req.body;
    if (newStock === undefined || newStock < 0) {
      return next(new AppError('Valid stock level required', 400));
    }

    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return next(new AppError('Medicine not found', 404));

    const diff = Number(newStock) - medicine.currentStock;
    const movType = diff >= 0 ? 'in' : 'out';

    medicine.currentStock = Number(newStock);
    medicine.movements.push({
      type: 'adjustment',
      quantity: Math.abs(diff),
      reason: reason || `Manual adjustment (${diff >= 0 ? '+' : ''}${diff})`,
      performedBy: req.user._id,
      performedByName: req.user.name,
      balanceAfter: Number(newStock)
    });
    if (medicine.movements.length > 200) medicine.movements = medicine.movements.slice(-200);

    medicine.updatedBy = req.user._id;
    await medicine.save();

    await checkAndAlertLowStock(medicine);
    socketManager.pushDashboardRefresh();

    res.json({ success: true, message: 'Stock adjusted', data: { currentStock: medicine.currentStock } });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
// DISPENSING
// ═══════════════════════════════════════════════════════════════

/**
 * @desc  Dispense medicines to a patient
 * @route POST /api/pharmacy/dispense
 */
const dispense = async (req, res, next) => {
  try {
    const { patientId, appointmentId, prescribedById, prescribedByName, items, paymentMethod, notes } = req.body;

    if (!items || items.length === 0) {
      return next(new AppError('No items to dispense', 400));
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return next(new AppError('Patient not found', 404));

    // Validate all medicines exist and have sufficient stock before touching anything
    const medicineChecks = await Promise.all(
      items.map(async (item) => {
        const med = await Medicine.findById(item.medicineId);
        if (!med) throw new AppError(`Medicine ${item.medicineId} not found`, 404);
        if (med.currentStock < item.quantity) {
          throw new AppError(
            `Insufficient stock for ${med.name}. Available: ${med.currentStock}, Requested: ${item.quantity}`, 400
          );
        }
        return med;
      })
    );

    // Deduct stock from each medicine
    const dispensedItems = [];
    let subtotal = 0;

    for (let i = 0; i < items.length; i++) {
      const med = medicineChecks[i];
      const item = items[i];
      const unitPrice = item.unitPrice || med.sellingPrice || 0;
      const totalPrice = unitPrice * item.quantity;

      med.deductStock(
        item.quantity, 'dispensed',
        req.user._id, req.user.name,
        patientId, patient.name,
        `Dispensed to ${patient.name}`
      );
      med.updatedBy = req.user._id;
      await med.save();

      // Check if this deduction triggered a low-stock alert
      await checkAndAlertLowStock(med);

      dispensedItems.push({
        medicine: med._id,
        medicineName: med.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        instructions: item.instructions
      });
      subtotal += totalPrice;
    }

    const discount = Number(req.body.discount) || 0;
    const totalAmount = Math.max(0, subtotal - discount);

    // Create dispensing record
    const record = await Dispensing.create({
      patient: patientId,
      patientName: patient.name,
      appointment: appointmentId,
      prescribedBy: prescribedById,
      prescribedByName,
      items: dispensedItems,
      subtotal, discount, totalAmount,
      paymentMethod: paymentMethod || 'cash',
      notes,
      dispensedBy: req.user._id,
      status: 'dispensed'
    });

    logger.info(`Dispensed ${items.length} medicines to ${patient.name} — by ${req.user.email}`);
    socketManager.pushDashboardRefresh();

    res.status(201).json({
      success: true,
      message: `${items.length} medicine(s) dispensed successfully`,
      data: { dispensingId: record.dispensingId, totalAmount, status: record.status }
    });
  } catch (err) { next(err); }
};

/**
 * @desc  Get dispensing records
 * @route GET /api/pharmacy/dispensing
 */
const getDispensingRecords = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, patient, startDate, endDate } = req.query;
    const filter = {};
    if (patient) filter.patient = patient;
    if (startDate || endDate) {
      filter.dispensedAt = {};
      if (startDate) filter.dispensedAt.$gte = new Date(startDate);
      if (endDate)   filter.dispensedAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      Dispensing.find(filter)
        .populate('patient', 'name patientId')
        .populate('dispensedBy', 'name')
        .populate('prescribedBy', 'name')
        .sort({ dispensedAt: -1 })
        .skip(skip).limit(Number(limit)),
      Dispensing.countDocuments(filter)
    ]);

    res.json({ success: true, data: records, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════════

const getSuppliers = async (req, res, next) => {
  try {
    const { search, isActive } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { contactPerson: { $regex: search, $options: 'i' } }
    ];
    const suppliers = await Supplier.find(filter).sort({ name: 1 });
    res.json({ success: true, data: suppliers });
  } catch (err) { next(err); }
};

const createSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, message: 'Supplier added', data: supplier });
  } catch (err) { next(err); }
};

const updateSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!supplier) return next(new AppError('Supplier not found', 404));
    res.json({ success: true, message: 'Supplier updated', data: supplier });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
// PHARMACY STATS / DASHBOARD
// ═══════════════════════════════════════════════════════════════

const getPharmacyStats = async (req, res, next) => {
  try {
    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [
      totalMedicines,
      lowStockMedicines,
      outOfStock,
      expiringBatches,
      categoryBreakdown,
      recentDispensing,
      topDispensed
    ] = await Promise.all([
      Medicine.countDocuments({ isActive: true }),
      Medicine.countDocuments({ isActive: true, $expr: { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderLevel'] }] } }),
      Medicine.countDocuments({ isActive: true, currentStock: 0 }),
      // Expiring batches: medicines with at least one batch expiring in 30 days
      Medicine.countDocuments({
        isActive: true,
        batches: { $elemMatch: { quantity: { $gt: 0 }, expiryDate: { $lte: in30Days } } }
      }),
      Medicine.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 }, totalStock: { $sum: '$currentStock' } } },
        { $sort: { count: -1 } }
      ]),
      Dispensing.find().sort({ dispensedAt: -1 }).limit(5)
        .populate('patient', 'name patientId')
        .populate('dispensedBy', 'name')
        .select('dispensingId patientName items totalAmount dispensedAt status'),
      // Top 5 most dispensed medicines in last 30 days
      Dispensing.aggregate([
        { $match: { dispensedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.medicineName', totalQty: { $sum: '$items.quantity' }, totalRevenue: { $sum: '$items.totalPrice' } } },
        { $sort: { totalQty: -1 } },
        { $limit: 5 }
      ])
    ]);

    // Medicines that need reorder (low stock list)
    const needsReorder = await Medicine.find({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$reorderLevel'] }
    })
      .sort({ currentStock: 1 })
      .limit(10)
      .select('name currentStock reorderLevel unit category');

    res.json({
      success: true,
      data: {
        summary: { totalMedicines, lowStockMedicines, outOfStock, expiringBatches },
        categoryBreakdown,
        needsReorder,
        recentDispensing,
        topDispensed
      }
    });
  } catch (err) { next(err); }
};

module.exports = {
  getMedicines, getMedicine, createMedicine, updateMedicine, deleteMedicine,
  stockIn, adjustStock,
  dispense, getDispensingRecords,
  getSuppliers, createSupplier, updateSupplier,
  getPharmacyStats
};
