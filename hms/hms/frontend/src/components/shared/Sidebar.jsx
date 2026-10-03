import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const icons = {
  command:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>,
  dashboard:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  patients:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  appointments: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  calendar:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>,
  billing:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  pharmacy:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>,
  reports:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6"  y1="20" x2="6"  y2="14"/><line x1="2"  y1="20" x2="22" y2="20"/></svg>,
  staff:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  security:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  logout:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

const navItems = [
  { label: 'Command Center', path: '/command-center', icon: 'command', roles: ['admin','doctor','nurse','staff'] },
  { label: 'Dashboard',    path: '/dashboard',    icon: 'dashboard',    roles: ['admin','doctor','nurse','staff'] },
  { label: 'Patients',     path: '/patients',     icon: 'patients',     roles: ['admin','doctor','nurse','staff'] },
  { label: 'Appointments', path: '/appointments', icon: 'appointments', roles: ['admin','doctor','nurse','staff'] },
  { label: 'Calendar',     path: '/calendar',     icon: 'calendar',     roles: ['admin','doctor','nurse','staff'] },
  { label: 'Billing',      path: '/billing',      icon: 'billing',      roles: ['admin','staff'] },
  { label: 'Pharmacy',     path: '/pharmacy',     icon: 'pharmacy',     roles: ['admin','staff','nurse'] },
  { label: 'Reports',      path: '/reports',      icon: 'reports',      roles: ['admin','doctor'] },
  { label: 'Staff',        path: '/staff',        icon: 'staff',        roles: ['admin'] },
];

const bottomItems = [
  { label: 'Security', path: '/security', icon: 'security', roles: ['admin','doctor','nurse','staff'] },
];

export default function Sidebar({ isOpen }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const isActive = (path) => location.pathname.startsWith(path);

  const renderItem = (item) => {
    if (!item.roles.includes(user?.role)) return null;
    return (
      <button key={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`} onClick={() => navigate(item.path)}>
        {icons[item.icon]}
        {item.label}
        {item.path === '/security' && !user?.twoFactorEnabled && (
          <span style={{ marginLeft:'auto', background:'#f59e0b', borderRadius:'50%', width:8, height:8, display:'inline-block', flexShrink:0 }} title="2FA not enabled" />
        )}
      </button>
    );
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h1>Med<span>Care</span></h1>
        <p>HMS · v2.7</p>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-label">Main Menu</div>
        {navItems.map(renderItem)}
        <div className="nav-section-label" style={{ marginTop: 8 }}>Account</div>
        {bottomItems.map(renderItem)}
      </nav>
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{user?.name?.charAt(0).toUpperCase()}</div>
          <div className="user-meta">
            <strong>{user?.name}</strong>
            <span>{user?.role}</span>
          </div>
          {user?.twoFactorEnabled && <span title="2FA enabled" style={{ marginLeft:'auto', fontSize:'0.85rem' }}>🔐</span>}
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          {icons.logout}&nbsp; Sign Out
        </button>
      </div>
    </aside>
  );
}
