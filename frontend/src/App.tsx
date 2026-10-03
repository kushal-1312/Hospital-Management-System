import { lazy, Suspense, type PropsWithChildren } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/shared/AppLayout';
import type { Role } from './types/domain';
import './styles/global.css';

const Login = lazy(() => import('./components/auth/Login'));
const ForgotPassword = lazy(() => import('./components/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./components/auth/ResetPassword'));
const SecuritySettings = lazy(() => import('./components/auth/SecuritySettings'));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const CommandCenter = lazy(() => import('./components/operations/CommandCenter'));
const PatientList = lazy(() => import('./components/patients/PatientList'));
const PatientDetail = lazy(() => import('./components/patients/PatientDetail'));
const Appointments = lazy(() => import('./components/appointments/Appointments').then((module) => ({ default: module.Appointments })));
const Staff = lazy(() => import('./components/appointments/Appointments').then((module) => ({ default: module.Staff })));
const BillingList = lazy(() => import('./components/billing/BillingList'));
const InvoiceDetail = lazy(() => import('./components/billing/InvoiceDetail'));
const PharmacyDashboard = lazy(() => import('./components/pharmacy/PharmacyDashboard'));
const CalendarView = lazy(() => import('./components/calendar/CalendarView'));
const ReportsDashboard = lazy(() => import('./components/reports/ReportsDashboard'));

function ScreenLoader() {
  return <div className="route-loader" role="status"><span className="spinner" /><span>Opening workspace…</span></div>;
}

function ProtectedPage({ children, roles }: PropsWithChildren<{ roles?: Role[] }>) {
  return <ProtectedRoute roles={roles}><AppLayout>{children}</AppLayout></ProtectedRoute>;
}

function NotFound() {
  return (
    <main className="not-found">
      <span>404</span>
      <h1>That workspace does not exist</h1>
      <p>Return to the care command center to continue.</p>
      <a href="/command-center" className="btn btn-primary">Go to command center</a>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Toaster position="top-right" toastOptions={{ duration: 3500, style: { fontSize: '0.875rem', borderRadius: '10px', boxShadow: '0 12px 30px rgba(15, 32, 39, 0.14)' } }} />
          <Suspense fallback={<ScreenLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route path="/" element={<Navigate to="/command-center" replace />} />
              <Route path="/command-center" element={<ProtectedPage><CommandCenter /></ProtectedPage>} />
              <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
              <Route path="/patients" element={<ProtectedPage><PatientList /></ProtectedPage>} />
              <Route path="/patients/:id" element={<ProtectedPage><PatientDetail /></ProtectedPage>} />
              <Route path="/appointments" element={<ProtectedPage><Appointments /></ProtectedPage>} />
              <Route path="/calendar" element={<ProtectedPage><CalendarView /></ProtectedPage>} />
              <Route path="/security" element={<ProtectedPage><SecuritySettings /></ProtectedPage>} />
              <Route path="/billing" element={<ProtectedPage roles={['admin', 'staff']}><BillingList /></ProtectedPage>} />
              <Route path="/billing/:id" element={<ProtectedPage roles={['admin', 'staff', 'doctor']}><InvoiceDetail /></ProtectedPage>} />
              <Route path="/pharmacy" element={<ProtectedPage roles={['admin', 'staff', 'nurse']}><PharmacyDashboard /></ProtectedPage>} />
              <Route path="/reports" element={<ProtectedPage roles={['admin', 'doctor']}><ReportsDashboard /></ProtectedPage>} />
              <Route path="/staff" element={<ProtectedPage roles={['admin']}><Staff /></ProtectedPage>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
