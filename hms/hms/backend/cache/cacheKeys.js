/**
 * UPGRADE 7: Cache Key Registry
 *
 * Central place for all cache keys/patterns.
 * Prevents key typos and makes invalidation easy.
 *
 * Naming convention:  <resource>:<variant>:<id>
 * Pattern wildcards:  <resource>:*
 */

const CacheKeys = {
  // ── Dashboard ─────────────────────────────────────────────
  // Role-scoped: admin sees all, doctors see their own patients
  DASHBOARD_STATS: (userId, role) =>
    `dashboard:stats:${role}:${userId}`,

  DASHBOARD_PATTERN: 'dashboard:stats:*',

  // ── Patient stats (shared across roles) ──────────────────
  PATIENT_STATS: 'patient:stats:all',
  PATIENT_LIST: (page, limit, filters) =>
    `patient:list:${page}:${limit}:${JSON.stringify(filters)}`,

  PATIENT_PATTERN: 'patient:*',

  // ── Appointment stats ─────────────────────────────────────
  APPOINTMENT_STATS: (userId, role) =>
    `appointment:stats:${role}:${userId}`,
  APPOINTMENT_SLOTS: (doctorId, date) =>
    `appointment:slots:${doctorId}:${date}`,

  APPOINTMENT_PATTERN: 'appointment:*',

  // ── Pharmacy ─────────────────────────────────────────────
  PHARMACY_STATS:    'pharmacy:stats',
  MEDICINE_LIST:     (page, limit) => `medicine:list:${page}:${limit}`,
  MEDICINE_PATTERN:  'medicine:*',
  PHARMACY_PATTERN:  'pharmacy:*',

  // ── Billing stats ─────────────────────────────────────────
  BILLING_STATS:    'billing:stats',
  BILLING_PATTERN:  'billing:*',

  // ── Staff / user lists ─────────────────────────────────────
  DOCTORS_LIST:    'users:doctors',
  STAFF_STATS:     'users:stats',
  USERS_PATTERN:   'users:*',
};

/**
 * TTL values in seconds — configure via .env or use defaults
 */
const TTL = {
  DASHBOARD:   Number(process.env.CACHE_TTL_DASHBOARD)  || 30,   // 30s  — frequently changing
  STATS:       Number(process.env.CACHE_TTL_STATS)       || 60,   // 1min — moderate change
  MEDICINES:   Number(process.env.CACHE_TTL_MEDICINES)   || 120,  // 2min — infrequent change
  DOCTORS:     5 * 60,   // 5min — rarely changes
  SLOTS:       60,        // 1min — booking dependent
  LONG:        10 * 60,  // 10min
};

module.exports = { CacheKeys, TTL };
