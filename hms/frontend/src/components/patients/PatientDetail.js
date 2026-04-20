import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { patientAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import PatientForm from './PatientForm';

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [historyForm, setHistoryForm] = useState({ diagnosis: '', treatment: '', prescription: '', notes: '' });

  const fetchPatient = async () => {
    try {
      const res = await patientAPI.getOne(id);
      setPatient(res.data.data);
    } catch (err) {
      toast.error('Patient not found');
      navigate('/patients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPatient(); }, [id]);

  const handleAddHistory = async (e) => {
    e.preventDefault();
    if (!historyForm.diagnosis) return toast.error('Diagnosis required');
    try {
      await patientAPI.addHistory(id, historyForm);
      toast.success('Medical history added');
      setShowHistoryForm(false);
      setHistoryForm({ diagnosis: '', treatment: '', prescription: '', notes: '' });
      fetchPatient();
    } catch (err) {
      toast.error('Failed to add history');
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!patient) return null;

  const InfoRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>{value || '—'}</span>
    </div>
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/patients')}>← Back</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{patient.name}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{patient.patientId} · Admitted {format(new Date(patient.admissionDate || patient.createdAt), 'MMM d, yyyy')}</p>
        </div>
        <span className={`badge badge-${patient.status}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>{patient.status}</span>
        {hasRole('admin', 'doctor', 'nurse') && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowEdit(true)}>Edit Patient</button>
        )}
      </div>

      {/* Quick Info Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Age', value: `${patient.age} years` },
          { label: 'Gender', value: patient.gender },
          { label: 'Blood Group', value: patient.bloodGroup || '—' },
          { label: 'Ward / Bed', value: patient.ward ? `${patient.ward} / ${patient.bedNumber || '—'}` : '—' }
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: 4, color: 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['overview','Overview'], ['history','Medical History'], ['contact','Contact']].map(([t, l]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Medical Info</span></div>
            <div className="card-body">
              <InfoRow label="Current Diagnosis" value={patient.currentDiagnosis} />
              <InfoRow label="Assigned Doctor" value={patient.assignedDoctor?.name} />
              <InfoRow label="Allergies" value={(patient.allergies || []).join(', ') || 'None'} />
              {patient.dischargeDate && <InfoRow label="Discharge Date" value={format(new Date(patient.dischargeDate), 'MMM d, yyyy')} />}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Current Prescriptions</span></div>
            <div className="card-body">
              {patient.currentPrescriptions?.length > 0 ? (
                patient.currentPrescriptions.map((rx, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rx.medicine}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{rx.dosage} · {rx.frequency}</div>
                  </div>
                ))
              ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No prescriptions</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Medical History ({patient.medicalHistory?.length || 0} entries)</span>
            {hasRole('admin', 'doctor') && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowHistoryForm(true)}>+ Add Entry</button>
            )}
          </div>
          <div className="card-body">
            {!patient.medicalHistory?.length ? (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <p>No medical history recorded</p>
              </div>
            ) : (
              [...patient.medicalHistory].reverse().map((h, i) => (
                <div key={i} style={{ padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{h.diagnosis}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{format(new Date(h.date), 'MMM d, yyyy')}</span>
                  </div>
                  {h.treatment && <div style={{ fontSize: '0.82rem', marginBottom: 4 }}><strong>Treatment:</strong> {h.treatment}</div>}
                  {h.prescription && <div style={{ fontSize: '0.82rem', marginBottom: 4 }}><strong>Rx:</strong> {h.prescription}</div>}
                  {h.notes && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{h.notes}</div>}
                  <div style={{ fontSize: '0.72rem', color: 'var(--primary)', marginTop: 6 }}>Dr. {h.doctorName}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'contact' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Contact Info</span></div>
            <div className="card-body">
              <InfoRow label="Phone" value={patient.contact?.phone} />
              <InfoRow label="Email" value={patient.contact?.email} />
              <InfoRow label="Emergency Contact" value={patient.contact?.emergencyContact} />
              <InfoRow label="Emergency Phone" value={patient.contact?.emergencyPhone} />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Address</span></div>
            <div className="card-body">
              <InfoRow label="Street" value={patient.address?.street} />
              <InfoRow label="City" value={patient.address?.city} />
              <InfoRow label="State" value={patient.address?.state} />
              <InfoRow label="PIN Code" value={patient.address?.zipCode} />
              <InfoRow label="Country" value={patient.address?.country} />
            </div>
          </div>
        </div>
      )}

      {showEdit && <PatientForm patient={patient} onClose={(r) => { setShowEdit(false); if (r) fetchPatient(); }} />}

      {showHistoryForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowHistoryForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Add Medical History Entry</h3>
              <button className="modal-close" onClick={() => setShowHistoryForm(false)}>✕</button>
            </div>
            <form onSubmit={handleAddHistory}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Diagnosis *</label>
                  <input className="form-control" value={historyForm.diagnosis} onChange={e => setHistoryForm(p => ({ ...p, diagnosis: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Treatment</label>
                  <input className="form-control" value={historyForm.treatment} onChange={e => setHistoryForm(p => ({ ...p, treatment: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Prescription</label>
                  <input className="form-control" value={historyForm.prescription} onChange={e => setHistoryForm(p => ({ ...p, prescription: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea className="form-control" rows={3} value={historyForm.notes} onChange={e => setHistoryForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowHistoryForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
