import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import TwoFactorSettings from '../auth/TwoFactorSettings';
import { format } from 'date-fns';

export default function SecuritySettings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('password');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [secLog, setSecLog] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    if (tab === 'log') fetchLog();
  }, [tab]);

  const fetchLog = async () => {
    setLogLoading(true);
    try {
      const res = await authAPI.getSecurityLog();
      setSecLog(res.data.data);
    } catch { toast.error('Failed to load security log'); }
    finally { setLogLoading(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword.length < 8) return toast.error('Password must be at least 8 characters');
    if (pwForm.newPassword !== pwForm.confirm) return toast.error('Passwords do not match');
    setPwLoading(true);
    try {
      await authAPI.changePassword({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword
      });
      toast.success('Password changed. Please login again.');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setPwLoading(false); }
  };

  const strength = (pw) => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };

  const score = strength(pwForm.newPassword);
  const strengthColors = ['', '#dc2626', '#d97706', '#2563eb', '#059669', '#0a6e5e'];
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];

  const eventIcons = {
    login: '✅',
    failed_login: '❌',
    password_reset: '🔑',
    '2fa_enabled': '🔐',
    '2fa_verified': '🔓',
    password_changed: '🔒'
  };

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Security Settings</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Manage your password, two-factor authentication, and review login activity.
        </p>
      </div>

      {/* User info card */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="user-avatar" style={{ width: 52, height: 52, fontSize: '1.2rem' }}>
          {user?.name?.charAt(0)}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{user?.name}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user?.email}</div>
          <span className={`badge badge-${user?.role}`} style={{ marginTop: 4 }}>{user?.role}</span>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>2FA Status</div>
          <span className={`badge ${user?.twoFactorEnabled ? 'badge-active' : 'badge-pending'}`} style={{ marginTop: 4 }}>
            {user?.twoFactorEnabled ? 'Protected' : 'Not enabled'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          ['password', '🔒 Change Password'],
          ['2fa', '🔐 Two-Factor Auth'],
          ['log', '📋 Security Log']
        ].map(([t, l]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ── Change Password ──────────────────────────────── */}
      {tab === 'password' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-header"><span className="card-title">Change Password</span></div>
          <div className="card-body">
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" className="form-control"
                  value={pwForm.currentPassword}
                  onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                  placeholder="Your current password" />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" className="form-control"
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder="Minimum 8 characters" />
                {pwForm.newPassword && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(score / 5) * 100}%`, background: strengthColors[score], borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: strengthColors[score], fontWeight: 600 }}>
                      {strengthLabels[score]}
                    </span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" className="form-control"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  placeholder="Re-enter new password" />
                {pwForm.confirm && pwForm.newPassword !== pwForm.confirm && (
                  <p className="form-error">Passwords do not match</p>
                )}
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <strong>Password requirements:</strong><br />
                  • At least 8 characters long<br />
                  • Mix of uppercase, lowercase, numbers, and symbols recommended<br />
                  • All active sessions will be invalidated after change
                </p>
              </div>

              <button type="submit" className="btn btn-primary"
                disabled={pwLoading || !pwForm.currentPassword || pwForm.newPassword !== pwForm.confirm}>
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Two-Factor Auth ──────────────────────────────── */}
      {tab === '2fa' && (
        <div className="card">
          <div className="card-body">
            <TwoFactorSettings />
          </div>
        </div>
      )}

      {/* ── Security Log ─────────────────────────────────── */}
      {tab === 'log' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Security Events</span>
            <button className="btn btn-secondary btn-sm" onClick={fetchLog} disabled={logLoading}>
              {logLoading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
          <div className="table-wrapper">
            {logLoading ? (
              <div className="loading-spinner"><div className="spinner" /></div>
            ) : secLog.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px' }}>
                <h3>No security events recorded</h3>
                <p>Events like logins, failed attempts, and password changes will appear here.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Time</th>
                    <th>IP Address</th>
                    <th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {secLog.map((event, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{ marginRight: 8 }}>{eventIcons[event.event] || '•'}</span>
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                          {event.event?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {event.timestamp ? format(new Date(event.timestamp), 'MMM d, yyyy · h:mm a') : '—'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                        {event.ip || '—'}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.userAgent ? event.userAgent.substring(0, 60) + '...' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
