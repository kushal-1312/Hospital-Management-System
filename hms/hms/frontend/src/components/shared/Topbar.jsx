import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import NotificationBell from '../notifications/NotificationBell';
import CacheStatus from './CacheStatus';  // UPGRADE 7

const titles = {
  '/command-center': { title: 'Care Command Center', sub: 'Live priorities, patient flow and hospital capacity' },
  '/dashboard':    { title: 'Dashboard',           sub: 'Live overview of hospital operations' },
  '/patients':     { title: 'Patient Management',  sub: 'View and manage patient records' },
  '/appointments': { title: 'Appointments',         sub: 'Schedule and track appointments' },
  '/billing':      { title: 'Billing & Invoices',   sub: 'Manage invoices, payments and insurance' },
  '/pharmacy':     { title: 'Pharmacy & Inventory', sub: 'Medicines, dispensing and stock management' },
  '/reports':      { title: 'Reports & Analytics', sub: 'Department, revenue, demographics and performance insights' },
  '/staff':        { title: 'Staff Management',     sub: 'Manage hospital staff' },
  '/security':     { title: 'Security Settings',    sub: 'Password, 2FA, and login activity' },
};

export default function Topbar({ onMenuToggle }) {
  const location = useLocation();
  const { user }        = useAuth();
  const { isDark, toggle } = useTheme();

  const info = Object.entries(titles).find(([p]) => location.pathname.startsWith(p));
  const { title = 'MedCare HMS', sub = '' } = info?.[1] || {};

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Hamburger — visible on mobile only via CSS */}
        <button className="hamburger-btn" onClick={onMenuToggle} aria-label="Toggle menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="topbar-title">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
      </div>

      <div className="topbar-right">
        {!user?.twoFactorEnabled && (
          <a href="/security" style={{ display:'flex', alignItems:'center', gap:6, background:'var(--warning-light)', border:'1px solid var(--warning)', borderRadius:'var(--radius-sm)', padding:'5px 10px', fontSize:'0.75rem', color:'var(--warning)', textDecoration:'none', fontWeight:600 }}>
            ⚠️ Enable 2FA
          </a>
        )}
        {/* UPGRADE 7: Redis cache indicator (admin only) */}
        <CacheStatus />
        {/* Dark mode toggle */}
        <button className="theme-toggle" onClick={toggle} title={isDark ? 'Light mode' : 'Dark mode'} aria-label="Toggle dark mode">
          {isDark ? '☀️' : '🌙'}
        </button>
        <NotificationBell />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-IN', { weekday:'short', month:'short', day:'numeric', year:'numeric' })}
        </span>
      </div>
    </header>
  );
}
