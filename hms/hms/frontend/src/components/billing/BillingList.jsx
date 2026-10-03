import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { billingAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import InvoiceForm from './InvoiceForm';

const STATUS_STYLES = {
  draft:          { bg: '#f3f4f6', color: '#6b7280' },
  sent:           { bg: '#e0f2fe', color: '#0284c7' },
  partially_paid: { bg: '#fef3c7', color: '#d97706' },
  paid:           { bg: '#d1fae5', color: '#059669' },
  cancelled:      { bg: '#fee2e2', color: '#dc2626' },
  refunded:       { bg: '#ede9fe', color: '#7c3aed' },
};

const StatusBadge = ({ status }) => {
  const style = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{
      background: style.bg, color: style.color,
      padding: '3px 10px', borderRadius: 50,
      fontSize: '0.72rem', fontWeight: 700,
      textTransform: 'capitalize', whiteSpace: 'nowrap'
    }}>
      {status?.replace('_', ' ')}
    </span>
  );
};

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function BillingList() {
  const [invoices, setInvoices]   = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const fetchInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (search)      params.search    = search;
      if (statusFilter) params.status   = statusFilter;
      if (startDate)   params.startDate = startDate;
      if (endDate)     params.endDate   = endDate;
      const res = await billingAPI.getAll(params);
      setInvoices(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }, [search, statusFilter, startDate, endDate]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await billingAPI.getStats();
      setStats(res.data.data);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchInvoices(1), 300);
    return () => clearTimeout(t);
  }, [fetchInvoices]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleDownloadPDF = async (id, invoiceNumber) => {
    try {
      const res = await billingAPI.downloadPDF(id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Invoice PDF downloaded');
    } catch { toast.error('PDF generation failed'); }
  };

  const handleDelete = async (id, invoiceNumber) => {
    if (!window.confirm(`Delete invoice ${invoiceNumber}? This cannot be undone.`)) return;
    try {
      await billingAPI.delete(id);
      toast.success('Invoice deleted');
      fetchInvoices(pagination.page);
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Billing & Invoices</h2>
        {hasRole('admin', 'staff') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + New Invoice
          </button>
        )}
      </div>

      {/* Stats row */}
      {stats?.totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Billed',       value: fmt(stats.totals.totalBilled),       color: 'var(--primary)' },
            { label: 'Total Collected',    value: fmt(stats.totals.totalCollected),    color: 'var(--success)' },
            { label: 'Outstanding',        value: fmt(stats.totals.totalOutstanding),  color: stats.totals.totalOutstanding > 0 ? 'var(--danger)' : 'var(--success)' },
            { label: 'Overdue Invoices',   value: stats.overdueInvoices,              color: stats.overdueInvoices > 0 ? 'var(--danger)' : 'var(--success)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: '18px 22px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="form-control" placeholder="Search invoice #, patient name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {['draft','sent','partially_paid','paid','cancelled','refunded'].map(s => (
            <option key={s} value={s}>{s.replace('_',' ')}</option>
          ))}
        </select>
        <input type="date" className="form-control" style={{ maxWidth: 160 }} value={startDate} onChange={e => setStartDate(e.target.value)} title="From date" />
        <input type="date" className="form-control" style={{ maxWidth: 160 }} value={endDate}   onChange={e => setEndDate(e.target.value)}   title="To date" />
        {(search || statusFilter || startDate || endDate) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setStatusFilter(''); setStartDate(''); setEndDate(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 56, height: 56, opacity: 0.3 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <h3>No invoices found</h3>
              <p>Create your first invoice to get started</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Patient</th>
                  <th>Issue Date</th>
                  <th>Due Date</th>
                  <th>Grand Total</th>
                  <th>Amount Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv._id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}
                        onClick={() => navigate(`/billing/${inv._id}`)}>
                        {inv.invoiceNumber}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inv.patientName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{inv.patient?.patientId || inv.patientId}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{inv.issueDate ? format(new Date(inv.issueDate), 'dd MMM yyyy') : '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: inv.amountDue > 0 && new Date(inv.dueDate) < new Date() ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(inv.grandTotal)}</td>
                    <td style={{ fontWeight: 600, color: inv.amountDue > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {fmt(inv.amountDue)}
                    </td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/billing/${inv._id}`)}>View</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadPDF(inv._id, inv.invoiceNumber)} title="Download PDF">
                          ↓ PDF
                        </button>
                        {hasRole('admin') && ['draft','cancelled'].includes(inv.status) && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(inv._id, inv.invoiceNumber)}>Del</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="pagination">
            <span className="pagination-info">
              Showing {((pagination.page - 1) * 10) + 1}–{Math.min(pagination.page * 10, pagination.total)} of {pagination.total}
            </span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={pagination.page === 1} onClick={() => fetchInvoices(pagination.page - 1)}>‹</button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn ${p === pagination.page ? 'active' : ''}`} onClick={() => fetchInvoices(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={pagination.page === pagination.pages} onClick={() => fetchInvoices(pagination.page + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <InvoiceForm onClose={(refreshed) => {
          setShowForm(false);
          if (refreshed) { fetchInvoices(1); fetchStats(); }
        }} />
      )}
    </div>
  );
}
