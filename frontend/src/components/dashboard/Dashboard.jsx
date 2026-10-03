import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import useLiveDashboard from '../../hooks/useLiveDashboard';
import useSocket from '../../hooks/useSocket';
import LiveStatusBar from '../notifications/LiveStatusBar';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const StatCard = ({ value, label, color, icon, sub, highlight }) => (
  <div className="stat-card" style={highlight ? { borderColor: color, borderWidth: 2 } : {}}>
    <div className="stat-icon" style={{ background: color + '18' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">{icon}</svg>
    </div>
    <div className="stat-info">
      <div className="stat-value" style={highlight ? { color } : {}}>{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-change up">{sub}</div>}
    </div>
  </div>
);

export default function Dashboard() {
  const { stats, loading, lastUpdated, isLive, manualRefresh } = useLiveDashboard();
  const { user } = useAuth();
  const { on } = useSocket();
  const [criticalAlert, setCriticalAlert] = useState(null);

  useEffect(() => {
    const unsub = on('patient:critical', (payload) => {
      setCriticalAlert(payload);
      setTimeout(() => setCriticalAlert(null), 8000);
    });
    return unsub;
  }, [on]);

  if (loading && !stats) return <div className="loading-spinner"><div className="spinner" /></div>;

  const { counts, recentPatients, upcomingAppointments, charts } = stats || {};
  const patientChart = (charts?.monthlyPatients || []).map(d => ({ name: MONTHS[d._id.month - 1], Patients: d.count }));
  const apptChart = (charts?.monthlyAppointments || []).map(d => ({ name: MONTHS[d._id.month - 1], Appointments: d.count }));

  return (
    <div className="page-container">
      {criticalAlert && (
        <div style={{ background:'var(--danger)', color:'#fff', borderRadius:'var(--radius)', padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:12, animation:'modalIn 0.3s ease', boxShadow:'0 4px 20px rgba(220,38,38,0.3)' }}>
          <span style={{ fontSize:'1.5rem' }}>🚨</span>
          <div style={{ flex:1 }}>
            <strong>Critical Patient Alert</strong>
            <div style={{ fontSize:'0.85rem', opacity:0.9, marginTop:2 }}>{criticalAlert.name} ({criticalAlert.patientId}) — status changed to CRITICAL</div>
          </div>
          <button onClick={() => setCriticalAlert(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:'var(--radius-sm)', padding:'4px 12px', cursor:'pointer', fontSize:'0.8rem' }}>Dismiss</button>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:'1.4rem', fontWeight:700 }}>Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.name?.split(' ')[0]} 👋</h2>
          <p style={{ color:'var(--text-muted)', marginTop:4 }}>{format(new Date(), 'EEEE, MMMM do yyyy')}</p>
        </div>
        <LiveStatusBar lastUpdated={lastUpdated} isLive={isLive} onRefresh={manualRefresh} />
      </div>

      <div className="stat-grid">
        <StatCard value={counts?.totalPatients} label="Total Patients" color="var(--primary)" sub={counts?.activePatients + ' active'} icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>}/>
        <StatCard value={counts?.todayAppointments} label="Today's Appointments" color="var(--accent)" sub={counts?.pendingAppointments + ' pending'} icon={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}/>
        <StatCard value={counts?.criticalPatients} label="Critical Cases" color="var(--danger)" sub="Needs attention" highlight={counts?.criticalPatients > 0} icon={<><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>}/>
        <StatCard value={counts?.totalDoctors} label="Active Doctors" color="var(--info)" sub={counts?.totalStaff + ' support staff'} icon={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>}/>
        <StatCard value={counts?.pendingAppointments} label="Pending Appointments" color="var(--warning)" icon={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}/>
        <StatCard value={counts?.completedAppointments} label="Completed" color="var(--success)" icon={<><polyline points="20 6 9 17 4 12"/></>}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:28 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Monthly Patient Admissions</span><span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>Last 6 months</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={patientChart}>
                <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0a6e5e" stopOpacity={0.3}/><stop offset="95%" stopColor="#0a6e5e" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="name" tick={{ fontSize:11 }}/><YAxis tick={{ fontSize:11 }}/><Tooltip/>
                <Area type="monotone" dataKey="Patients" stroke="#0a6e5e" fill="url(#pg)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Monthly Appointments</span><span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>Last 6 months</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={apptChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="name" tick={{ fontSize:11 }}/><YAxis tick={{ fontSize:11 }}/><Tooltip/>
                <Bar dataKey="Appointments" fill="#f59e0b" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Recent Patients</span>{isLive && <span style={{ fontSize:'0.7rem', color:'var(--success)', fontWeight:600 }}>● Live</span>}</div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Patient</th><th>Status</th><th>Admitted</th></tr></thead>
              <tbody>
                {(recentPatients || []).map(p => (
                  <tr key={p._id}>
                    <td><div style={{ fontWeight:600, color:'var(--text-primary)' }}>{p.name}</div><div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{p.patientId}</div></td>
                    <td><span className={'badge badge-' + p.status}>{p.status}</span></td>
                    <td style={{ fontSize:'0.78rem' }}>{p.createdAt ? format(new Date(p.createdAt),'MMM d') : '—'}</td>
                  </tr>
                ))}
                {!recentPatients?.length && <tr><td colSpan={3} style={{ textAlign:'center', color:'var(--text-muted)', padding:24 }}>No patients yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Today's Schedule</span>{isLive && <span style={{ fontSize:'0.7rem', color:'var(--success)', fontWeight:600 }}>● Live</span>}</div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Patient</th><th>Doctor</th><th>Time</th><th>Status</th></tr></thead>
              <tbody>
                {(upcomingAppointments || []).map(a => (
                  <tr key={a._id}>
                    <td style={{ fontWeight:600, color:'var(--text-primary)' }}>{a.patient?.name || a.patientName}</td>
                    <td style={{ fontSize:'0.78rem' }}>{a.doctor?.name || a.doctorName}</td>
                    <td style={{ fontSize:'0.78rem', fontWeight:600 }}>{a.timeSlot?.start}</td>
                    <td><span className={'badge badge-' + a.status}>{a.status}</span></td>
                  </tr>
                ))}
                {!upcomingAppointments?.length && <tr><td colSpan={4} style={{ textAlign:'center', color:'var(--text-muted)', padding:24 }}>No appointments today</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
