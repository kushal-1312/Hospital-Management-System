import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Login from './components/auth/Login';
import Sidebar from './components/shared/Sidebar';
import Topbar from './components/shared/Topbar';
import Dashboard from './components/dashboard/Dashboard';
import PatientList from './components/patients/PatientList';
import PatientDetail from './components/patients/PatientDetail';
import Appointments from './components/appointments/Appointments';
import Staff from './components/staff/Staff';
import './styles/global.css';

// Layout wrapper for authenticated pages
const AppLayout = ({ children }) => (
  <div className="app-layout">
    <Sidebar />
    <div className="main-content">
      <Topbar />
      <main>{children}</main>
    </div>
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              fontSize: '0.875rem',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
            },
            success: { iconTheme: { primary: '#0a6e5e', secondary: '#fff' } }
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Protected – all roles */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <AppLayout><Dashboard /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/patients" element={
            <ProtectedRoute>
              <AppLayout><PatientList /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/patients/:id" element={
            <ProtectedRoute>
              <AppLayout><PatientDetail /></AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/appointments" element={
            <ProtectedRoute>
              <AppLayout><Appointments /></AppLayout>
            </ProtectedRoute>
          } />

          {/* Admin only */}
          <Route path="/staff" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Staff /></AppLayout>
            </ProtectedRoute>
          } />

          {/* 404 */}
          <Route path="*" element={
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <h1 style={{ fontSize: '4rem', color: 'var(--primary)' }}>404</h1>
              <p>Page not found</p>
              <a href="/dashboard" style={{ color: 'var(--primary)' }}>Go to Dashboard</a>
            </div>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
