import { useState, useEffect, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  format, addMonths, subMonths, addWeeks, subWeeks,
  startOfDay, endOfDay, parseISO, addDays
} from 'date-fns';
import toast from 'react-hot-toast';
import { appointmentAPI, userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const STATUS_COLORS = {
  pending:   'pending',
  confirmed: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
  'no-show': 'cancelled',
};

export default function CalendarView() {
  const [view, setView]               = useState('month');   // month | week | day
  const [current, setCurrent]         = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);      // clicked appointment
  const [doctors, setDoctors]         = useState([]);
  const [doctorFilter, setDoctorFilter] = useState('');
  const { hasRole, user } = useAuth();

  // ── Fetch appointments for the visible date range ──────────
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      let startDate, endDate;

      if (view === 'month') {
        const ms = startOfMonth(current);
        const me = endOfMonth(current);
        startDate = startOfWeek(ms, { weekStartsOn: 1 });
        endDate   = endOfWeek(me, { weekStartsOn: 1 });
      } else if (view === 'week') {
        startDate = startOfWeek(current, { weekStartsOn: 1 });
        endDate   = endOfWeek(current, { weekStartsOn: 1 });
      } else {
        startDate = startOfDay(current);
        endDate   = endOfDay(current);
      }

      const params = {
        startDate: startDate.toISOString(),
        endDate:   endDate.toISOString(),
        limit: 200
      };
      if (doctorFilter) params.doctor = doctorFilter;

      const res = await appointmentAPI.getAll(params);
      setAppointments(res.data.data || []);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [view, current, doctorFilter]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  useEffect(() => {
    if (hasRole('admin', 'staff', 'nurse')) {
      userAPI.getDoctors().then(r => setDoctors(r.data.data)).catch(() => {});
    }
  }, [hasRole]);

  // ── Helpers ────────────────────────────────────────────────
  const apptOnDay = (day) =>
    appointments.filter(a => a.date && isSameDay(parseISO(a.date), day));

  const nav = (dir) => {
    if (view === 'month') setCurrent(dir === 1 ? addMonths(current, 1) : subMonths(current, 1));
    if (view === 'week')  setCurrent(dir === 1 ? addWeeks(current, 1)  : subWeeks(current, 1));
    if (view === 'day')   setCurrent(dir === 1 ? addDays(current, 1)   : addDays(current, -1));
  };

  const headerLabel = () => {
    if (view === 'month') return format(current, 'MMMM yyyy');
    if (view === 'week') {
      const start = startOfWeek(current, { weekStartsOn: 1 });
      const end   = endOfWeek(current, { weekStartsOn: 1 });
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    }
    return format(current, 'EEEE, MMMM d yyyy');
  };

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // ── Month view cells ───────────────────────────────────────
  const monthDays = () => {
    const ms = startOfMonth(current);
    const me = endOfMonth(current);
    return eachDayOfInterval({
      start: startOfWeek(ms, { weekStartsOn: 1 }),
      end:   endOfWeek(me,   { weekStartsOn: 1 })
    });
  };

  // ── Week view columns ──────────────────────────────────────
  const weekDays = () =>
    eachDayOfInterval({
      start: startOfWeek(current, { weekStartsOn: 1 }),
      end:   endOfWeek(current,   { weekStartsOn: 1 })
    });

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Appointment Calendar</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Doctor filter (admin/staff only) */}
          {hasRole('admin', 'staff', 'nurse') && (
            <select className="filter-select" value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}>
              <option value="">All Doctors</option>
              {doctors.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          )}
          {/* View switcher */}
          <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {['month', 'week', 'day'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '7px 16px', border: 'none',
                  background: view === v ? 'var(--primary)' : 'var(--bg-card)',
                  color: view === v ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.82rem',
                  cursor: 'pointer', textTransform: 'capitalize',
                  transition: 'var(--transition)'
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrent(new Date())}>
            Today
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="calendar-nav">
        <button className="calendar-nav-btn" onClick={() => nav(-1)} aria-label="Previous">‹</button>
        <h3>{headerLabel()}</h3>
        <button className="calendar-nav-btn" onClick={() => nav(1)} aria-label="Next">›</button>
        {loading && <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />}
      </div>

      {/* ── MONTH VIEW ─────────────────────────────────────── */}
      {view === 'month' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="calendar-grid">
            {/* Day headers */}
            {DAYS.map(d => (
              <div key={d} className="calendar-day-header">{d}</div>
            ))}
            {/* Day cells */}
            {monthDays().map((day, idx) => {
              const dayAppts = apptOnDay(day);
              const inMonth  = isSameMonth(day, current);
              const today    = isToday(day);
              return (
                <div
                  key={idx}
                  className={`calendar-cell ${today ? 'today' : ''} ${!inMonth ? 'other-month' : ''}`}
                >
                  <span className="calendar-date">{format(day, 'd')}</span>
                  {dayAppts.slice(0, 3).map(a => (
                    <span
                      key={a._id}
                      className={`calendar-event ${STATUS_COLORS[a.status] || 'pending'}`}
                      onClick={() => setSelected(a)}
                      title={`${a.timeSlot?.start} — ${a.patient?.name || a.patientName}`}
                    >
                      {a.timeSlot?.start} {a.patient?.name || a.patientName}
                    </span>
                  ))}
                  {dayAppts.length > 3 && (
                    <span
                      style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}
                      onClick={() => { setCurrent(day); setView('day'); }}
                    >
                      +{dayAppts.length - 3} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── WEEK VIEW ──────────────────────────────────────── */}
      {view === 'week' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(7, 1fr)`, borderBottom: '1px solid var(--border)' }}>
            <div style={{ background: 'var(--bg)', borderRight: '1px solid var(--border)' }} />
            {weekDays().map((day, i) => (
              <div key={i} style={{
                background: isToday(day) ? 'var(--primary-50)' : 'var(--bg)',
                padding: '10px 8px', textAlign: 'center',
                borderRight: i < 6 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {format(day, 'EEE')}
                </div>
                <div style={{
                  fontSize: '1.1rem', fontWeight: 700, marginTop: 2,
                  color: isToday(day) ? 'var(--primary)' : 'var(--text-primary)'
                }}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>

          {/* Time slots 08:00–18:00 */}
          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            {Array.from({ length: 20 }, (_, i) => {
              const hour = Math.floor(i / 2) + 8;
              const min  = i % 2 === 0 ? '00' : '30';
              const slotStr = `${String(hour).padStart(2,'0')}:${min}`;
              return (
                <div key={slotStr} style={{ display: 'grid', gridTemplateColumns: `80px repeat(7, 1fr)`, borderBottom: '1px solid var(--border)', minHeight: 48 }}>
                  <div style={{ padding: '4px 10px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, borderRight: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', paddingTop: 8 }}>
                    {slotStr}
                  </div>
                  {weekDays().map((day, di) => {
                    const slot = appointments.filter(a =>
                      a.date && isSameDay(parseISO(a.date), day) && a.timeSlot?.start === slotStr
                    );
                    return (
                      <div key={di} style={{ borderRight: di < 6 ? '1px solid var(--border)' : 'none', padding: 2, background: isToday(day) ? 'rgba(10,110,94,0.02)' : undefined }}>
                        {slot.map(a => (
                          <div
                            key={a._id}
                            className={`calendar-event ${STATUS_COLORS[a.status] || 'pending'}`}
                            onClick={() => setSelected(a)}
                            style={{ margin: 2, borderRadius: 6, padding: '4px 8px' }}
                          >
                            {a.patient?.name || a.patientName}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DAY VIEW ──────────────────────────────────────── */}
      {view === 'day' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{format(current, 'EEEE, MMMM d yyyy')}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {apptOnDay(current).length} appointment(s)
            </span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 600 }}>
            {Array.from({ length: 20 }, (_, i) => {
              const hour = Math.floor(i / 2) + 8;
              const min  = i % 2 === 0 ? '00' : '30';
              const slotStr = `${String(hour).padStart(2,'0')}:${min}`;
              const slotAppts = apptOnDay(current).filter(a => a.timeSlot?.start === slotStr);
              return (
                <div key={slotStr} style={{ display: 'flex', minHeight: 56, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 72, padding: '8px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start' }}>
                    {slotStr}
                  </div>
                  <div style={{ flex: 1, padding: '6px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {slotAppts.map(a => (
                      <div
                        key={a._id}
                        className={`calendar-event ${STATUS_COLORS[a.status] || 'pending'}`}
                        onClick={() => setSelected(a)}
                        style={{ borderRadius: 8, padding: '6px 12px', fontSize: '0.82rem', cursor: 'pointer' }}
                      >
                        <div style={{ fontWeight: 700 }}>{a.patient?.name || a.patientName}</div>
                        <div style={{ opacity: 0.8, fontSize: '0.72rem' }}>{a.doctor?.name || a.doctorName} · {a.type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        {[['pending','Pending'],['confirmed','Confirmed'],['completed','Completed'],['cancelled','Cancelled']].map(([cls, label]) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`calendar-event ${cls}`} style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, padding: 0 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Appointment detail popover ───────────────────── */}
      {selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Appointment Details</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Patient</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: 2 }}>{selected.patient?.name || selected.patientName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selected.patient?.patientId}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    ['Doctor', selected.doctor?.name || selected.doctorName],
                    ['Date', selected.date ? format(parseISO(selected.date), 'dd MMM yyyy') : '—'],
                    ['Time', `${selected.timeSlot?.start} – ${selected.timeSlot?.end}`],
                    ['Type', selected.type?.replace('-',' ')],
                    ['Status', selected.status],
                    ['ID', selected.appointmentId],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontWeight: 500, marginTop: 2, textTransform: 'capitalize' }}>{value || '—'}</div>
                    </div>
                  ))}
                </div>
                {selected.reason && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Reason</div>
                    <div style={{ marginTop: 4, fontSize: '0.88rem' }}>{selected.reason}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
