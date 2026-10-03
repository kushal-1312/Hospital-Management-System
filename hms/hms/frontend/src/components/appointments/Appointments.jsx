// ── Appointments.js ────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { appointmentAPI, patientAPI, userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';

export function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editAppt, setEditAppt] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const { hasRole } = useAuth();

  const fetchAppointments = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (statusFilter) params.status = statusFilter;
      if (dateFilter) params.date = dateFilter;
      const res = await appointmentAPI.getAll(params);
      setAppointments(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load appointments'); }
    finally { setLoading(false); }
  }, [statusFilter, dateFilter]);

  useEffect(() => { fetchAppointments(1); }, [fetchAppointments]);

  const handleStatusChange = async (id, status) => {
    try {
      await appointmentAPI.update(id, { status });
      toast.success(`Status → ${status}`);
      fetchAppointments(pagination.page);
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this appointment?')) return;
    try { await appointmentAPI.delete(id); toast.success('Deleted'); fetchAppointments(pagination.page); }
    catch { toast.error('Delete failed'); }
  };

  return (
    <div className="page-container">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h2 style={{ fontSize:'1.4rem', fontWeight:700 }}>Appointments</h2>
        <button className="btn btn-primary" onClick={() => { setEditAppt(null); setShowForm(true); }}>+ Schedule</button>
      </div>

      <div className="toolbar">
        <input type="date" className="form-control" style={{ maxWidth:200 }} value={dateFilter} onChange={e => setDateFilter(e.target.value)}/>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {['pending','confirmed','completed','cancelled','no-show'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(dateFilter||statusFilter) && <button className="btn btn-secondary btn-sm" onClick={() => { setDateFilter(''); setStatusFilter(''); }}>Clear</button>}
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? <div className="loading-spinner"><div className="spinner"/></div>
          : appointments.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:56,height:56,opacity:0.3}}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <h3>No appointments found</h3>
            </div>
          ) : (
            <table>
              <thead><tr><th>ID</th><th>Patient</th><th>Doctor</th><th>Date & Time</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a._id}>
                    <td style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{a.appointmentId}</td>
                    <td>
                      <div style={{ fontWeight:600 }}>{a.patient?.name||a.patientName}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{a.patient?.patientId}</div>
                    </td>
                    <td>
                      <div style={{ fontSize:'0.85rem' }}>{a.doctor?.name||a.doctorName}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{a.doctor?.specialization}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight:600 }}>{a.date?format(new Date(a.date),'MMM d, yyyy'):'—'}</div>
                      <div style={{ fontSize:'0.78rem', color:'var(--primary)' }}>{a.timeSlot?.start} – {a.timeSlot?.end}</div>
                    </td>
                    <td style={{ fontSize:'0.82rem', textTransform:'capitalize' }}>{a.type?.replace('-',' ')}</td>
                    <td>
                      <select className="filter-select" style={{ padding:'4px 8px', fontSize:'0.78rem' }} value={a.status} onChange={e => handleStatusChange(a._id, e.target.value)}>
                        {['pending','confirmed','completed','cancelled','no-show'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditAppt(a); setShowForm(true); }}>Edit</button>
                        {hasRole('admin') && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a._id)}>Del</button>}
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
            <span className="pagination-info">Total: {pagination.total}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={pagination.page===1} onClick={() => fetchAppointments(pagination.page-1)}>‹</button>
              {Array.from({length:Math.min(5,pagination.pages)},(_,i)=>i+1).map(p=>(
                <button key={p} className={`page-btn ${p===pagination.page?'active':''}`} onClick={() => fetchAppointments(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={pagination.page===pagination.pages} onClick={() => fetchAppointments(pagination.page+1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && <AppointmentFormModal appointment={editAppt} onClose={(r) => { setShowForm(false); setEditAppt(null); if(r) fetchAppointments(pagination.page); }}/>}
    </div>
  );
}

function AppointmentFormModal({ appointment, onClose }) {
  const [form, setForm] = useState({ patient:'', doctor:'', date:'', timeSlot:{start:'',end:''}, type:'consultation', reason:'', notes:'' });
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const isEdit = !!appointment;

  useEffect(() => {
    Promise.all([patientAPI.getAll({limit:100}), userAPI.getDoctors()]).then(([pr,dr]) => { setPatients(pr.data.data); setDoctors(dr.data.data); });
    if (appointment) setForm({ patient:appointment.patient?._id||appointment.patient||'', doctor:appointment.doctor?._id||appointment.doctor||'', date:appointment.date?format(new Date(appointment.date),'yyyy-MM-dd'):'', timeSlot:appointment.timeSlot||{start:'',end:''}, type:appointment.type||'consultation', reason:appointment.reason||'', notes:appointment.notes||'' });
  }, [appointment]);

  useEffect(() => {
    if (form.doctor && form.date) {
      appointmentAPI.getSlots({ doctorId: form.doctor, date: form.date }).then(r => setSlots(r.data.data.available)).catch(console.error);
    }
  }, [form.doctor, form.date]);

  const set = (f,v) => setForm(p => ({...p,[f]:v}));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient||!form.doctor||!form.date||!form.timeSlot.start) return toast.error('Fill all required fields');
    setLoading(true);
    try {
      if (isEdit) { await appointmentAPI.update(appointment._id, form); toast.success('Updated'); }
      else { await appointmentAPI.create(form); toast.success('Appointment scheduled'); }
      onClose(true);
    } catch (err) { toast.error(err.response?.data?.message||'Failed to save'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3 className="modal-title">{isEdit?'Edit Appointment':'Schedule Appointment'}</h3>
          <button className="modal-close" onClick={()=>onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group"><label>Patient *</label><select className="form-control" value={form.patient} onChange={e=>set('patient',e.target.value)} required><option value="">Select patient</option>{patients.map(p=><option key={p._id} value={p._id}>{p.name} ({p.patientId})</option>)}</select></div>
              <div className="form-group"><label>Doctor *</label><select className="form-control" value={form.doctor} onChange={e=>set('doctor',e.target.value)} required><option value="">Select doctor</option>{doctors.map(d=><option key={d._id} value={d._id}>{d.name} — {d.specialization}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" className="form-control" value={form.date} min={format(new Date(),'yyyy-MM-dd')} onChange={e=>set('date',e.target.value)} required/></div>
              <div className="form-group"><label>Type</label><select className="form-control" value={form.type} onChange={e=>set('type',e.target.value)}>{['consultation','follow-up','emergency','routine-checkup','procedure'].map(t=><option key={t} value={t}>{t.replace('-',' ')}</option>)}</select></div>
            </div>
            {form.doctor&&form.date&&(
              <div className="form-group">
                <label>Available Slots *</label>
                {slots.length===0 ? <p style={{color:'var(--danger)',fontSize:'0.85rem'}}>No slots available</p>
                : <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:4}}>
                    {slots.map(s=>(
                      <button key={s.start} type="button" className={`btn btn-sm ${form.timeSlot.start===s.start?'btn-primary':'btn-secondary'}`} onClick={()=>set('timeSlot',s)}>{s.start}</button>
                    ))}
                  </div>}
              </div>
            )}
            <div className="form-group"><label>Reason</label><input className="form-control" value={form.reason} onChange={e=>set('reason',e.target.value)} placeholder="Reason for visit"/></div>
            <div className="form-group"><label>Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={()=>onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Saving...':isEdit?'Update':'Schedule'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Staff.js ───────────────────────────────────────────────────
export function Staff() {
  const [staff, setStaff] = useState([]);
  const [pagination, setPagination] = useState({ page:1, pages:1, total:0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const fetchStaff = useCallback(async (page=1) => {
    setLoading(true);
    try {
      const params = { page, limit:10 };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await userAPI.getAll(params);
      setStaff(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load staff'); }
    finally { setLoading(false); }
  }, [search, roleFilter]);

  useEffect(() => { const t=setTimeout(()=>fetchStaff(1),300); return ()=>clearTimeout(t); }, [fetchStaff]);

  const handleToggle = async (id, isActive) => {
    try { await userAPI.update(id,{isActive:!isActive}); toast.success(isActive?'Deactivated':'Activated'); fetchStaff(pagination.page); }
    catch { toast.error('Update failed'); }
  };

  return (
    <div className="page-container">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h2 style={{ fontSize:'1.4rem', fontWeight:700 }}>Staff Management</h2>
        <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Add Staff Member</button>
      </div>
      <div className="toolbar">
        <div className="search-box" style={{flex:1}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="form-control" placeholder="Search name, email, department..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="filter-select" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          {['admin','doctor','nurse','staff'].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="table-wrapper">
          {loading ? <div className="loading-spinner"><div className="spinner"/></div>
          : staff.length===0 ? <div className="empty-state"><h3>No staff found</h3></div>
          : (
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Specialization</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {staff.map(s=>(
                  <tr key={s._id}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div className="user-avatar" style={{width:32,height:32,fontSize:'0.75rem'}}>{s.name?.charAt(0)}</div>
                        <span style={{fontWeight:600}}>{s.name}</span>
                      </div>
                    </td>
                    <td style={{fontSize:'0.82rem'}}>{s.email}</td>
                    <td><span className={`badge badge-${s.role}`}>{s.role}</span></td>
                    <td style={{fontSize:'0.82rem'}}>{s.department||'—'}</td>
                    <td style={{fontSize:'0.82rem'}}>{s.specialization||'—'}</td>
                    <td style={{fontSize:'0.78rem'}}>{format(new Date(s.createdAt),'MMM d, yyyy')}</td>
                    <td><span className={`badge ${s.isActive?'badge-active':'badge-cancelled'}`}>{s.isActive?'Active':'Inactive'}</span></td>
                    <td><button className={`btn btn-sm ${s.isActive?'btn-secondary':'btn-primary'}`} onClick={()=>handleToggle(s._id,s.isActive)}>{s.isActive?'Deactivate':'Activate'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pagination.pages>1&&(
          <div className="pagination">
            <span className="pagination-info">Total: {pagination.total}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={pagination.page===1} onClick={()=>fetchStaff(pagination.page-1)}>‹</button>
              {Array.from({length:Math.min(5,pagination.pages)},(_,i)=>i+1).map(p=>(
                <button key={p} className={`page-btn ${p===pagination.page?'active':''}`} onClick={()=>fetchStaff(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={pagination.page===pagination.pages} onClick={()=>fetchStaff(pagination.page+1)}>›</button>
            </div>
          </div>
        )}
      </div>
      {showForm&&<AddStaffModal onClose={(r)=>{setShowForm(false);if(r)fetchStaff(1);}}/>}
    </div>
  );
}

function AddStaffModal({ onClose }) {
  const [form, setForm] = useState({name:'',email:'',password:'',role:'staff',department:'',phone:'',specialization:''});
  const [loading, setLoading] = useState(false);
  const set = (f,v) => setForm(p=>({...p,[f]:v}));
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { authAPI } = await import('../../services/api');
      await authAPI.register(form); toast.success('Staff member added'); onClose(true);
    } catch (err) { toast.error(err.response?.data?.message||'Failed'); }
    finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header"><h3 className="modal-title">Add Staff Member</h3><button className="modal-close" onClick={()=>onClose()}>✕</button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group"><label>Full Name *</label><input className="form-control" value={form.name} onChange={e=>set('name',e.target.value)} required/></div>
              <div className="form-group"><label>Email *</label><input type="email" className="form-control" value={form.email} onChange={e=>set('email',e.target.value)} required/></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Password *</label><input type="password" className="form-control" value={form.password} onChange={e=>set('password',e.target.value)} minLength={8} required/></div>
              <div className="form-group"><label>Role *</label><select className="form-control" value={form.role} onChange={e=>set('role',e.target.value)}>{['admin','doctor','nurse','staff'].map(r=><option key={r} value={r}>{r}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Department</label><input className="form-control" value={form.department} onChange={e=>set('department',e.target.value)}/></div>
              <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e=>set('phone',e.target.value)}/></div>
            </div>
            {form.role==='doctor'&&<div className="form-group"><label>Specialization</label><input className="form-control" value={form.specialization} onChange={e=>set('specialization',e.target.value)}/></div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={()=>onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Adding...':'Add Staff'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Appointments;
