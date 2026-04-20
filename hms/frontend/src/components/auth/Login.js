import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
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

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="Enter your email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="Enter your password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-demo">
          <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--primary-dark)' }}>Demo Accounts</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['admin', 'doctor', 'nurse', 'staff'].map(role => (
              <button
                key={role}
                onClick={() => fillDemo(role)}
                className="btn btn-secondary btn-sm"
                style={{ textTransform: 'capitalize' }}
              >
                {role}
              </button>
            ))}
          </div>
          <p style={{ marginTop: 8 }}>
            <strong>Password:</strong> Admin@1234
          </p>
        </div>
      </div>
    </div>
  );
}
