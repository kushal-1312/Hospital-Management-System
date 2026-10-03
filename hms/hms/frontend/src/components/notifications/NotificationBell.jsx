import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import useNotifications from '../../hooks/useNotifications';

const typeColors = {
  critical:    { bg: '#fee2e2', text: '#dc2626', icon: '🚨' },
  warning:     { bg: '#fef3c7', text: '#d97706', icon: '⚠️' },
  success:     { bg: '#d1fae5', text: '#059669', icon: '✅' },
  appointment: { bg: '#e0f2fe', text: '#0284c7', icon: '📅' },
  patient:     { bg: '#ede9fe', text: '#7c3aed', icon: '👤' },
  staff:       { bg: '#fce7f3', text: '#be185d', icon: '👥' },
  info:        { bg: '#f0f4f3', text: '#0a6e5e', icon: '🔔' },
  system:      { bg: '#f3f4f6', text: '#6b7280', icon: '⚙️' },
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all'); // 'all' | 'unread'
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const {
    notifications, unreadCount, loading,
    markRead, markAllRead, clearRead, deleteOne
  } = useNotifications();

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = tab === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const handleNotificationClick = (notification) => {
    if (!notification.read) markRead([notification._id]);
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const handleOpen = () => {
    setOpen(prev => !prev);
  };

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* ── Bell Button ────────────────────────────────────── */}
      <button
        onClick={handleOpen}
        style={{
          position: 'relative',
          width: 38, height: 38,
          borderRadius: '50%',
          border: open ? '2px solid var(--primary)' : '1.5px solid var(--border)',
          background: open ? 'var(--primary-50)' : 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'var(--transition)'
        }}
        title="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke={open ? 'var(--primary)' : 'var(--text-secondary)'}
          strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: 'var(--danger)', color: '#fff',
            borderRadius: '50%', minWidth: 18, height: 18,
            fontSize: '0.65rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid var(--bg-card)'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ─────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'absolute', top: 46, right: 0,
          width: 380, maxHeight: 520,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 200,
          display: 'flex', flexDirection: 'column',
          animation: 'modalIn 0.15s ease'
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{ marginLeft: 8, background: 'var(--danger)', color: '#fff', borderRadius: 50, fontSize: '0.65rem', padding: '1px 7px', fontWeight: 700 }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{ fontSize: '0.72rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={clearRead}
                style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear read
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
            {[['all','All'], ['unread','Unread']].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 12px', fontSize: '0.78rem', fontWeight: 600,
                color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -1
              }}>
                {l}
              </button>
            ))}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔔</div>
                <p style={{ fontSize: '0.85rem' }}>
                  {tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
              </div>
            ) : (
              filtered.map(notification => {
                const style = typeColors[notification.type] || typeColors.info;
                return (
                  <div
                    key={notification._id || notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    style={{
                      display: 'flex', gap: 10, padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      cursor: notification.link ? 'pointer' : 'default',
                      background: notification.read ? 'transparent' : 'rgba(10,110,94,0.03)',
                      transition: 'var(--transition)',
                      alignItems: 'flex-start'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = notification.read ? 'transparent' : 'rgba(10,110,94,0.03)'}
                  >
                    {/* Type icon */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: style.bg, color: style.text,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.9rem', flexShrink: 0
                    }}>
                      {style.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{
                          fontSize: '0.82rem', fontWeight: notification.read ? 500 : 700,
                          color: 'var(--text-primary)', lineHeight: 1.3
                        }}>
                          {notification.title}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {notification.timestamp || notification.createdAt
                            ? format(new Date(notification.timestamp || notification.createdAt), 'h:mm a')
                            : ''}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        {notification.body}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notification.read && (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <button
                onClick={() => { navigate('/notifications'); setOpen(false); }}
                style={{ fontSize: '0.78rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                View all notifications →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
