import React from 'react';
import { useLocation } from 'react-router-dom';

const titles = {
  '/dashboard': { title: 'Dashboard', sub: 'Overview of hospital operations' },
  '/patients': { title: 'Patient Management', sub: 'View and manage patient records' },
  '/appointments': { title: 'Appointments', sub: 'Schedule and track appointments' },
  '/staff': { title: 'Staff Management', sub: 'Manage hospital staff' },
};

export default function Topbar() {
  const location = useLocation();
  const info = Object.entries(titles).find(([path]) => location.pathname.startsWith(path));
  const { title = 'MedCare HMS', sub = '' } = info?.[1] || {};
  const now = new Date();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      <div className="topbar-right">
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {now.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
    </header>
  );
}
