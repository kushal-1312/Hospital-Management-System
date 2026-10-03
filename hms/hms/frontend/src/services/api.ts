import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiEnvelope, CommandCenterData, DashboardData, User } from '../types/domain';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const getCsrfToken = () => {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (!['get', 'head', 'options'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = getCsrfToken();
  }
  return config;
});

type QueuedRequest = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

const processQueue = (error: unknown, token?: string) => {
  failedQueue.forEach(({ resolve, reject }) => (error || !token ? reject(error) : resolve(token)));
  failedQueue = [];
};

const refreshSession = async () => {
  const { data } = await axios.post<{ accessToken: string }>(
    `${BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true, headers: { 'X-CSRF-Token': getCsrfToken() } },
  );
  setAccessToken(data.accessToken);
  return data.accessToken;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string }>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status !== 401 || error.response.data?.code !== 'TOKEN_EXPIRED' || !original || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => failedQueue.push({ resolve, reject }))
        .then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
    }

    original._retry = true;
    isRefreshing = true;
    try {
      const token = await refreshSession();
      processQueue(null, token);
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError);
      setAccessToken(null);
      window.dispatchEvent(new Event('session:expired'));
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

type Params = Record<string, string | number | boolean | undefined>;
type Payload = Record<string, unknown>;

export interface AuthResponse {
  success: boolean;
  accessToken: string;
  user: User;
  requiresTwoFactor?: false;
}

export interface PreAuthResponse {
  success: boolean;
  requiresTwoFactor: true;
  preAuthToken: string;
}

export const authAPI = {
  login: (data: { email: string; password: string }) => api.post<AuthResponse | PreAuthResponse>('/auth/login', data),
  verifyTwoFactor: (data: { preAuthToken: string; code: string }) => api.post<AuthResponse>('/auth/verify-2fa', data),
  refresh: refreshSession,
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get<{ success: boolean; user: User }>('/auth/me'),
  register: (data: Payload) => api.post('/auth/register', data),
  changePassword: (data: Payload) => api.put('/auth/change-password', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post(`/auth/reset-password/${token}`, { password }),
  setup2FA: () => api.post('/auth/2fa/setup'),
  verify2FA: (code: string) => api.post('/auth/2fa/verify', { code }),
  disable2FA: (password: string) => api.post('/auth/2fa/disable', { password }),
  getSecurityLog: () => api.get('/auth/security-log'),
};

export const dashboardAPI = {
  getStats: () => api.get<ApiEnvelope<DashboardData>>('/dashboard/stats'),
};

export const operationsAPI = {
  getCommandCenter: () => api.get<ApiEnvelope<CommandCenterData>>('/operations/command-center'),
  getAuditTrail: (params?: Params) => api.get('/operations/audit-trail', { params }),
};

export const patientAPI = {
  getAll: (params?: Params) => api.get('/patients', { params }),
  getOne: (id: string) => api.get(`/patients/${id}`),
  create: (data: Payload) => api.post('/patients', data),
  update: (id: string, data: Payload) => api.put(`/patients/${id}`, data),
  delete: (id: string) => api.delete(`/patients/${id}`),
  addHistory: (id: string, data: Payload) => api.post(`/patients/${id}/history`, data),
  getStats: () => api.get('/patients/stats'),
  export: () => api.get('/patients/export', { responseType: 'blob' }),
};

export const appointmentAPI = {
  getAll: (params?: Params) => api.get('/appointments', { params }),
  getOne: (id: string) => api.get(`/appointments/${id}`),
  create: (data: Payload) => api.post('/appointments', data),
  update: (id: string, data: Payload) => api.put(`/appointments/${id}`, data),
  delete: (id: string) => api.delete(`/appointments/${id}`),
  getStats: () => api.get('/appointments/stats'),
  getSlots: (params?: Params) => api.get('/appointments/slots', { params }),
};

export const userAPI = {
  getAll: (params?: Params) => api.get('/users', { params }),
  getOne: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: Payload) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  getDoctors: () => api.get('/users/doctors'),
  getStats: () => api.get('/users/stats'),
};

export const billingAPI = {
  getAll: (params?: Params) => api.get('/billing', { params }),
  getOne: (id: string) => api.get(`/billing/${id}`),
  create: (data: Payload) => api.post('/billing', data),
  update: (id: string, data: Payload) => api.put(`/billing/${id}`, data),
  delete: (id: string) => api.delete(`/billing/${id}`),
  recordPayment: (id: string, data: Payload) => api.post(`/billing/${id}/payment`, data),
  downloadPDF: (id: string) => api.get(`/billing/${id}/pdf`, { responseType: 'blob' }),
  getStats: () => api.get('/billing/stats'),
  getPatientBills: (patientId: string) => api.get(`/billing/patient/${patientId}`),
  updateInsurance: (id: string, data: Payload) => api.put(`/billing/${id}/insurance`, data),
};

export const pharmacyAPI = {
  getMedicines: (params?: Params) => api.get('/pharmacy/medicines', { params }),
  getMedicine: (id: string) => api.get(`/pharmacy/medicines/${id}`),
  createMedicine: (data: Payload) => api.post('/pharmacy/medicines', data),
  updateMedicine: (id: string, data: Payload) => api.put(`/pharmacy/medicines/${id}`, data),
  deleteMedicine: (id: string) => api.delete(`/pharmacy/medicines/${id}`),
  stockIn: (id: string, data: Payload) => api.post(`/pharmacy/medicines/${id}/stock-in`, data),
  adjustStock: (id: string, data: Payload) => api.post(`/pharmacy/medicines/${id}/adjust`, data),
  dispense: (data: Payload) => api.post('/pharmacy/dispense', data),
  getDispensing: (params?: Params) => api.get('/pharmacy/dispensing', { params }),
  getSuppliers: (params?: Params) => api.get('/pharmacy/suppliers', { params }),
  createSupplier: (data: Payload) => api.post('/pharmacy/suppliers', data),
  updateSupplier: (id: string, data: Payload) => api.put(`/pharmacy/suppliers/${id}`, data),
  getStats: () => api.get('/pharmacy/stats'),
};

export const reportsAPI = {
  getDepartment: (params?: Params) => api.get('/reports/department', { params }),
  getDoctorPerf: (params?: Params) => api.get('/reports/doctor-performance', { params }),
  getRevenue: (params?: Params) => api.get('/reports/revenue', { params }),
  getDemographics: () => api.get('/reports/demographics'),
  getAppointmentStats: (params?: Params) => api.get('/reports/appointments', { params }),
  getSummary: (params?: Params) => api.get('/reports/summary', { params }),
  scheduleEmail: (data: Payload) => api.post('/reports/schedule-email', data),
};

export default api;
