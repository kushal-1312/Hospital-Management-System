import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email address');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err) {
      // Always show success to prevent user enumeration
      setSent(true);
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>Med<span>Care</span></h1>
          <p>Password Recovery</p>
        </div>

        {!sent ? (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.9rem', lineHeight: 1.6 }}>
              Enter the email address associated with your account and we'll send you a password reset link.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" className="form-control" placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} autoFocus />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>📧</div>
            <h3 style={{ marginBottom: 12, color: 'var(--primary-dark)' }}>Check your inbox</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>
              If an account exists for <strong>{email}</strong>, you'll receive a password reset email within a few minutes.
              Check your spam folder if you don't see it.
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              The link expires in {import.meta.env.VITE_RESET_TOKEN_EXPIRE || 10} minutes.
            </p>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/login" style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
