import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { patientAPI, userAPI } from '../../services/api';

const initialState = {
  name: '', age: '', gender: '', bloodGroup: '',
  currentDiagnosis: '', status: 'active',
  contact: { phone: '', email: '', emergencyContact: '', emergencyPhone: '' },
  address: { street: '', city: '', state: '', zipCode: '', country: 'India' },
  allergies: '',
  assignedDoctor: '', ward: '', bedNumber: ''
};

export default function PatientForm({ patient, onClose }) {
  const [form, setForm] = useState(initialState);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('basic');

  const isEdit = !!patient;

  useEffect(() => {
    userAPI.getDoctors().then(r => setDoctors(r.data.data)).catch(console.error);
    if (patient) {
      setForm({
        ...patient,
        allergies: (patient.allergies || []).join(', '),
        contact: patient.contact || initialState.contact,
        address: patient.address || initialState.address,
        assignedDoctor: patient.assignedDoctor?._id || patient.assignedDoctor || ''
      });
    }
  }, [patient]);

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));
  const setNested = (parent, field, value) => setForm(p => ({ ...p, [parent]: { ...p[parent], [field]: value } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.age || !form.gender) {
      toast.error('Name, age, and gender are required');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        age: Number(form.age),
        allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : []
      };
      if (isEdit) {
        await patientAPI.update(patient._id, payload);
        toast.success('Patient updated');
      } else {
        await patientAPI.create(payload);
        toast.success('Patient created');
      }
      onClose(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? 'Edit Patient' : 'Add New Patient'}</h3>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Tabs */}
            <div className="tabs">
              {[['basic', 'Basic Info'], ['contact', 'Contact'], ['medical', 'Medical']].map(([t, l]) => (
                <button key={t} type="button" className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
              ))}
            </div>

            {tab === 'basic' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Patient full name" required />
                  </div>
                  <div className="form-group">
                    <label>Age *</label>
                    <input type="number" className="form-control" value={form.age} onChange={e => set('age', e.target.value)} placeholder="Age in years" min="0" max="150" required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Gender *</label>
                    <select className="form-control" value={form.gender} onChange={e => set('gender', e.target.value)} required>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Blood Group</label>
                    <select className="form-control" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                      <option value="">Unknown</option>
                      {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Assigned Doctor</label>
                    <select className="form-control" value={form.assignedDoctor} onChange={e => set('assignedDoctor', e.target.value)}>
                      <option value="">Not assigned</option>
                      {doctors.map(d => <option key={d._id} value={d._id}>{d.name} — {d.specialization}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
                      <option value="active">Active</option>
                      <option value="stable">Stable</option>
                      <option value="critical">Critical</option>
                      <option value="under-observation">Under Observation</option>
                      <option value="discharged">Discharged</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Ward</label>
                    <input className="form-control" value={form.ward} onChange={e => set('ward', e.target.value)} placeholder="e.g. General Ward A" />
                  </div>
                  <div className="form-group">
                    <label>Bed Number</label>
                    <input className="form-control" value={form.bedNumber} onChange={e => set('bedNumber', e.target.value)} placeholder="e.g. B-12" />
                  </div>
                </div>
              </>
            )}

            {tab === 'contact' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone</label>
                    <input className="form-control" value={form.contact.phone} onChange={e => setNested('contact', 'phone', e.target.value)} placeholder="+91-XXXXXXXXXX" />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" className="form-control" value={form.contact.email} onChange={e => setNested('contact', 'email', e.target.value)} placeholder="patient@email.com" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Emergency Contact Name</label>
                    <input className="form-control" value={form.contact.emergencyContact} onChange={e => setNested('contact', 'emergencyContact', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Emergency Phone</label>
                    <input className="form-control" value={form.contact.emergencyPhone} onChange={e => setNested('contact', 'emergencyPhone', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Street Address</label>
                  <input className="form-control" value={form.address.street} onChange={e => setNested('address', 'street', e.target.value)} />
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label>City</label>
                    <input className="form-control" value={form.address.city} onChange={e => setNested('address', 'city', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input className="form-control" value={form.address.state} onChange={e => setNested('address', 'state', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>PIN Code</label>
                    <input className="form-control" value={form.address.zipCode} onChange={e => setNested('address', 'zipCode', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {tab === 'medical' && (
              <>
                <div className="form-group">
                  <label>Current Diagnosis</label>
                  <input className="form-control" value={form.currentDiagnosis} onChange={e => set('currentDiagnosis', e.target.value)} placeholder="Primary diagnosis" />
                </div>
                <div className="form-group">
                  <label>Allergies (comma-separated)</label>
                  <input className="form-control" value={form.allergies} onChange={e => set('allergies', e.target.value)} placeholder="Penicillin, Sulfa drugs, Peanuts..." />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : isEdit ? 'Update Patient' : 'Create Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
