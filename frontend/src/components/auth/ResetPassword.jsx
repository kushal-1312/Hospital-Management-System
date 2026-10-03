import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../../services/api';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.password !== form.confirm) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      await authAPI.resetPassword(token, form.password);
      toast.success('Password reset! Please sign in with your new password.');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.message || 'Reset failed. Link may have expired.';
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const strength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const score = strength(form.password);
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const strengthColors = ['', '#dc2626', '#d97706', '#2563eb', '#059669', '#0a6e5e'];

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>Med<span>Care</span></h1>
          <p>Set New Password</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" className="form-control" placeholder="Minimum 8 characters"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} autoFocus />
            {form.password && (
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
            <label>Confirm Password</label>
            <input type="password" className="form-control" placeholder="Re-enter new password"
              value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} />
            {form.confirm && form.password !== form.confirm && (
              <p className="form-error">Passwords do not match</p>
            )}
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading || form.password !== form.confirm} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/login" style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>← Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
