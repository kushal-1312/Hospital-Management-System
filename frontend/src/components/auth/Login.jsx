import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';

export default function Login() {
  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa'
  const [form, setForm] = useState({ email: '', password: '' });
  const [twoFACode, setTwoFACode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, completeSession } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Enter email and password');
    setLoading(true);
    try {
      const res = await login(form.email, form.password);

      // UPGRADE 1D: If server requests 2FA, show the code step
      if (res?.requiresTwoFactor) {
        setPreAuthToken(res.preAuthToken);
        setStep('2fa');
        toast('Enter your authenticator code', { icon: '🔐' });
        return;
      }

      toast.success('Welcome back!');
      navigate('/command-center');
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed';
      // UPGRADE 1B: Show lockout message distinctly
      if (err.response?.status === 423) {
        toast.error(msg, { duration: 6000, icon: '🔒' });
      } else {
        toast.error(msg);
      }
    } finally { setLoading(false); }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (!twoFACode || twoFACode.length < 6) return toast.error('Enter the 6-digit code');
    setLoading(true);
    try {
      const res = await authAPI.verifyTwoFactor({ preAuthToken, code: twoFACode });
      completeSession(res.data);
      navigate('/command-center');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code');
    } finally { setLoading(false); }
  };

  const fillDemo = (role) => {
    const creds = {
      admin: { email: 'admin@hms.com', password: 'Admin@1234' },
      doctor: { email: 'doctor1@hms.com', password: 'Admin@1234' },
      nurse: { email: 'nurse1@hms.com', password: 'Admin@1234' },
      staff: { email: 'staff1@hms.com', password: 'Admin@1234' },
    };
    setForm(creds[role]);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>Med<span>Care</span></h1>
          <p>Hospital Management System</p>
        </div>

        {/* ── Step 1: Credentials ───────────────────────────── */}
        {step === 'credentials' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" className="form-control" placeholder="your@email.com"
                value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" className="form-control" placeholder="••••••••"
                value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
            </div>

            {/* UPGRADE 1C: Forgot password link */}
            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <Link to="/forgot-password" style={{ fontSize: '0.82rem', color: 'var(--primary)', textDecoration: 'underline' }}>
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* ── Step 2: 2FA Code ──────────────────────────────── */}
        {step === '2fa' && (
          <form onSubmit={handleVerify2FA}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔐</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Open your authenticator app and enter the 6-digit code for <strong>MedCare HMS</strong>.
              </p>
            </div>
            <div className="form-group">
              <label>Authenticator Code</label>
              <input
                className="form-control"
                placeholder="000 000"
                value={twoFACode}
                onChange={e => setTwoFACode(e.target.value.replace(/\s/g, ''))}
                maxLength={6}
                style={{ fontSize: '1.4rem', letterSpacing: '0.3em', textAlign: 'center' }}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setStep('credentials'); setTwoFACode(''); }}
              style={{ width: '100%', marginTop: 8 }}>
              ← Back to login
            </button>
          </form>
        )}

        {/* Demo accounts */}
        {step === 'credentials' && (
          <div className="login-demo">
            <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--primary-dark)' }}>Demo Accounts</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['admin','doctor','nurse','staff'].map(role => (
                <button key={role} onClick={() => fillDemo(role)} className="btn btn-secondary btn-sm" style={{ textTransform: 'capitalize' }}>
                  {role}
                </button>
              ))}
            </div>
            <p style={{ marginTop: 8, fontSize: '0.78rem' }}><strong>Password:</strong> Admin@1234</p>
          </div>
        )}
      </div>
    </div>
  );
}
