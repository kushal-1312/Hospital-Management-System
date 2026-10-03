export type Role = 'admin' | 'doctor' | 'nurse' | 'staff';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  specialization?: string;
  phone?: string;
  isActive: boolean;
  twoFactorEnabled?: boolean;
}

export type PatientStatus =
  | 'active'
  | 'discharged'
  | 'critical'
  | 'stable'
  | 'under-observation';

export interface PatientSummary {
  _id: string;
  patientId: string;
  name: string;
  status: PatientStatus;
  gender?: 'male' | 'female' | 'other';
  createdAt?: string;
}

export interface AppointmentSummary {
  _id: string;
  appointmentId?: string;
  patient?: Pick<PatientSummary, '_id' | 'patientId' | 'name'>;
  patientName?: string;
  doctor?: Pick<User, '_id' | 'name' | 'specialization'>;
  doctorName?: string;
  date: string;
  timeSlot: { start: string; end: string };
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
}

export interface DashboardData {
  counts: {
    totalPatients: number;
    activePatients: number;
    criticalPatients: number;
    todayAppointments: number;
    pendingAppointments: number;
    completedAppointments: number;
    totalDoctors: number;
    totalStaff: number;
  };
  recentPatients: PatientSummary[];
  upcomingAppointments: AppointmentSummary[];
  charts: {
    monthlyPatients: Array<{ _id: { year: number; month: number }; count: number }>;
    monthlyAppointments: Array<{ _id: { year: number; month: number }; count: number }>;
  };
}

export interface CommandCenterData {
  generatedAt: string;
  clinical: {
    patientsInCare: number;
    criticalPatients: number;
    underObservation: number;
    dischargedToday: number;
  };
  flow: {
    appointmentsToday: number;
    awaitingConfirmation: number;
    completedToday: number;
    noShowsToday: number;
  };
  capacity: {
    activeDoctors: number;
    activeNurses: number;
    activeSupportStaff: number;
  };
  pharmacy: {
    lowStockItems: number;
    outOfStockItems: number;
    expiringBatches: number;
  };
  finance?: {
    outstandingAmount: number;
    collectedToday: number;
    unpaidInvoices: number;
  };
  alerts: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
    href: string;
  }>;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  requestId?: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
  nextCursor?: string;
}
