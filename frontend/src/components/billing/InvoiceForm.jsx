import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { patientAPI, billingAPI } from '../../services/api';

const CATEGORIES = ['consultation', 'procedure', 'medicine', 'room', 'lab', 'nursing', 'other'];

const emptyItem = () => ({
  description: '', category: 'consultation',
  quantity: 1, unitPrice: '', discount: 0, taxRate: 18
});

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function InvoiceForm({ onClose, patientIdPrefill }) {
  const [patients, setPatients]   = useState([]);
  const [patientId, setPatientId] = useState(patientIdPrefill || '');
  const [lineItems, setLineItems] = useState([emptyItem()]);
  const [insurance, setInsurance] = useState({ provider: '', policyNumber: '', coverageAmount: 0 });
  const [notes, setNotes]         = useState('');
  const [dueDate, setDueDate]     = useState('');
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    patientAPI.getAll({ limit: 200 }).then(r => setPatients(r.data.data)).catch(console.error);
    // Default due date = 30 days from now
    const d = new Date(); d.setDate(d.getDate() + 30);
    setDueDate(d.toISOString().split('T')[0]);
  }, []);

  // ── Line item helpers ──────────────────────────────────────
  const setItem = (idx, field, val) => {
    setLineItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };
  const addItem    = () => setLineItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  // ── Totals computation ────────────────────────────────────
  const computed = lineItems.reduce((acc, it) => {
    const base     = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    const disc     = base * ((Number(it.discount) || 0) / 100);
    const after    = base - disc;
    const tax      = after * ((Number(it.taxRate) || 0) / 100);
    acc.subtotal  += after;
    acc.discount  += disc;
    acc.tax       += tax;
    return acc;
  }, { subtotal: 0, discount: 0, tax: 0 });

  computed.grandTotal        = computed.subtotal + computed.tax;
  computed.insuranceCovered  = Number(insurance.coverageAmount) || 0;
  computed.amountDue         = Math.max(0, computed.grandTotal - computed.insuranceCovered);

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientId) return toast.error('Select a patient');
    if (lineItems.some(it => !it.description || !it.unitPrice)) {
      return toast.error('Fill description and price for all line items');
    }
    setLoading(true);
    try {
      await billingAPI.create({ patientId, lineItems, insurance, notes, dueDate });
      toast.success('Invoice created successfully');
      onClose(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create invoice');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <h3 className="modal-title">New Invoice</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Patient selection */}
            <div className="form-row" style={{ marginBottom: 20 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Patient *</label>
                <select className="form-control" value={patientId} onChange={e => setPatientId(e.target.value)} required>
                  <option value="">Select patient</option>
                  {patients.map(p => (
                    <option key={p._id} value={p._id}>{p.name} — {p.patientId}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Due Date</label>
                <input type="date" className="form-control" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>

            {/* Line items */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label style={{ margin: 0 }}>Line Items *</label>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Item</button>
              </div>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 70px 100px 70px 70px 32px', gap: 6, padding: '6px 8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
                {['Description', 'Category', 'Qty', 'Unit Price', 'Disc %', 'GST %', ''].map(h => (
                  <span key={h} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
                ))}
              </div>

              {lineItems.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 70px 100px 70px 70px 32px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  <input className="form-control" placeholder="e.g. Consultation fee" value={item.description}
                    onChange={e => setItem(idx, 'description', e.target.value)} required />
                  <select className="form-control" value={item.category} onChange={e => setItem(idx, 'category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" className="form-control" value={item.quantity} min="1"
                    onChange={e => setItem(idx, 'quantity', e.target.value)} />
                  <input type="number" className="form-control" placeholder="0.00" value={item.unitPrice} min="0" step="0.01"
                    onChange={e => setItem(idx, 'unitPrice', e.target.value)} required />
                  <input type="number" className="form-control" value={item.discount} min="0" max="100"
                    onChange={e => setItem(idx, 'discount', e.target.value)} />
                  <input type="number" className="form-control" value={item.taxRate} min="0" max="100"
                    onChange={e => setItem(idx, 'taxRate', e.target.value)} />
                  <button type="button" onClick={() => removeItem(idx)}
                    style={{ width: 32, height: 32, border: 'none', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    disabled={lineItems.length === 1}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Insurance */}
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>Insurance Details (optional)</div>
              <div className="form-row-3">
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Provider</label>
                  <input className="form-control" placeholder="e.g. Star Health" value={insurance.provider}
                    onChange={e => setInsurance(p => ({ ...p, provider: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Policy Number</label>
                  <input className="form-control" placeholder="Policy #" value={insurance.policyNumber}
                    onChange={e => setInsurance(p => ({ ...p, policyNumber: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Coverage Amount (₹)</label>
                  <input type="number" className="form-control" placeholder="0.00" min="0" step="0.01"
                    value={insurance.coverageAmount}
                    onChange={e => setInsurance(p => ({ ...p, coverageAmount: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label>Notes (visible on invoice)</label>
              <textarea className="form-control" rows={2} value={notes}
                onChange={e => setNotes(e.target.value)} placeholder="Any payment terms or special instructions..." />
            </div>

            {/* Live totals summary */}
            <div style={{ background: 'var(--primary-50)', border: '1px solid rgba(10,110,94,0.2)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, textAlign: 'center' }}>
                {[
                  ['Subtotal',   fmt(computed.subtotal)],
                  ['Discount',   fmt(computed.discount)],
                  ['GST / Tax',  fmt(computed.tax)],
                  ['Grand Total', fmt(computed.grandTotal)],
                  ['Amount Due',  fmt(computed.amountDue)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary-dark)', marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
