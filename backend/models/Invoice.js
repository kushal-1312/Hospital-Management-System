const SupabaseModel = require('./SupabaseModel');
const Sequence = require('./Sequence');
const { supabase } = require('../config/supabase');

class Invoice extends SupabaseModel {
  static tableName = 'invoices';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.lineItems = Array.isArray(this.lineItems) ? this.lineItems : [];
    this.payments = Array.isArray(this.payments) ? this.payments : [];
    this.insurance = this.insurance || { coverageAmount: 0, status: 'not_claimed' };
    this.status = this.status || 'draft';
    this.subtotal = Number(this.subtotal) || 0;
    this.totalDiscount = Number(this.totalDiscount) || 0;
    this.totalTax = Number(this.totalTax) || 0;
    this.grandTotal = Number(this.grandTotal) || 0;
    this.insuranceCovered = Number(this.insuranceCovered) || 0;
    this.amountPaid = Number(this.amountPaid) || 0;
    this.amountDue = Number(this.amountDue) || 0;
    this.issueDate = this.issueDate || new Date().toISOString();
  }

  async _preSave() {
    if (!this.invoiceNumber) {
      try {
        const { data: latest } = await supabase
          .from('invoices')
          .select('invoice_number')
          .order('invoice_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        const initialValue = latest?.invoice_number ? Number(latest.invoice_number.slice(4)) : 0;
        const nextVal = await Sequence.next('invoiceNumber', initialValue);
        this.invoiceNumber = `INV-${String(nextVal).padStart(5, '0')}`;
      } catch (err) {
        this.invoiceNumber = `INV-${String(Date.now()).slice(-5)}`;
      }
    }
  }

  recalculate() {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    this.lineItems.forEach(item => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      const disc = Number(item.discount) || 0;
      const tax = Number(item.taxRate) || 0;

      const base = qty * price;
      const discountAmt = base * (disc / 100);
      const afterDiscount = base - discountAmt;
      const taxAmt = afterDiscount * (tax / 100);

      item.lineTotal = Math.round(afterDiscount * 100) / 100;
      subtotal += afterDiscount;
      totalDiscount += discountAmt;
      totalTax += taxAmt;
    });

    this.subtotal = Math.round(subtotal * 100) / 100;
    this.totalDiscount = Math.round(totalDiscount * 100) / 100;
    this.totalTax = Math.round(totalTax * 100) / 100;
    this.grandTotal = Math.round((subtotal + totalTax) * 100) / 100;

    this.insuranceCovered = Number(this.insurance?.coverageAmount) || 0;
    this.amountPaid = this.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    this.amountDue = Math.max(0, Math.round((this.grandTotal - this.insuranceCovered - this.amountPaid) * 100) / 100);

    if (this.status !== 'cancelled' && this.status !== 'refunded') {
      if (this.amountDue <= 0 && this.amountPaid > 0) {
        this.status = 'paid';
        if (!this.paidDate) this.paidDate = new Date().toISOString();
      } else if (this.amountPaid > 0) {
        this.status = 'partially_paid';
      }
    }
  }
}

module.exports = Invoice;
