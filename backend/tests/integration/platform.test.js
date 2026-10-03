const request = require('supertest');
const app = require('../../server');
const Appointment = require('../../models/Appointment');
const Medicine = require('../../models/Medicine');
const Patient = require('../../models/Patient');
const User = require('../../models/User');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn()
}));

describe('Enterprise platform endpoints', () => {
  it('exposes liveness, readiness, correlation IDs, and metrics', async () => {
    const live = await request(app).get('/health/live');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('alive');
    expect(live.headers['x-request-id']).toBeDefined();

    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.checks.database).toBe('connected');

    const metrics = await request(app).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.text).toContain('medcare_http_requests_total');
  });

  it('rejects unauthenticated command-center access', async () => {
    const response = await request(app).get('/api/operations/command-center');
    expect(response.status).toBe(401);
  });

  it('assembles a role-aware operational snapshot', async () => {
    const admin = await User.create(global.sampleUser('admin', { email: 'ops-admin@test.com' }));
    const doctor = await User.create(global.sampleUser('doctor', { email: 'ops-doctor@test.com' }));
    const patient = await Patient.create({
      name: 'Critical Patient', age: 54, gender: 'female', status: 'critical', assignedDoctor: doctor._id
    });
    const now = new Date();
    await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      patientName: patient.name,
      doctorName: doctor.name,
      date: now,
      timeSlot: { start: '09:00', end: '09:30' },
      status: 'pending'
    });
    await Medicine.create({ name: 'Critical stock item', code: 'OPS-001', currentStock: 3, reorderLevel: 5 });

    const response = await request(app)
      .get('/api/operations/command-center')
      .set(global.authHeader(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.clinical.criticalPatients).toBe(1);
    expect(response.body.data.flow.awaitingConfirmation).toBe(1);
    expect(response.body.data.pharmacy.lowStockItems).toBe(1);
    expect(response.body.data.alerts.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data.finance).toBeDefined();
  });

  it('restricts the global audit trail to administrators', async () => {
    const nurse = await User.create(global.sampleUser('nurse', { email: 'audit-nurse@test.com' }));
    const response = await request(app)
      .get('/api/operations/audit-trail')
      .set(global.authHeader(nurse));
    expect(response.status).toBe(403);
  });
});
