const SupabaseModel = require('./SupabaseModel');
const Sequence = require('./Sequence');
const { supabase } = require('../config/supabase');

class Patient extends SupabaseModel {
  static tableName = 'patients';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.status = this.status || 'active';
    this.contact = this.contact || {};
    this.address = this.address || { country: 'India' };
    this.medicalHistory = Array.isArray(this.medicalHistory) ? this.medicalHistory : [];
    this.auditLog = Array.isArray(this.auditLog) ? this.auditLog : [];
    this.currentPrescriptions = Array.isArray(this.currentPrescriptions) ? this.currentPrescriptions : [];
    this.allergies = Array.isArray(this.allergies) ? this.allergies : [];
    this.files = Array.isArray(this.files) ? this.files : [];
    this.admissionDate = this.admissionDate || new Date().toISOString();
  }

  async _preSave() {
    if (!this.patientId) {
      try {
        const { data: latest } = await supabase
          .from('patients')
          .select('patient_id')
          .order('patient_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        const initialValue = latest?.patient_id ? Number(latest.patient_id.slice(4)) : 0;
        const nextVal = await Sequence.next('patientId', initialValue);
        this.patientId = `PAT-${String(nextVal).padStart(5, '0')}`;
      } catch (err) {
        this.patientId = `PAT-${String(Date.now()).slice(-5)}`;
      }
    }
  }
}

module.exports = Patient;
