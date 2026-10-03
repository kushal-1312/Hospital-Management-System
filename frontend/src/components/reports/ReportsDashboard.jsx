import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import toast from 'react-hot-toast';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { reportsAPI, userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const COLORS = ['#0a6e5e','#0d9b86','#f59e0b','#0284c7','#dc2626','#059669','#7c3aed','#be185d'];
const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

const SummaryKPI = ({ label, value, sub, color = 'var(--primary)' }) => (
  <div className="card" style={{ padding: '18px 22px', borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</div>
    {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 5 }}>{sub}</div>}
  </div>
);

export default function ReportsDashboard() {
  const [tab, setTab] = useState('summary');
  const { hasRole } = useAuth();

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Reports & Analytics</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 3, fontSize: '0.85rem' }}>
            Data-driven insights for hospital management
          </p>
        </div>
      </div>

      <div className="tabs">
        {[
          ['summary',     '📋 Summary'],
          ['department',  '🏥 Departments'],
          ['doctors',     '👨‍⚕️ Doctor Performance'],
          ['revenue',     '💰 Revenue'],
          ['demographics','📊 Demographics'],
          ['appointments','📅 Appointments'],
        ].filter(([t]) => t !== 'revenue' || hasRole('admin'))
         .map(([t, l]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {tab === 'summary'      && <SummaryReport />}
      {tab === 'department'   && <DepartmentReport />}
      {tab === 'doctors'      && <DoctorPerformanceReport />}
      {tab === 'revenue'      && <RevenueReport />}
      {tab === 'demographics' && <DemographicsReport />}
      {tab === 'appointments' && <AppointmentAnalytics />}
    </div>
  );
}

/* ── Summary Report ─────────────────────────────────────────── */
function SummaryReport() {
  const defaultStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const defaultEnd   = format(endOfMonth(new Date()),   'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate,   setEndDate]   = useState(defaultEnd);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [emailForm, setEmailForm] = useState({ show: false, email: '', type: 'monthly-summary' });

  const fetch = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const res = await reportsAPI.getSummary({ startDate, endDate });
      setData(res.data.data);
    } catch { toast.error('Failed to generate summary'); }
    finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { fetch(); }, []);

  const handleScheduleEmail = async (e) => {
    e.preventDefault();
    try {
      await reportsAPI.scheduleEmail({ reportType: emailForm.type, recipientEmail: emailForm.email });
      toast.success('Report scheduled — check your email shortly');
      setEmailForm(p => ({ ...p, show: false }));
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to schedule report'); }
  };

  return (
    <div>
      {/* Date range picker */}
      <div className="card" style={{ padding: '16px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ margin: 0 }}>From</label>
          <input type="date" className="form-control" style={{ width: 160 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ margin: 0 }}>To</label>
          <input type="date" className="form-control" style={{ width: 160 }} value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={fetch} disabled={loading}>
          {loading ? 'Generating...' : '↻ Generate Report'}
        </button>

        {/* Quick presets */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            ['This Month', format(startOfMonth(new Date()), 'yyyy-MM-dd'), format(endOfMonth(new Date()), 'yyyy-MM-dd')],
            ['Last Month', format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')],
            ['Last 3 Mo.', format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'), format(endOfMonth(new Date()), 'yyyy-MM-dd')],
          ].map(([label, s, e]) => (
            <button key={label} className="btn btn-secondary btn-sm" onClick={() => { setStartDate(s); setEndDate(e); }}>
              {label}
            </button>
          ))}
        </div>

        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }}
          onClick={() => setEmailForm(p => ({ ...p, show: true }))}>
          📧 Schedule Email Report
        </button>
      </div>

      {loading && <div className="loading-spinner"><div className="spinner" /></div>}

      {data && !loading && (
        <>
          <div style={{ marginBottom: 8, color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
            Period: {data.period.start} → {data.period.end} ({data.period.days} days)
          </div>

          {/* KPI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <SummaryKPI label="New Patients"      value={data.patients.new}           color="var(--primary)" />
            <SummaryKPI label="Discharged"        value={data.patients.discharged}    color="var(--success)" />
            <SummaryKPI label="Total Appointments" value={data.appointments.total}    color="var(--info)" />
            <SummaryKPI label="Completion Rate"   value={data.appointments.completionRate} color="var(--success)" sub={`${data.appointments.completed} completed`} />
            <SummaryKPI label="Cancelled"         value={data.appointments.cancelled} color="var(--danger)" />
            <SummaryKPI label="Revenue Billed"    value={fmt(data.revenue.billed)}    color="var(--primary)" />
            <SummaryKPI label="Revenue Collected" value={fmt(data.revenue.collected)} color="var(--success)" sub={`Collection rate: ${data.revenue.collectionRate}`} />
            <SummaryKPI label="Outstanding"       value={fmt(data.revenue.outstanding)} color={data.revenue.outstanding > 0 ? 'var(--danger)' : 'var(--success)'} />
          </div>
        </>
      )}

      {/* Schedule email modal */}
      {emailForm.show && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEmailForm(p => ({...p,show:false}))}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">📧 Schedule Report Email</h3>
              <button className="modal-close" onClick={() => setEmailForm(p => ({...p,show:false}))}>✕</button>
            </div>
            <form onSubmit={handleScheduleEmail}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Report Type</label>
                  <select className="form-control" value={emailForm.type} onChange={e => setEmailForm(p => ({...p, type: e.target.value}))}>
                    <option value="monthly-summary">Monthly Summary</option>
                    <option value="department">Department Report</option>
                    <option value="demographics">Demographics Report</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Recipient Email *</label>
                  <input type="email" className="form-control" placeholder="admin@hospital.com"
                    value={emailForm.email} onChange={e => setEmailForm(p => ({...p, email: e.target.value}))} required />
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  The report will be generated in the background and emailed within a few minutes.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEmailForm(p => ({...p,show:false}))}>Cancel</button>
                <button type="submit" className="btn btn-primary">Schedule Report</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Department Report ──────────────────────────────────────── */
function DepartmentReport() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsAPI.getDepartment()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load department report'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!data)   return <div className="empty-state"><p>No data available</p></div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className="card">
        <div className="card-header"><span className="card-title">Patients by Department</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.byDept} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="_id" tick={{ fontSize: 11 }} width={100} />
              <Tooltip />
              <Legend />
              <Bar dataKey="active"    name="Active"    fill="#0a6e5e" radius={[0,4,4,0]} />
              <Bar dataKey="discharged" name="Discharged" fill="#0284c7" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Patient Status Distribution</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.byStatus} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={100} label={({ _id, count }) => `${_id}: ${count}`}>
                {data.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Department Breakdown Table</span></div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Department</th><th>Total</th><th>Active</th><th>Discharged</th></tr></thead>
            <tbody>
              {data.byDept.map((d, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{d._id}</td>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{d.count}</td>
                  <td style={{ color: 'var(--success)' }}>{d.active}</td>
                  <td style={{ color: 'var(--info)' }}>{d.discharged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Gender Distribution</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.byGender} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={80} label={({ _id, count }) => `${_id}: ${count}`}>
                {data.byGender.map((_, i) => <Cell key={i} fill={['#0a6e5e','#f59e0b','#0284c7'][i % 3]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ── Doctor Performance Report ──────────────────────────────── */
function DoctorPerformanceReport() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState([]);
  const [doctorFilter, setDoctorFilter] = useState('');
  const { hasRole } = useAuth();

  useEffect(() => {
    if (hasRole('admin')) {
      userAPI.getDoctors().then(r => setDoctors(r.data.data)).catch(console.error);
    }
  }, [hasRole]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (doctorFilter) params.doctorId = doctorFilter;
      const res = await reportsAPI.getDoctorPerf(params);
      setData(res.data.data);
    } catch { toast.error('Failed to load doctor performance'); }
    finally { setLoading(false); }
  }, [doctorFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div>
      {hasRole('admin') && (
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <select className="filter-select" value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}>
            <option value="">All Doctors</option>
            {doctors.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
      )}

      {loading ? <div className="loading-spinner"><div className="spinner" /></div> : !data ? null : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Appointment Volume by Doctor</span></div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.doctors.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="doctorName" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="completed" name="Completed" fill="var(--success)" radius={[0,3,3,0]} stackId="a" />
                    <Bar dataKey="cancelled" name="Cancelled" fill="var(--danger)"  radius={[0,3,3,0]} stackId="a" />
                    <Bar dataKey="noShow"    name="No-show"   fill="var(--warning)" radius={[0,3,3,0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Completion Rate (%)</span></div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.doctors.slice(0, 8).map(d => ({ ...d, rate: Number(d.completionRate.toFixed(1)) }))} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="doctorName" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Bar dataKey="rate" name="Completion Rate" fill="#0a6e5e" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Doctor Performance Table</span></div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Doctor</th><th>Specialization</th><th>Department</th>
                    <th>Total Appts</th><th>Completed</th><th>Cancelled</th>
                    <th>No-Show</th><th>Completion %</th><th>Patients</th>
                  </tr>
                </thead>
                <tbody>
                  {data.doctors.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{d.doctorName}</td>
                      <td style={{ fontSize: '0.82rem' }}>{d.specialization || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{d.department || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{d.total}</td>
                      <td style={{ color: 'var(--success)', fontWeight: 600 }}>{d.completed}</td>
                      <td style={{ color: 'var(--danger)'  }}>{d.cancelled}</td>
                      <td style={{ color: 'var(--warning)' }}>{d.noShow}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${d.completionRate}%`, height: '100%', background: d.completionRate >= 80 ? 'var(--success)' : d.completionRate >= 60 ? 'var(--warning)' : 'var(--danger)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, width: 36 }}>{d.completionRate.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{d.patientCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Revenue Report ─────────────────────────────────────────── */
function RevenueReport() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    setLoading(true);
    reportsAPI.getRevenue({ months })
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load revenue data'))
      .finally(() => setLoading(false));
  }, [months]);

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label style={{ margin: 0 }}>Time Period:</label>
        {[3, 6, 12].map(m => (
          <button key={m} className={`btn btn-sm ${months === m ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMonths(m)}>
            {m} months
          </button>
        ))}
      </div>

      {loading ? <div className="loading-spinner"><div className="spinner" /></div> : !data ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <SummaryKPI label="Total Billed"    value={fmt(data.totals.billed)}      color="var(--primary)" />
            <SummaryKPI label="Total Collected" value={fmt(data.totals.collected)}   color="var(--success)" sub={`${data.totals.billed > 0 ? ((data.totals.collected/data.totals.billed)*100).toFixed(1) : 0}% collection rate`} />
            <SummaryKPI label="Outstanding"     value={fmt(data.totals.outstanding)} color={data.totals.outstanding > 0 ? 'var(--danger)' : 'var(--success)'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Revenue Trend</span></div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.monthly}>
                    <defs>
                      <linearGradient id="billed"    x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#0a6e5e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0a6e5e" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="collected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#059669" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="billed"    name="Billed"    stroke="#0a6e5e" fill="url(#billed)"    strokeWidth={2} />
                    <Area type="monotone" dataKey="collected" name="Collected" stroke="#059669" fill="url(#collected)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Invoice Status</span></div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={data.byStatus} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={90} label={({ _id }) => _id}>
                      {data.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {data.topPatients?.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">Top 5 Patients by Billing</span></div>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Patient</th><th>Invoices</th><th style={{ textAlign: 'right' }}>Total Billed</th></tr></thead>
                  <tbody>
                    {data.topPatients.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.patientName}</td>
                        <td>{p.invoiceCount}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{fmt(p.totalBilled)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Demographics Report ─────────────────────────────────────── */
function DemographicsReport() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsAPI.getDemographics()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load demographics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!data)   return <div className="empty-state"><p>No data</p></div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className="card">
        <div className="card-header"><span className="card-title">Age Distribution</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.ageGroups}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Patients" fill="#0a6e5e" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Blood Group Distribution</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.bloodGroups}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Patients" fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Monthly Admissions (12 months)</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.monthlyAdmissions}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" name="Admissions" stroke="#0a6e5e" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Top Diagnoses</span></div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>#</th><th>Diagnosis</th><th>Patients</th></tr></thead>
            <tbody>
              {data.topDiagnoses.map((d, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{d._id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', maxWidth: 100 }}>
                        <div style={{ width: `${(d.count / data.topDiagnoses[0].count) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontWeight: 700 }}>{d.count}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Appointment Analytics ───────────────────────────────────── */
function AppointmentAnalytics() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [months,  setMonths]  = useState(3);

  useEffect(() => {
    setLoading(true);
    reportsAPI.getAppointmentStats({ months })
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load appointment analytics'))
      .finally(() => setLoading(false));
  }, [months]);

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label style={{ margin: 0 }}>Period:</label>
        {[1, 3, 6].map(m => (
          <button key={m} className={`btn btn-sm ${months === m ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMonths(m)}>
            {m} month{m > 1 ? 's' : ''}
          </button>
        ))}
      </div>

      {loading ? <div className="loading-spinner"><div className="spinner" /></div> : !data ? null : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Appointments by Type</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.byType} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={90} label={({ _id, count }) => `${_id}: ${count}`}>
                    {data.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Peak Hours</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="_id" tick={{ fontSize: 11 }} label={{ value: 'Hour', position: 'insideBottom', offset: -2 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Appointments" fill="#0d9b86" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header"><span className="card-title">No-Show Rate by Doctor</span></div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Doctor</th><th>Total</th><th>No-Shows</th><th>No-Show Rate</th></tr></thead>
                <tbody>
                  {data.noShowRate.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{d.doctorName}</td>
                      <td>{d.total}</td>
                      <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{d.noShows}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, maxWidth: 120, overflow: 'hidden' }}>
                            <div style={{ width: `${d.noShowRate}%`, height: '100%', background: d.noShowRate > 20 ? 'var(--danger)' : d.noShowRate > 10 ? 'var(--warning)' : 'var(--success)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{d.noShowRate.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
