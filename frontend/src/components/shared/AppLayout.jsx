import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * UPGRADE 5: AppLayout
 *
 * Extracted from App.js into its own component so it can:
 * - Track sidebarOpen state for mobile
 * - Pass onMenuToggle to Topbar
 * - Render the overlay div that closes sidebar on outside tap
 * - Auto-close sidebar on route change (mobile UX)
 */
export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar whenever the route changes on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleMenu = useCallback(() => setSidebarOpen(prev => !prev), []);
  const closeMenu  = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="app-layout">
      {/* Sidebar — receives open state for mobile class */}
      <Sidebar isOpen={sidebarOpen} />

      {/* Overlay — tapping it closes the sidebar on mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      {/* Main area */}
      <div className="main-content">
        <Topbar onMenuToggle={toggleMenu} />
        <main>{children}</main>
      </div>
    </div>
  );
}
