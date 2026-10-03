import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { pharmacyAPI } from '../../services/api';
import MedicineList from './MedicineList';
import DispenseForm from './DispenseForm';

export default function PharmacyDashboard() {
  const [tab, setTab]           = useState('overview');
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showDispense, setShowDispense] = useState(false);
  const navigate = useNavigate();

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await pharmacyAPI.getStats();
      setStats(res.data.data);
    } catch { toast.error('Failed to load pharmacy stats'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);

  const { summary, needsReorder = [], recentDispensing = [], topDispensed = [], categoryBreakdown = [] } = stats || {};

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Pharmacy & Inventory</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setTab('medicines')}>
            💊 Medicines
          </button>
          <button className="btn btn-primary" onClick={() => setShowDispense(true)}>
            + Dispense Medicines
          </button>
        </div>
      </div>

      {/* Alert banners */}
      {summary?.outOfStock > 0 && (
        <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.2rem' }}>🚫</span>
          <div>
            <strong style={{ color: 'var(--danger)' }}>{summary.outOfStock} medicine(s) are out of stock</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: 8 }}>Immediate restocking required</span>
          </div>
          <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setTab('medicines')}>
            View →
          </button>
        </div>
      )}

      {summary?.expiringBatches > 0 && (
        <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.2rem' }}>⏰</span>
          <div>
            <strong style={{ color: 'var(--warning)' }}>{summary.expiringBatches} batch(es) expiring within 30 days</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: 8 }}>Review and dispose if needed</span>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setTab('medicines')}>
            Review →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {[['overview', 'Overview'], ['medicines', 'Medicine Inventory'], ['dispensing', 'Dispensing Records'], ['suppliers', 'Suppliers']].map(([t, l]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ── Overview tab ──────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Medicines',   value: summary?.totalMedicines || 0,     color: 'var(--primary)',  icon: '💊' },
              { label: 'Low Stock Items',   value: summary?.lowStockMedicines || 0,  color: 'var(--warning)',  icon: '⚠️' },
              { label: 'Out of Stock',      value: summary?.outOfStock || 0,         color: 'var(--danger)',   icon: '🚫' },
              { label: 'Expiring Soon',     value: summary?.expiringBatches || 0,    color: 'var(--accent)',   icon: '⏰' },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('medicines')}>
                <div className="stat-icon" style={{ background: color + '15', fontSize: '1.3rem', width: 48, height: 48 }}>{icon}</div>
                <div className="stat-info">
                  <div className="stat-value" style={{ color }}>{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            {/* Needs Reorder */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">🔴 Needs Reorder</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setTab('medicines')}>View All</button>
              </div>
              <div className="table-wrapper">
                {!needsReorder.length ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--success)', fontSize: '0.85rem' }}>
                    ✅ All medicines are adequately stocked
                  </div>
                ) : (
                  <table>
                    <thead><tr><th>Medicine</th><th>Category</th><th>Stock</th><th>Reorder At</th></tr></thead>
                    <tbody>
                      {needsReorder.map(m => (
                        <tr key={m._id}>
                          <td style={{ fontWeight: 600 }}>{m.name}</td>
                          <td style={{ fontSize: '0.78rem', textTransform: 'capitalize' }}>{m.category}</td>
                          <td>
                            <span style={{ fontWeight: 700, color: m.currentStock === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                              {m.currentStock} {m.unit}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{m.reorderLevel} {m.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Top dispensed */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">📊 Top Dispensed (30 days)</span>
              </div>
              <div className="table-wrapper">
                {!topDispensed.length ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No dispensing data yet</div>
                ) : (
                  <table>
                    <thead><tr><th>Medicine</th><th style={{ textAlign: 'right' }}>Qty Dispensed</th><th style={{ textAlign: 'right' }}>Revenue</th></tr></thead>
                    <tbody>
                      {topDispensed.map((m, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{m._id}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{m.totalQty}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)', fontSize: '0.85rem' }}>
                            ₹{Number(m.totalRevenue || 0).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Recent dispensing */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Dispensing Records</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setTab('dispensing')}>View All</button>
            </div>
            <div className="table-wrapper">
              {!recentDispensing.length ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No dispensing records yet</div>
              ) : (
                <table>
                  <thead><tr><th>ID</th><th>Patient</th><th>Items</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>
                    {recentDispensing.map(r => (
                      <tr key={r._id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--primary)' }}>{r.dispensingId}</td>
                        <td style={{ fontWeight: 600 }}>{r.patientName}</td>
                        <td style={{ fontSize: '0.82rem' }}>{r.items?.length || 0} item(s)</td>
                        <td style={{ fontWeight: 600 }}>₹{Number(r.totalAmount || 0).toLocaleString('en-IN')}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {r.dispensedAt ? format(new Date(r.dispensedAt), 'dd MMM, h:mm a') : '—'}
                        </td>
                        <td><span className={`badge badge-${r.status === 'dispensed' ? 'active' : 'pending'}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Other tabs ────────────────────────────────────── */}
      {tab === 'medicines' && <MedicineList onRefresh={fetchStats} />}
      {tab === 'dispensing' && <DispensingList />}
      {tab === 'suppliers' && <SupplierList />}

      {showDispense && (
        <DispenseForm onClose={(refreshed) => {
          setShowDispense(false);
          if (refreshed) fetchStats();
        }} />
      )}
    </div>
  );
}

// ── Dispensing Records List ────────────────────────────────────
function DispensingList() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);

  useEffect(() => {
    pharmacyAPI.getDispensing({ page, limit: 15 }).then(r => {
      setRecords(r.data.data);
      setTotal(r.data.pagination.total);
    }).catch(() => toast.error('Failed to load records'))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="card-header"><span className="card-title">Dispensing Records</span></div>
      <div className="table-wrapper">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> :
        !records.length ? <div className="empty-state"><p>No dispensing records</p></div> : (
          <table>
            <thead><tr><th>Dispensing ID</th><th>Patient</th><th>Items</th><th>Total</th><th>Method</th><th>Dispensed By</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r._id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--primary)' }}>{r.dispensingId}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.patient?.name || r.patientName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.patient?.patientId}</div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{r.items?.length} item(s)</td>
                  <td style={{ fontWeight: 600 }}>₹{Number(r.totalAmount || 0).toLocaleString('en-IN')}</td>
                  <td><span style={{ textTransform: 'capitalize', fontSize: '0.78rem' }}>{r.paymentMethod?.replace('_', ' ')}</span></td>
                  <td style={{ fontSize: '0.82rem' }}>{r.dispensedBy?.name || '—'}</td>
                  <td style={{ fontSize: '0.78rem' }}>{r.dispensedAt ? format(new Date(r.dispensedAt), 'dd MMM yyyy') : '—'}</td>
                  <td><span className={`badge badge-${r.status === 'dispensed' ? 'active' : 'pending'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Supplier List ─────────────────────────────────────────────
function SupplierList() {
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ name: '', contactPerson: '', phone: '', email: '', gstNumber: '' });
  const [loading, setLoading]     = useState(false);

  const fetch = () => pharmacyAPI.getSuppliers().then(r => setSuppliers(r.data.data)).catch(console.error);
  useEffect(() => { fetch(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await pharmacyAPI.createSupplier(form);
      toast.success('Supplier added');
      setShowForm(false); setForm({ name: '', contactPerson: '', phone: '', email: '', gstNumber: '' });
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="card-header">
        <span className="card-title">Suppliers ({suppliers.length})</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Add Supplier</button>
      </div>
      <div className="table-wrapper">
        {!suppliers.length ? <div className="empty-state"><p>No suppliers added yet</p></div> : (
          <table>
            <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>GST No.</th><th>Status</th></tr></thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s._id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ fontSize: '0.85rem' }}>{s.contactPerson || '—'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{s.phone || '—'}</td>
                  <td style={{ fontSize: '0.82rem' }}>{s.email || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.gstNumber || '—'}</td>
                  <td><span className={`badge badge-${s.isActive ? 'active' : 'cancelled'}`}>{s.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Add Supplier</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group"><label>Supplier Name *</label><input className="form-control" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required /></div>
                  <div className="form-group"><label>Contact Person</label><input className="form-control" value={form.contactPerson} onChange={e => setForm(p => ({...p, contactPerson: e.target.value}))} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} /></div>
                  <div className="form-group"><label>Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} /></div>
                </div>
                <div className="form-group"><label>GST Number</label><input className="form-control" value={form.gstNumber} onChange={e => setForm(p => ({...p, gstNumber: e.target.value}))} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
