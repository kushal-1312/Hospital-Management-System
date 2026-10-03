import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { pharmacyAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = ['tablet','capsule','syrup','injection','cream','drops','inhaler','patch','powder','other'];

export default function MedicineList({ onRefresh }) {
  const [medicines, setMedicines] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(null); // medicine object
  const { hasRole } = useAuth();

  const fetch = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (search)      params.search = search;
      if (category)    params.category = category;
      if (stockFilter === 'low')    params.lowStock = 'true';
      if (stockFilter === 'out')    params.outOfStock = 'true';
      if (stockFilter === 'expiring') params.expiringSoon = 'true';
      const res = await pharmacyAPI.getMedicines(params);
      setMedicines(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load medicines'); }
    finally { setLoading(false); }
  }, [search, category, stockFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetch(1), 300);
    return () => clearTimeout(t);
  }, [fetch]);

  const stockColor = (m) => {
    if (m.currentStock === 0) return 'var(--danger)';
    if (m.currentStock <= m.reorderLevel) return 'var(--warning)';
    return 'var(--success)';
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {pagination.total} medicines in inventory
        </span>
        {hasRole('admin', 'staff') && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Add Medicine</button>
        )}
      </div>

      {/* Filters */}
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search-box" style={{ flex: 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="form-control" placeholder="Search medicine name, brand, generic..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>)}
        </select>
        <select className="filter-select" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
          <option value="">All Stock Levels</option>
          <option value="low">⚠️ Low Stock</option>
          <option value="out">🚫 Out of Stock</option>
          <option value="expiring">⏰ Expiring Soon</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? <div className="loading-spinner"><div className="spinner" /></div>
          : medicines.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>💊</div>
              <h3>No medicines found</h3>
              <p>Add medicines to begin tracking inventory</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Medicine</th><th>Category</th><th>Strength</th>
                  <th>Current Stock</th><th>Reorder At</th><th>Selling Price</th>
                  <th>Nearest Expiry</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map(m => {
                  const nearExpiry = m.nearestExpiry ? new Date(m.nearestExpiry) : null;
                  const expiringSoon = nearExpiry && nearExpiry <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  return (
                    <tr key={m._id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                        {m.brand && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.brand}</div>}
                      </td>
                      <td>
                        <span style={{ background: 'var(--bg)', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600, textTransform: 'capitalize' }}>
                          {m.category}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{m.strength || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: stockColor(m) }}>
                          {m.currentStock} {m.unit}
                        </div>
                        {m.currentStock === 0 && <div style={{ fontSize: '0.68rem', color: 'var(--danger)', fontWeight: 600 }}>OUT OF STOCK</div>}
                        {m.currentStock > 0 && m.currentStock <= m.reorderLevel && <div style={{ fontSize: '0.68rem', color: 'var(--warning)', fontWeight: 600 }}>LOW STOCK</div>}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{m.reorderLevel} {m.unit}</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {m.sellingPrice > 0 ? `₹${m.sellingPrice}` : '—'}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: expiringSoon ? 'var(--danger)' : 'var(--text-secondary)' }}>
                        {nearExpiry ? (
                          <span>
                            {format(nearExpiry, 'MMM yyyy')}
                            {expiringSoon && <span style={{ marginLeft: 4, background: 'var(--danger)', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: '0.65rem' }}>SOON</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {hasRole('admin', 'staff') && (
                            <button className="btn btn-primary btn-sm" onClick={() => setShowStockModal(m)} title="Add stock">
                              + Stock
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="pagination">
            <span className="pagination-info">Total: {pagination.total}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={pagination.page === 1} onClick={() => fetch(pagination.page - 1)}>‹</button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn ${p === pagination.page ? 'active' : ''}`} onClick={() => fetch(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={pagination.page === pagination.pages} onClick={() => fetch(pagination.page + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* Add Medicine Modal */}
      {showAddModal && <AddMedicineModal onClose={(r) => { setShowAddModal(false); if (r) { fetch(1); onRefresh?.(); } }} />}

      {/* Stock In Modal */}
      {showStockModal && (
        <StockInModal medicine={showStockModal} onClose={(r) => { setShowStockModal(null); if (r) { fetch(pagination.page); onRefresh?.(); } }} />
      )}
    </>
  );
}

// ── Add Medicine Modal ────────────────────────────────────────
function AddMedicineModal({ onClose }) {
  const [form, setForm] = useState({
    name: '', genericName: '', brand: '', category: 'tablet',
    strength: '', unit: 'tablet', packSize: 1,
    currentStock: 0, reorderLevel: 10, maxStock: 1000,
    costPrice: '', sellingPrice: '', gstRate: 12,
    requiresPrescription: false, location: '',
    storageInstructions: 'Store in a cool, dry place below 25°C'
  });
  const [loading, setLoading] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await pharmacyAPI.createMedicine(form);
      toast.success(`${form.name} added to inventory`);
      onClose(true);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add medicine'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3 className="modal-title">Add Medicine to Inventory</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group"><label>Medicine Name *</label><input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
              <div className="form-group"><label>Generic Name</label><input className="form-control" value={form.genericName} onChange={e => set('genericName', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Brand</label><input className="form-control" value={form.brand} onChange={e => set('brand', e.target.value)} /></div>
              <div className="form-group"><label>Category *</label>
                <select className="form-control" value={form.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group"><label>Strength</label><input className="form-control" placeholder="e.g. 500mg" value={form.strength} onChange={e => set('strength', e.target.value)} /></div>
              <div className="form-group"><label>Unit</label><input className="form-control" placeholder="tablet, ml..." value={form.unit} onChange={e => set('unit', e.target.value)} /></div>
              <div className="form-group"><label>Location (Shelf)</label><input className="form-control" placeholder="e.g. A-3" value={form.location} onChange={e => set('location', e.target.value)} /></div>
            </div>
            <div className="form-row-3">
              <div className="form-group"><label>Opening Stock</label><input type="number" className="form-control" min="0" value={form.currentStock} onChange={e => set('currentStock', Number(e.target.value))} /></div>
              <div className="form-group"><label>Reorder Level</label><input type="number" className="form-control" min="0" value={form.reorderLevel} onChange={e => set('reorderLevel', Number(e.target.value))} /></div>
              <div className="form-group"><label>Max Stock</label><input type="number" className="form-control" min="0" value={form.maxStock} onChange={e => set('maxStock', Number(e.target.value))} /></div>
            </div>
            <div className="form-row-3">
              <div className="form-group"><label>Cost Price (₹)</label><input type="number" className="form-control" min="0" step="0.01" value={form.costPrice} onChange={e => set('costPrice', e.target.value)} /></div>
              <div className="form-group"><label>Selling Price (₹)</label><input type="number" className="form-control" min="0" step="0.01" value={form.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} /></div>
              <div className="form-group"><label>GST %</label><input type="number" className="form-control" min="0" max="100" value={form.gstRate} onChange={e => set('gstRate', e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.requiresPrescription} onChange={e => set('requiresPrescription', e.target.checked)} />
                Requires prescription
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Medicine'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Stock In Modal ────────────────────────────────────────────
function StockInModal({ medicine, onClose }) {
  const [form, setForm] = useState({ quantity: '', reason: 'purchase', batchNumber: '', expiryDate: '', costPrice: medicine.costPrice || '', sellingPrice: medicine.sellingPrice || '', reference: '' });
  const [loading, setLoading] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.quantity || Number(form.quantity) < 1) return toast.error('Enter quantity');
    setLoading(true);
    try {
      await pharmacyAPI.stockIn(medicine._id, form);
      toast.success(`${form.quantity} ${medicine.unit}(s) added to ${medicine.name}`);
      onClose(true);
    } catch (err) { toast.error(err.response?.data?.message || 'Stock update failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Add Stock — {medicine.name}</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Current Stock</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.1rem' }}>
                {medicine.currentStock} {medicine.unit}
              </span>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Quantity *</label><input type="number" className="form-control" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} required autoFocus /></div>
              <div className="form-group">
                <label>Reason</label>
                <select className="form-control" value={form.reason} onChange={e => set('reason', e.target.value)}>
                  <option value="purchase">Purchase / Delivery</option>
                  <option value="return">Patient Return</option>
                  <option value="transfer">Transfer In</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Batch Number</label><input className="form-control" placeholder="e.g. BN-20241001" value={form.batchNumber} onChange={e => set('batchNumber', e.target.value)} /></div>
              <div className="form-group"><label>Expiry Date *</label><input type="date" className="form-control" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Cost Price (₹)</label><input type="number" className="form-control" min="0" step="0.01" value={form.costPrice} onChange={e => set('costPrice', e.target.value)} /></div>
              <div className="form-group"><label>Selling Price (₹)</label><input type="number" className="form-control" min="0" step="0.01" value={form.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} /></div>
            </div>
            <div className="form-group"><label>Reference / PO Number</label><input className="form-control" placeholder="Purchase order or invoice reference" value={form.reference} onChange={e => set('reference', e.target.value)} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Stock'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
