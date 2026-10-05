const SupabaseModel = require('./SupabaseModel');
const Sequence = require('./Sequence');
const { supabase } = require('../config/supabase');

class Appointment extends SupabaseModel {
  static tableName = 'appointments';

  constructor(data = {}, isExisting = false) {
    super(data, isExisting);
    this.type = this.type || 'consultation';
    this.status = this.status || 'pending';
    this.duration = Number(this.duration) || 30;
    this.timeSlot = this.timeSlot || { start: '09:00', end: '09:30' };
  }

  async _preSave() {
    if (!this.appointmentId) {
      try {
        const { data: latest } = await supabase
          .from('appointments')
          .select('appointment_id')
          .order('appointment_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        const initialValue = latest?.appointment_id ? Number(latest.appointment_id.slice(4)) : 0;
        const nextVal = await Sequence.next('appointmentId', initialValue);
        this.appointmentId = `APT-${String(nextVal).padStart(5, '0')}`;
      } catch (err) {
        this.appointmentId = `APT-${String(Date.now()).slice(-5)}`;
      }
    }
  }

  static async checkDoubleBooking(doctorId, date, startTime, endTime, excludeId = null) {
    const d = new Date(date);
    const startOfDay = new Date(d.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(d.setHours(23, 59, 59, 999)).toISOString();

    const existingAppointments = await this.find({
      doctor: doctorId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled', 'no-show'] }
    }).lean();

    return existingAppointments.find(apt => {
      if (excludeId && String(apt.id || apt._id) === String(excludeId)) return false;
      const slot = apt.timeSlot || {};
      const s = slot.start;
      const e = slot.end;
      if (!s || !e) return false;
      return (
        (s <= startTime && e > startTime) ||
        (s < endTime && e >= endTime) ||
        (s >= startTime && e <= endTime)
      );
    }) || null;
  }
}

module.exports = Appointment;
