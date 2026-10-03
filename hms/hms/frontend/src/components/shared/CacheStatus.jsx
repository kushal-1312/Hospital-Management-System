import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/**
 * UPGRADE 7: CacheStatus
 *
 * Small indicator shown in the topbar for admin users.
 * Shows whether Redis is connected and caching is active.
 * Polls every 60s.
 */
export default function CacheStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null); // null | 'connected' | 'unavailable'

  useEffect(() => {
    if (user?.role !== 'admin') return;

    const check = async () => {
      try {
        const res = await api.get('/system/cache');
        setStatus(res.data.data.redis.connected ? 'connected' : 'unavailable');
      } catch {
        setStatus('unavailable');
      }
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  // Only show for admin
  if (user?.role !== 'admin' || status === null) return null;

  return (
    <div
      title={status === 'connected' ? 'Redis cache: active' : 'Redis cache: unavailable (fallback to DB)'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        background: status === 'connected' ? 'var(--success-light)' : 'var(--warning-light)',
        border: `1px solid ${status === 'connected' ? 'rgba(5,150,105,0.25)' : 'rgba(217,119,6,0.25)'}`,
        fontSize: '0.7rem',
        fontWeight: 700,
        color: status === 'connected' ? 'var(--success)' : 'var(--warning)',
        cursor: 'default',
        userSelect: 'none'
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: status === 'connected' ? 'var(--success)' : 'var(--warning)',
        animation: status === 'connected' ? 'none' : undefined
      }} />
      {status === 'connected' ? 'Cache ✓' : 'Cache ✗'}
    </div>
  );
}
