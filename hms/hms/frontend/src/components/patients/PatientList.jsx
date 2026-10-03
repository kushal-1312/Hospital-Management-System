// ── PatientList.js ─────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { patientAPI, userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';

export function PatientList() {
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
    } catch { toast.error('Failed to load patients'); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchPatients(1), 300);
    return () => clearTimeout(t);
  }, [fetchPatients]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete patient "${name}"? This cannot be undone.`)) return;
    try {
      await patientAPI.delete(id);
      toast.success('Patient deleted');
      fetchPatients(pagination.page);
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const handleExport = async () => {
    try {
      const res = await patientAPI.export();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `patients_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click(); window.URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Patients</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {hasRole('admin') && (
            <button className="btn btn-secondary" onClick={handleExport}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          )}
          {hasRole('admin','doctor','nurse') && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Patient</button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box" style={{ flex: 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="form-control" placeholder="Search by name, ID, diagnosis..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {['active','stable','critical','under-observation','discharged'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? <div className="loading-spinner"><div className="spinner"/></div>
          : patients.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:56,height:56,opacity:0.3}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <h3>No patients found</h3>
              <p>Try adjusting your filters or add a new patient</p>
            </div>
          ) : (
            <table>
              <thead><tr><th>Patient</th><th>Age / Gender</th><th>Diagnosis</th><th>Doctor</th><th>Admitted</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.patientId}</div>
                    </td>
                    <td>{p.age} / {p.gender}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.currentDiagnosis || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{p.assignedDoctor?.name || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{p.admissionDate ? format(new Date(p.admissionDate), 'MMM d, yyyy') : '—'}</td>
                    <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/patients/${p._id}`)}>View</button>
                        {hasRole('admin','doctor','nurse') && <button className="btn btn-secondary btn-sm" onClick={() => { setEditPatient(p); setShowForm(true); }}>Edit</button>}
                        {hasRole('admin') && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p._id, p.name)}>Del</button>}
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
            <span className="pagination-info">Showing {((pagination.page-1)*10)+1}–{Math.min(pagination.page*10, pagination.total)} of {pagination.total}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={pagination.page===1} onClick={() => fetchPatients(pagination.page-1)}>‹</button>
              {Array.from({length: Math.min(5, pagination.pages)}, (_,i) => i+1).map(p => (
                <button key={p} className={`page-btn ${p===pagination.page?'active':''}`} onClick={() => fetchPatients(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={pagination.page===pagination.pages} onClick={() => fetchPatients(pagination.page+1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && <PatientFormModal patient={editPatient} onClose={(r) => { setShowForm(false); setEditPatient(null); if(r) fetchPatients(pagination.page); }} />}
    </div>
  );
}

// ── PatientFormModal ────────────────────────────────────────────
function PatientFormModal({ patient, onClose }) {
  const [form, setForm] = useState({ name:'', age:'', gender:'', bloodGroup:'', currentDiagnosis:'', status:'active', contact:{phone:'',email:'',emergencyContact:'',emergencyPhone:''}, address:{street:'',city:'',state:'',zipCode:'',country:'India'}, allergies:'', assignedDoctor:'', ward:'', bedNumber:'' });
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('basic');
  const isEdit = !!patient;

  useEffect(() => {
    userAPI.getDoctors().then(r => setDoctors(r.data.data)).catch(console.error);
    if (patient) setForm({ ...patient, allergies:(patient.allergies||[]).join(', '), contact:patient.contact||{phone:'',email:'',emergencyContact:'',emergencyPhone:''}, address:patient.address||{street:'',city:'',state:'',zipCode:'',country:'India'}, assignedDoctor:patient.assignedDoctor?._id||patient.assignedDoctor||'' });
  }, [patient]);

  const set = (f,v) => setForm(p => ({...p,[f]:v}));
  const setN = (parent,f,v) => setForm(p => ({...p,[parent]:{...p[parent],[f]:v}}));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name||!form.age||!form.gender) return toast.error('Name, age, and gender required');
    setLoading(true);
    try {
      const payload = {...form, age:Number(form.age), allergies:form.allergies?form.allergies.split(',').map(s=>s.trim()).filter(Boolean):[]};
      if (isEdit) { await patientAPI.update(patient._id, payload); toast.success('Patient updated'); }
      else { await patientAPI.create(payload); toast.success('Patient created'); }
      onClose(true);
    } catch (err) { toast.error(err.response?.data?.message||'Operation failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3 className="modal-title">{isEdit?'Edit Patient':'Add New Patient'}</h3>
          <button className="modal-close" onClick={()=>onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="tabs">
              {[['basic','Basic Info'],['contact','Contact'],['medical','Medical']].map(([t,l])=>(
                <button key={t} type="button" className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{l}</button>
              ))}
            </div>
            {tab==='basic' && (
              <>
                <div className="form-row">
                  <div className="form-group"><label>Full Name *</label><input className="form-control" value={form.name} onChange={e=>set('name',e.target.value)} required/></div>
                  <div className="form-group"><label>Age *</label><input type="number" className="form-control" value={form.age} onChange={e=>set('age',e.target.value)} min="0" max="150" required/></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Gender *</label><select className="form-control" value={form.gender} onChange={e=>set('gender',e.target.value)} required><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
                  <div className="form-group"><label>Blood Group</label><select className="form-control" value={form.bloodGroup} onChange={e=>set('bloodGroup',e.target.value)}><option value="">Unknown</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg=><option key={bg} value={bg}>{bg}</option>)}</select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Assigned Doctor</label><select className="form-control" value={form.assignedDoctor} onChange={e=>set('assignedDoctor',e.target.value)}><option value="">Not assigned</option>{doctors.map(d=><option key={d._id} value={d._id}>{d.name} — {d.specialization}</option>)}</select></div>
                  <div className="form-group"><label>Status</label><select className="form-control" value={form.status} onChange={e=>set('status',e.target.value)}>{['active','stable','critical','under-observation','discharged'].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Ward</label><input className="form-control" value={form.ward} onChange={e=>set('ward',e.target.value)} placeholder="e.g. General Ward A"/></div>
                  <div className="form-group"><label>Bed Number</label><input className="form-control" value={form.bedNumber} onChange={e=>set('bedNumber',e.target.value)} placeholder="e.g. B-12"/></div>
                </div>
              </>
            )}
            {tab==='contact' && (
              <>
                <div className="form-row">
                  <div className="form-group"><label>Phone</label><input className="form-control" value={form.contact.phone} onChange={e=>setN('contact','phone',e.target.value)}/></div>
                  <div className="form-group"><label>Email</label><input type="email" className="form-control" value={form.contact.email} onChange={e=>setN('contact','email',e.target.value)}/></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Emergency Contact</label><input className="form-control" value={form.contact.emergencyContact} onChange={e=>setN('contact','emergencyContact',e.target.value)}/></div>
                  <div className="form-group"><label>Emergency Phone</label><input className="form-control" value={form.contact.emergencyPhone} onChange={e=>setN('contact','emergencyPhone',e.target.value)}/></div>
                </div>
                <div className="form-group"><label>Street</label><input className="form-control" value={form.address.street} onChange={e=>setN('address','street',e.target.value)}/></div>
                <div className="form-row-3">
                  <div className="form-group"><label>City</label><input className="form-control" value={form.address.city} onChange={e=>setN('address','city',e.target.value)}/></div>
                  <div className="form-group"><label>State</label><input className="form-control" value={form.address.state} onChange={e=>setN('address','state',e.target.value)}/></div>
                  <div className="form-group"><label>PIN</label><input className="form-control" value={form.address.zipCode} onChange={e=>setN('address','zipCode',e.target.value)}/></div>
                </div>
              </>
            )}
            {tab==='medical' && (
              <>
                <div className="form-group"><label>Current Diagnosis</label><input className="form-control" value={form.currentDiagnosis} onChange={e=>set('currentDiagnosis',e.target.value)}/></div>
                <div className="form-group"><label>Allergies (comma-separated)</label><input className="form-control" value={form.allergies} onChange={e=>set('allergies',e.target.value)} placeholder="Penicillin, Sulfa drugs..."/></div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={()=>onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Saving...':isEdit?'Update Patient':'Create Patient'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PatientList;
