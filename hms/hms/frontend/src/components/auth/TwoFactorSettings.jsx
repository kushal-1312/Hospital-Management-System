import { useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function TwoFactorSettings() {
  const { user, setUser } = useAuth();
  const [step, setStep] = useState('idle'); // idle | setup | backup
  const [qrCode, setQrCode] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDisable, setShowDisable] = useState(false);

  const startSetup = async () => {
    setLoading(true);
    try {
      const res = await authAPI.setup2FA();
      setQrCode(res.data.data.qrCode);
      setManualKey(res.data.data.manualKey);
      setStep('setup');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Setup failed');
    } finally { setLoading(false); }
  };

  const verifyAndEnable = async (e) => {
    e.preventDefault();
    if (!code || code.length < 6) return toast.error('Enter the 6-digit code');
    setLoading(true);
    try {
      const res = await authAPI.verify2FA(code);
      setBackupCodes(res.data.backupCodes);
      setUser(prev => ({ ...prev, twoFactorEnabled: true }));
      setStep('backup');
      toast.success('2FA enabled successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code');
    } finally { setLoading(false); }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    if (!disablePassword) return toast.error('Enter your password');
    setLoading(true);
    try {
      await authAPI.disable2FA(disablePassword);
      setUser(prev => ({ ...prev, twoFactorEnabled: false }));
      setShowDisable(false);
      setStep('idle');
      toast.success('2FA disabled');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Incorrect password');
    } finally { setLoading(false); }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('Backup codes copied to clipboard');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>Two-Factor Authentication (2FA)</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>
            Add an extra layer of security using a TOTP authenticator app
          </p>
        </div>
        <span className={`badge ${user?.twoFactorEnabled ? 'badge-active' : 'badge-cancelled'}`} style={{ fontSize: '0.78rem', padding: '5px 12px' }}>
          {user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* ── Idle State ────────────────────────────────────── */}
      {step === 'idle' && !user?.twoFactorEnabled && (
        <div>
          <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ color: 'var(--warning)', fontSize: '0.85rem', lineHeight: 1.5 }}>
              <strong>2FA is not enabled.</strong> We strongly recommend enabling two-factor authentication to protect patient data.
            </p>
          </div>
          <button className="btn btn-primary" onClick={startSetup} disabled={loading}>
            {loading ? 'Loading...' : '🔐 Enable Two-Factor Authentication'}
          </button>
        </div>
      )}

      {/* ── Already enabled ───────────────────────────────── */}
      {step === 'idle' && user?.twoFactorEnabled && (
        <div>
          <div style={{ background: 'var(--success-light)', border: '1px solid var(--success)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ color: 'var(--success)', fontSize: '0.85rem' }}>
              ✅ Your account is protected with two-factor authentication.
            </p>
          </div>
          {!showDisable ? (
            <button className="btn btn-danger btn-sm" onClick={() => setShowDisable(true)}>
              Disable 2FA
            </button>
          ) : (
            <form onSubmit={handleDisable} style={{ maxWidth: 320 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Enter your password to confirm disabling 2FA:
              </p>
              <div className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <input type="password" className="form-control" placeholder="Your password"
                    value={disablePassword} onChange={e => setDisablePassword(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-danger" disabled={loading}>
                    {loading ? 'Disabling...' : 'Confirm'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowDisable(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Setup: QR Code ────────────────────────────────── */}
      {step === 'setup' && (
        <div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.9rem', lineHeight: 1.6 }}>
            Scan this QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app.
            Then enter the 6-digit code to verify setup.
          </p>

          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24 }}>
            {/* QR Code */}
            <div style={{ textAlign: 'center' }}>
              {qrCode && <img src={qrCode} alt="2FA QR Code" style={{ width: 200, height: 200, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8 }} />}
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Scan with your authenticator app</p>
            </div>

            {/* Manual entry */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Can't scan? Enter this key manually in your app:
              </p>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.9rem', letterSpacing: '0.1em', wordBreak: 'break-all', color: 'var(--primary-dark)' }}>
                {manualKey}
              </div>
            </div>
          </div>

          <form onSubmit={verifyAndEnable}>
            <div className="form-group" style={{ maxWidth: 240 }}>
              <label>Verification Code</label>
              <input
                className="form-control"
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                style={{ fontSize: '1.3rem', letterSpacing: '0.3em', textAlign: 'center' }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={loading || code.length < 6}>
                {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setStep('idle')}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Backup Codes (shown once after setup) ─────────── */}
      {step === 'backup' && (
        <div>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ color: '#c2410c', fontWeight: 700, marginBottom: 8 }}>⚠️ Save Your Backup Codes</p>
            <p style={{ color: '#9a3412', fontSize: '0.85rem', lineHeight: 1.6 }}>
              These codes can be used to access your account if you lose your authenticator device.
              <strong> Each code can only be used once.</strong> Store them somewhere safe — you won't see them again.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20, maxWidth: 400 }}>
            {backupCodes.map((code, i) => (
              <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px', fontFamily: 'monospace', fontSize: '0.85rem', textAlign: 'center', fontWeight: 600, letterSpacing: '0.05em' }}>
                {code}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={copyBackupCodes}>
              📋 Copy All Codes
            </button>
            <button className="btn btn-secondary" onClick={() => setStep('idle')}>
              I've saved my codes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
