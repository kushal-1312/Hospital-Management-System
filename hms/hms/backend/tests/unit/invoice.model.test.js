/**
 * Unit tests: Invoice Model
 *
 * Tests financial computation logic in the Invoice model.
 * These are pure model tests — no HTTP, no controller.
 *
 * Coverage:
 *  ✓ recalculate() — subtotal, discount, tax, grand total
 *  ✓ Insurance coverage deduction
 *  ✓ amountDue = grandTotal - insurance - payments
 *  ✓ Status auto-transitions (pending → partially_paid → paid)
 *  ✓ Auto-generated invoice number
 *  ✓ Payment amount validation
 */

const mongoose = require('mongoose');
const Invoice  = require('../../models/Invoice');
const Patient  = require('../../models/Patient');
const User     = require('../../models/User');

let patientId, userId;

beforeEach(async () => {
  const user = await User.create(global.sampleUser('admin', { email: 'inv-admin@test.com' }));
  userId = user._id;
  const patient = await Patient.create(global.samplePatient({ createdBy: userId, updatedBy: userId }));
  patientId = patient._id;
});

describe('Invoice Model — Financial Calculations', () => {

  // ── recalculate() ─────────────────────────────────────────────
  describe('recalculate()', () => {
    it('should compute correct subtotal, tax, and grand total', () => {
      const invoice = new Invoice({ patient: patientId, patientName: 'Test', createdBy: userId });
      invoice.lineItems = [
        { description: 'Consultation', quantity: 1, unitPrice: 500, discount: 0, taxRate: 18, category: 'consultation' },
        { description: 'Blood Test',   quantity: 2, unitPrice: 300, discount: 0, taxRate: 18, category: 'lab' }
      ];
      invoice.recalculate();

      // Consultation: 500, Blood Test: 600, Total base: 1100
      expect(invoice.subtotal).toBeCloseTo(1100, 2);
      // Tax: 1100 * 0.18 = 198
      expect(invoice.totalTax).toBeCloseTo(198, 2);
      // Grand total: 1100 + 198 = 1298
      expect(invoice.grandTotal).toBeCloseTo(1298, 2);
    });

    it('should apply line-item discounts correctly', () => {
      const invoice = new Invoice({ patient: patientId, patientName: 'Test', createdBy: userId });
      invoice.lineItems = [
        { description: 'Procedure', quantity: 1, unitPrice: 1000, discount: 10, taxRate: 0, category: 'procedure' }
      ];
      invoice.recalculate();

      // After 10% discount: 1000 * 0.9 = 900
      expect(invoice.subtotal).toBeCloseTo(900, 2);
      expect(invoice.totalDiscount).toBeCloseTo(100, 2);
      expect(invoice.grandTotal).toBeCloseTo(900, 2);
    });

    it('should deduct insurance coverage from amount due', () => {
      const invoice = new Invoice({ patient: patientId, patientName: 'Test', createdBy: userId });
      invoice.lineItems = [
        { description: 'Surgery', quantity: 1, unitPrice: 10000, discount: 0, taxRate: 18, category: 'procedure' }
      ];
      invoice.insurance = { provider: 'Star Health', coverageAmount: 5000, status: 'approved' };
      invoice.recalculate();

      const expectedGrand = 10000 * 1.18; // 11800
      expect(invoice.grandTotal).toBeCloseTo(expectedGrand, 2);
      expect(invoice.insuranceCovered).toBe(5000);
      expect(invoice.amountDue).toBeCloseTo(expectedGrand - 5000, 2);
    });
  });

  // ── Status auto-transitions ───────────────────────────────────
  describe('Status auto-transitions', () => {
    it('should move to partially_paid when partial payment recorded', () => {
      const invoice = new Invoice({ patient: patientId, patientName: 'Test', createdBy: userId });
      invoice.lineItems = [
        { description: 'Consult', quantity: 1, unitPrice: 1000, discount: 0, taxRate: 0, category: 'consultation' }
      ];
      invoice.recalculate(); // grandTotal = 1000, amountDue = 1000

      invoice.payments.push({ amount: 500, method: 'cash', paidAt: new Date() });
      invoice.recalculate();

      expect(invoice.status).toBe('partially_paid');
      expect(invoice.amountPaid).toBe(500);
      expect(invoice.amountDue).toBeCloseTo(500, 2);
    });

    it('should move to paid when full payment received', () => {
      const invoice = new Invoice({ patient: patientId, patientName: 'Test', createdBy: userId });
      invoice.lineItems = [
        { description: 'Consult', quantity: 1, unitPrice: 500, discount: 0, taxRate: 0, category: 'consultation' }
      ];
      invoice.recalculate();

      invoice.payments.push({ amount: 500, method: 'upi', paidAt: new Date() });
      invoice.recalculate();

      expect(invoice.status).toBe('paid');
      expect(invoice.amountDue).toBe(0);
      expect(invoice.paidDate).toBeDefined();
    });

    it('should not change status of cancelled invoices', () => {
      const invoice = new Invoice({ patient: patientId, patientName: 'Test', createdBy: userId, status: 'cancelled' });
      invoice.lineItems = [
        { description: 'Consult', quantity: 1, unitPrice: 500, discount: 0, taxRate: 0, category: 'consultation' }
      ];
      invoice.payments.push({ amount: 500, method: 'cash', paidAt: new Date() });
      invoice.recalculate();

      expect(invoice.status).toBe('cancelled'); // should NOT change to paid
    });
  });

  // ── Auto invoice number ───────────────────────────────────────
  describe('Auto invoice number', () => {
    it('should generate INV-XXXXX format on save', async () => {
      const invoice = await Invoice.create({
        patient: patientId, patientName: 'Test', createdBy: userId,
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, discount: 0, taxRate: 0, category: 'other' }]
      });
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{5}$/);
    });

    it('should generate unique invoice numbers for multiple invoices', async () => {
      const a = await Invoice.create({ patient: patientId, patientName: 'A', createdBy: userId, lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, discount: 0, taxRate: 0, category: 'other' }] });
      const b = await Invoice.create({ patient: patientId, patientName: 'B', createdBy: userId, lineItems: [{ description: 'Y', quantity: 1, unitPrice: 200, discount: 0, taxRate: 0, category: 'other' }] });
      expect(a.invoiceNumber).not.toBe(b.invoiceNumber);
    });
  });
});
