import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { userAPI, authAPI } from '../../services/api';
import { format } from 'date-fns';

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const fetchStaff = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await userAPI.getAll(params);
      setStaff(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load staff'); }
    finally { setLoading(false); }
  }, [search, roleFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchStaff(1), 300);
    return () => clearTimeout(t);
  }, [fetchStaff]);

  const handleToggleActive = async (id, isActive) => {
    try {
      await userAPI.update(id, { isActive: !isActive });
      toast.success(isActive ? 'Staff deactivated' : 'Staff activated');
      fetchStaff(pagination.page);
    } catch { toast.error('Update failed'); }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Staff Management</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Staff Member</button>
      </div>

      <div className="toolbar">
        <div className="search-box" style={{ flex: 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="form-control" placeholder="Search by name, email, department..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="doctor">Doctor</option>
          <option value="nurse">Nurse</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : staff.length === 0 ? (
            <div className="empty-state">
              <h3>No staff members found</h3>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Specialization</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="user-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                          {s.name?.charAt(0)}
                        </div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{s.email}</td>
                    <td><span className={`badge badge-${s.role}`}>{s.role}</span></td>
                    <td style={{ fontSize: '0.82rem' }}>{s.department || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{s.specialization || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{format(new Date(s.createdAt), 'MMM d, yyyy')}</td>
                    <td>
                      <span className={`badge ${s.isActive ? 'badge-active' : 'badge-cancelled'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${s.isActive ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => handleToggleActive(s._id, s.isActive)}
                      >
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="pagination">
            <span className="pagination-info">Total: {pagination.total} staff</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={pagination.page === 1} onClick={() => fetchStaff(pagination.page - 1)}>‹</button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn ${p === pagination.page ? 'active' : ''}`} onClick={() => fetchStaff(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={pagination.page === pagination.pages} onClick={() => fetchStaff(pagination.page + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && <AddStaffModal onClose={(r) => { setShowForm(false); if (r) fetchStaff(1); }} />}
    </div>
  );
}

function AddStaffModal({ onClose }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff', department: '', phone: '', specialization: '' });
  const [loading, setLoading] = useState(false);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authAPI.register(form);
      toast.success('Staff member added');
      onClose(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add staff');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Add Staff Member</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Full Name *</label>
                <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input type="email" className="form-control" value={form.email} onChange={e => set('email', e.target.value)} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Password *</label>
                <input type="password" className="form-control" value={form.password} onChange={e => set('password', e.target.value)} minLength={8} required />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select className="form-control" value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Department</label>
                <input className="form-control" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Cardiology" />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>
            {form.role === 'doctor' && (
              <div className="form-group">
                <label>Specialization</label>
                <input className="form-control" value={form.specialization} onChange={e => set('specialization', e.target.value)} placeholder="e.g. Cardiologist" />
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
