import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { billingAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const STATUS_STYLES = {
  draft:          { bg: '#f3f4f6', color: '#6b7280' },
  sent:           { bg: '#e0f2fe', color: '#0284c7' },
  partially_paid: { bg: '#fef3c7', color: '#d97706' },
  paid:           { bg: '#d1fae5', color: '#059669' },
  cancelled:      { bg: '#fee2e2', color: '#dc2626' },
  refunded:       { bg: '#ede9fe', color: '#7c3aed' },
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchInvoice = async () => {
    try {
      const res = await billingAPI.getOne(id);
      setInvoice(res.data.data);
    } catch { toast.error('Invoice not found'); navigate('/billing'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchInvoice(); }, [id]);

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const res = await billingAPI.downloadPDF(id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoice.invoiceNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch { toast.error('PDF generation failed'); }
    finally { setPdfLoading(false); }
  };

  const handleStatusChange = async (newStatus) => {
    if (!window.confirm(`Change invoice status to "${newStatus}"?`)) return;
    try {
      await billingAPI.update(id, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchInvoice();
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!invoice) return null;

  const statusStyle = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;
  const isOverdue = invoice.amountDue > 0 && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const canRecordPayment = !['paid', 'cancelled', 'refunded'].includes(invoice.status) && invoice.amountDue > 0;

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/billing')}>← Back</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{invoice.invoiceNumber}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Patient: {invoice.patientName} · Issued {format(new Date(invoice.issueDate), 'dd MMM yyyy')}
          </p>
        </div>

        {/* Status badge */}
        <span style={{ ...statusStyle, padding: '6px 16px', borderRadius: 50, fontSize: '0.85rem', fontWeight: 700, textTransform: 'capitalize' }}>
          {invoice.status.replace('_', ' ')}
          {isOverdue && <span style={{ marginLeft: 8, background: 'var(--danger)', color: '#fff', borderRadius: 4, fontSize: '0.65rem', padding: '1px 6px' }}>OVERDUE</span>}
        </span>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {canRecordPayment && hasRole('admin', 'staff') && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowPaymentModal(true)}>
              💳 Record Payment
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadPDF} disabled={pdfLoading}>
            {pdfLoading ? 'Generating...' : '↓ PDF'}
          </button>
          {hasRole('admin', 'staff') && invoice.status === 'draft' && (
            <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange('sent')}>
              Send Invoice
            </button>
          )}
          {hasRole('admin') && !['cancelled', 'paid', 'refunded'].includes(invoice.status) && (
            <button className="btn btn-danger btn-sm" onClick={() => handleStatusChange('cancelled')}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Financial summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Grand Total',     value: fmt(invoice.grandTotal),    color: 'var(--primary)' },
          { label: 'Amount Paid',     value: fmt(invoice.amountPaid),    color: 'var(--success)' },
          { label: 'Insurance',       value: fmt(invoice.insuranceCovered), color: 'var(--info)' },
          { label: 'Amount Due',      value: fmt(invoice.amountDue),     color: invoice.amountDue > 0 ? 'var(--danger)' : 'var(--success)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['details','Line Items'], ['payments','Payments'], ['insurance','Insurance']].map(([t, l]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ── Line Items ─────────────────────────────────────── */}
      {tab === 'details' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Line Items</span></div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Description</th><th>Category</th><th>Qty</th>
                  <th>Unit Price</th><th>Disc %</th><th>GST %</th><th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems?.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{item.description}</td>
                    <td><span style={{ background: 'var(--bg)', borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem', textTransform: 'capitalize' }}>{item.category}</span></td>
                    <td>{item.quantity}</td>
                    <td>{fmt(item.unitPrice)}</td>
                    <td>{item.discount || 0}%</td>
                    <td>{item.taxRate || 0}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', padding: '10px 16px' }}>Subtotal</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px' }}>{fmt(invoice.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', color: 'var(--text-muted)', padding: '4px 16px', fontSize: '0.85rem' }}>Discount</td>
                  <td style={{ textAlign: 'right', padding: '4px 16px', fontSize: '0.85rem', color: 'var(--success)' }}>- {fmt(invoice.totalDiscount)}</td>
                </tr>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', color: 'var(--text-muted)', padding: '4px 16px', fontSize: '0.85rem' }}>GST / Tax</td>
                  <td style={{ textAlign: 'right', padding: '4px 16px', fontSize: '0.85rem' }}>{fmt(invoice.totalTax)}</td>
                </tr>
                {invoice.insuranceCovered > 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'right', color: 'var(--info)', padding: '4px 16px', fontSize: '0.85rem' }}>Insurance Covered</td>
                    <td style={{ textAlign: 'right', padding: '4px 16px', fontSize: '0.85rem', color: 'var(--info)' }}>- {fmt(invoice.insuranceCovered)}</td>
                  </tr>
                )}
                <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px' }}>Grand Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '12px 16px', fontSize: '1.1rem' }}>{fmt(invoice.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {invoice.notes && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <strong>Notes:</strong> {invoice.notes}
            </div>
          )}
        </div>
      )}

      {/* ── Payments ──────────────────────────────────────── */}
      {tab === 'payments' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Payment History</span>
            {canRecordPayment && hasRole('admin', 'staff') && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowPaymentModal(true)}>
                + Record Payment
              </button>
            )}
          </div>
          <div className="table-wrapper">
            {!invoice.payments?.length ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <p>No payments recorded yet.</p>
              </div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Note</th><th>Recorded By</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {invoice.payments.map((pmt, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: '0.85rem' }}>{pmt.paidAt ? format(new Date(pmt.paidAt), 'dd MMM yyyy, h:mm a') : '—'}</td>
                      <td><span style={{ background: 'var(--bg)', borderRadius: 4, padding: '2px 10px', fontSize: '0.75rem', textTransform: 'capitalize', fontWeight: 600 }}>{pmt.method?.replace('_', ' ')}</span></td>
                      <td style={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>{pmt.reference || '—'}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{pmt.note || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{pmt.recordedBy?.name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmt(pmt.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--success-light)' }}>
                    <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: 'var(--success)' }}>Total Paid</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: 'var(--success)', fontSize: '1.05rem' }}>{fmt(invoice.amountPaid)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Insurance ─────────────────────────────────────── */}
      {tab === 'insurance' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Insurance Details</span>
            {hasRole('admin', 'staff') && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowInsuranceModal(true)}>
                Edit Insurance
              </button>
            )}
          </div>
          <div className="card-body">
            {!invoice.insurance?.provider ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <p>No insurance claim associated with this invoice.</p>
                {hasRole('admin', 'staff') && (
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowInsuranceModal(true)}>
                    Add Insurance Details
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  ['Provider',        invoice.insurance.provider],
                  ['Policy Number',   invoice.insurance.policyNumber],
                  ['Claim Number',    invoice.insurance.claimNumber],
                  ['Coverage Amount', fmt(invoice.insurance.coverageAmount)],
                  ['Status',          invoice.insurance.status?.replace('_', ' ')],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, marginTop: 4 }}>{value || '—'}</div>
                  </div>
                ))}
                {invoice.insurance.notes && (
                  <div style={{ gridColumn: '1 / -1', padding: '12px 0' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</div>
                    <div style={{ fontSize: '0.9rem', marginTop: 4 }}>{invoice.insurance.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal invoice={invoice} onClose={(refreshed) => {
          setShowPaymentModal(false);
          if (refreshed) fetchInvoice();
        }} />
      )}

      {/* Insurance Modal */}
      {showInsuranceModal && (
        <InsuranceModal invoice={invoice} onClose={(refreshed) => {
          setShowInsuranceModal(false);
          if (refreshed) fetchInvoice();
        }} />
      )}
    </div>
  );
}

// ── Payment Recording Modal ──────────────────────────────────
function PaymentModal({ invoice, onClose }) {
  const [form, setForm] = useState({ amount: invoice.amountDue, method: 'cash', reference: '', note: '' });
  const [loading, setLoading] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await billingAPI.recordPayment(invoice._id, form);
      toast.success(`Payment of ₹${form.amount} recorded`);
      onClose(true);
    } catch (err) { toast.error(err.response?.data?.message || 'Payment failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Record Payment</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ background: 'var(--primary-50)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Amount Due</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.1rem' }}>₹{invoice.amountDue?.toLocaleString('en-IN')}</span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Amount (₹) *</label>
                <input type="number" className="form-control" value={form.amount} min="0.01" max={invoice.amountDue} step="0.01"
                  onChange={e => set('amount', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Payment Method *</label>
                <select className="form-control" value={form.method} onChange={e => set('method', e.target.value)}>
                  {['cash','card','upi','bank_transfer','insurance','cheque'].map(m => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Reference / Transaction ID</label>
              <input className="form-control" placeholder="UPI ref, cheque no., etc." value={form.reference}
                onChange={e => set('reference', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Note</label>
              <input className="form-control" placeholder="Optional note" value={form.note}
                onChange={e => set('note', e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Insurance Edit Modal ─────────────────────────────────────
function InsuranceModal({ invoice, onClose }) {
  const [form, setForm] = useState({
    provider:       invoice.insurance?.provider || '',
    policyNumber:   invoice.insurance?.policyNumber || '',
    claimNumber:    invoice.insurance?.claimNumber || '',
    coverageAmount: invoice.insurance?.coverageAmount || 0,
    status:         invoice.insurance?.status || 'not_claimed',
    notes:          invoice.insurance?.notes || ''
  });
  const [loading, setLoading] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await billingAPI.updateInsurance(invoice._id, form);
      toast.success('Insurance details updated');
      onClose(true);
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Insurance Details</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group"><label>Provider</label><input className="form-control" value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="e.g. Star Health" /></div>
              <div className="form-group"><label>Policy Number</label><input className="form-control" value={form.policyNumber} onChange={e => set('policyNumber', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Claim Number</label><input className="form-control" value={form.claimNumber} onChange={e => set('claimNumber', e.target.value)} /></div>
              <div className="form-group"><label>Coverage Amount (₹)</label><input type="number" className="form-control" min="0" step="0.01" value={form.coverageAmount} onChange={e => set('coverageAmount', e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Claim Status</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
                {['not_claimed','submitted','approved','rejected','partial'].map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group"><label>Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
