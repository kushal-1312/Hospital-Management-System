import { useState, useEffect } from 'react';
import useSocket from '../../hooks/useSocket';
import { format } from 'date-fns';

/**
 * UPGRADE 2: LiveStatusBar
 *
 * Small indicator strip shown on the dashboard that tells users:
 * - Whether the live Socket.io connection is active
 * - When data was last refreshed
 * - Pulsing green dot = live, grey dot = polling mode
 */
export default function LiveStatusBar({ lastUpdated, isLive, onRefresh }) {
  const { socket } = useSocket();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    setConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '6px 14px',
      background: connected ? 'var(--success-light)' : 'var(--bg)',
      border: `1px solid ${connected ? 'rgba(5,150,105,0.2)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-sm)',
      fontSize: '0.75rem',
      color: connected ? 'var(--success)' : 'var(--text-muted)'
    }}>
      {/* Pulsing dot */}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: connected ? 'var(--success)' : '#9ca3af',
          display: 'inline-block'
        }} />
        {connected && (
          <span style={{
            position: 'absolute',
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--success)',
            opacity: 0.4,
            animation: 'pulse 2s infinite'
          }} />
        )}
      </span>

      <span style={{ fontWeight: 600 }}>
        {connected ? '● Live' : '○ Polling'}
      </span>

      {lastUpdated && (
        <span style={{ color: 'var(--text-muted)' }}>
          Updated {format(lastUpdated, 'h:mm:ss a')}
        </span>
      )}

      <button
        onClick={onRefresh}
        style={{
          marginLeft: 'auto',
          background: 'none', border: 'none',
          color: connected ? 'var(--success)' : 'var(--text-muted)',
          cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4
        }}
        title="Refresh now"
      >
        ↻ Refresh
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
