import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { patientAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import PatientForm from './PatientForm';

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPatient, setEditPatient] = useState(null);
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const fetchPatients = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const res = await patientAPI.getAll(params);
      setPatients(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => fetchPatients(1), 300);
    return () => clearTimeout(timer);
  }, [fetchPatients]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete patient "${name}"? This cannot be undone.`)) return;
    try {
      await patientAPI.delete(id);
      toast.success('Patient deleted');
      fetchPatients(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleExport = async () => {
    try {
      const res = await patientAPI.export();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `patients_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleFormClose = (refreshed) => {
    setShowForm(false);
    setEditPatient(null);
    if (refreshed) fetchPatients(pagination.page);
  };

  const statusColors = { active: 'active', stable: 'stable', critical: 'critical', discharged: 'discharged', 'under-observation': 'under-observation' };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Patients</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {hasRole('admin') && (
            <button className="btn btn-secondary" onClick={handleExport}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          )}
          {hasRole('admin', 'doctor', 'nurse') && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Patient
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="form-control"
            placeholder="Search by name, ID, diagnosis..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="stable">Stable</option>
          <option value="critical">Critical</option>
          <option value="under-observation">Under Observation</option>
          <option value="discharged">Discharged</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : patients.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <h3>No patients found</h3>
              <p>Try adjusting your filters or add a new patient</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Age / Gender</th>
                  <th>Diagnosis</th>
                  <th>Doctor</th>
                  <th>Admitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.patientId}</div>
                    </td>
                    <td>{p.age} / {p.gender}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.currentDiagnosis || '—'}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{p.assignedDoctor?.name || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {p.admissionDate ? format(new Date(p.admissionDate), 'MMM d, yyyy') : '—'}
                    </td>
                    <td><span className={`badge badge-${statusColors[p.status] || 'active'}`}>{p.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/patients/${p._id}`)}>View</button>
                        {hasRole('admin', 'doctor', 'nurse') && (
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditPatient(p); setShowForm(true); }}>Edit</button>
                        )}
                        {hasRole('admin') && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p._id, p.name)}>Del</button>
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
              <button className="page-btn" disabled={pagination.page === 1} onClick={() => fetchPatients(pagination.page - 1)}>‹</button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn ${p === pagination.page ? 'active' : ''}`} onClick={() => fetchPatients(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={pagination.page === pagination.pages} onClick={() => fetchPatients(pagination.page + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <PatientForm patient={editPatient} onClose={handleFormClose} />
      )}
    </div>
  );
}
