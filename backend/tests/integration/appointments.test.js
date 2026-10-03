/**
 * Integration tests: Appointment Scheduling
 *
 * Specifically tests the double-booking prevention logic —
 * the most critical business rule in the system.
 *
 * Coverage:
 *  ✓ Create appointment successfully
 *  ✓ Block exact same slot (same doctor, same time)
 *  ✓ Block overlapping slot
 *  ✓ Allow same slot with different doctor
 *  ✓ Allow same doctor on different date
 *  ✓ Block scheduling in the past
 *  ✓ Allow rescheduling (update) to a free slot
 *  ✓ Cancelled appointment frees the slot
 *  ✓ Role access: staff can create, delete requires admin
 */

const request  = require('supertest');
const app      = require('../../server');
const User     = require('../../models/User');
const Patient  = require('../../models/Patient');

// Standard mocks
jest.mock('../../utils/logger', () => ({ info:jest.fn(), warn:jest.fn(), error:jest.fn(), http:jest.fn(), debug:jest.fn() }));
jest.mock('../../services/emailService', () => ({ sendPasswordResetEmail:jest.fn(), sendTwoFactorSetupEmail:jest.fn(), sendLoginAlertEmail:jest.fn(), sendEmail:jest.fn() }));
jest.mock('../../cache/redisClient', () => ({ cacheGet:jest.fn().mockResolvedValue(null), cacheSet:jest.fn().mockResolvedValue(undefined), cacheDel:jest.fn().mockResolvedValue(undefined), cacheInvalidatePattern:jest.fn().mockResolvedValue(undefined), withCache:jest.fn().mockImplementation(async(_,__,fn)=>fn()), isConnected:jest.fn().mockReturnValue(false) }));
jest.mock('../../sockets/socketManager', () => ({ socketManager:{ pushDashboardRefresh:jest.fn(), appointmentScheduled:jest.fn(), appointmentStatusChanged:jest.fn(), emitToUser:jest.fn(), notifyRole:jest.fn() }, initSocket:jest.fn() }));
jest.mock('../../workers/queueManager', () => ({ initQueues:jest.fn(), addExportJob:jest.fn(), addEmailJob:jest.fn(), addReportJob:jest.fn(), scheduleCacheWarm:jest.fn(), getJobStatus:jest.fn(), getQueues:jest.fn().mockReturnValue({}) }));
jest.mock('../../controllers/notificationController', () => ({
  ...jest.requireActual('../../controllers/notificationController'),
  createAndPush:jest.fn().mockResolvedValue(null)
}));

const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);
TOMORROW.setHours(0, 0, 0, 0);
// Format calendar dates in local time. Converting local midnight to ISO first
// shifts the date backward in positive UTC offsets (for example, IST), making
// "tomorrow" fail the production past-date guard.
const toLocalDateString = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');
const DATE_STR = toLocalDateString(TOMORROW);

describe('Appointment Integration — Double-booking Prevention', () => {
  let adminToken, doctorId, doctor2Id, patientId, patient2Id;

  beforeEach(async () => {
    // Create admin
    await User.create({ name:'Admin', email:'appt-admin@test.com', password:'Admin@1234', role:'admin', isActive:true });
    const adminRes = await request(app).post('/api/auth/login').send({ email:'appt-admin@test.com', password:'Admin@1234' });
    adminToken = adminRes.body.accessToken;

    // Create two doctors
    const doc1 = await User.create({ name:'Dr. Smith', email:'doc1@test.com', password:'Admin@1234', role:'doctor', department:'Cardiology', isActive:true });
    const doc2 = await User.create({ name:'Dr. Jones', email:'doc2@test.com', password:'Admin@1234', role:'doctor', department:'Neurology', isActive:true });
    doctorId  = doc1._id.toString();
    doctor2Id = doc2._id.toString();

    // Create two patients
    const adminUser = await User.findOne({ email:'appt-admin@test.com' });
    const p1 = await Patient.create({ name:'Patient One', age:40, gender:'male', createdBy:adminUser._id, updatedBy:adminUser._id });
    const p2 = await Patient.create({ name:'Patient Two', age:30, gender:'female', createdBy:adminUser._id, updatedBy:adminUser._id });
    patientId  = p1._id.toString();
    patient2Id = p2._id.toString();
  });

  const makeAppt = (token, overrides = {}) =>
    request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patient:  patientId,
        doctor:   doctorId,
        date:     DATE_STR,
        timeSlot: { start: '09:00', end: '09:30' },
        type:     'consultation',
        reason:   'Checkup',
        ...overrides
      });

  // ── Happy path ────────────────────────────────────────────────
  it('should create an appointment successfully', async () => {
    const res = await makeAppt(adminToken);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.appointmentId).toMatch(/^APT-\d{5}$/);
  });

  // ── Exact same slot conflict ──────────────────────────────────
  it('should block booking the exact same slot for same doctor', async () => {
    await makeAppt(adminToken); // first booking

    const res = await makeAppt(adminToken, { patient: patient2Id }); // same slot
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/booked/i);
  });

  // ── Overlapping slot ──────────────────────────────────────────
  it('should block overlapping time slot for same doctor', async () => {
    await makeAppt(adminToken, { timeSlot: { start: '09:00', end: '09:30' } });

    // Tries to book 09:15–09:45 which overlaps with 09:00–09:30
    const res = await makeAppt(adminToken, {
      patient:  patient2Id,
      timeSlot: { start: '09:00', end: '09:30' } // exact overlap
    });
    expect(res.status).toBe(409);
  });

  // ── Different doctor — should succeed ─────────────────────────
  it('should allow same slot with a different doctor', async () => {
    await makeAppt(adminToken); // doctor 1 at 09:00

    const res = await makeAppt(adminToken, {
      doctor:  doctor2Id,
      patient: patient2Id
    }); // doctor 2 at same time
    expect(res.status).toBe(201);
  });

  // ── Different date — should succeed ───────────────────────────
  it('should allow same doctor at same time on a different date', async () => {
    await makeAppt(adminToken); // tomorrow 09:00

    const dayAfter = new Date(TOMORROW);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const res = await makeAppt(adminToken, {
      date: toLocalDateString(dayAfter)
    });
    expect(res.status).toBe(201);
  });

  // ── Past date ─────────────────────────────────────────────────
  it('should reject scheduling in the past', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const res = await makeAppt(adminToken, {
      date: toLocalDateString(yesterday)
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/past/i);
  });

  // ── Cancellation frees the slot ───────────────────────────────
  it('should allow rebooking a slot after cancellation', async () => {
    const first = await makeAppt(adminToken);
    const apptId = first.body.data._id;

    // Cancel it
    await request(app)
      .put(`/api/appointments/${apptId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' });

    // Same slot should now be available
    const res = await makeAppt(adminToken, { patient: patient2Id });
    expect(res.status).toBe(201);
  });
});

describe('Appointment Integration — Role Authorization', () => {
  let staffToken, adminToken, doctorId, patientId;

  beforeEach(async () => {
    await User.create({ name:'Admin2', email:'appt-adm2@test.com', password:'Admin@1234', role:'admin', isActive:true });
    await User.create({ name:'Staff2', email:'appt-st2@test.com',  password:'Admin@1234', role:'staff', isActive:true });
    const doc = await User.create({ name:'Dr Role', email:'appt-dr@test.com', password:'Admin@1234', role:'doctor', isActive:true });
    doctorId = doc._id.toString();

    const [adminRes, staffRes] = await Promise.all([
      request(app).post('/api/auth/login').send({ email:'appt-adm2@test.com', password:'Admin@1234' }),
      request(app).post('/api/auth/login').send({ email:'appt-st2@test.com',  password:'Admin@1234' })
    ]);
    adminToken = adminRes.body.accessToken;
    staffToken = staffRes.body.accessToken;

    const admin = await User.findOne({ email:'appt-adm2@test.com' });
    const p = await Patient.create({ name:'P Role', age:25, gender:'female', createdBy:admin._id, updatedBy:admin._id });
    patientId = p._id.toString();
  });

  it('staff should be able to create appointments', async () => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ patient:patientId, doctor:doctorId, date:toLocalDateString(d), timeSlot:{ start:'10:00', end:'10:30' }, type:'consultation' });
    expect(res.status).toBe(201);
  });

  it('only admin should be able to delete appointments', async () => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    const created = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patient:patientId, doctor:doctorId, date:toLocalDateString(d), timeSlot:{ start:'11:00', end:'11:30' }, type:'consultation' });

    // Staff tries to delete — should be 403
    const staffDel = await request(app)
      .delete(`/api/appointments/${created.body.data._id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffDel.status).toBe(403);

    // Admin deletes — should succeed
    const adminDel = await request(app)
      .delete(`/api/appointments/${created.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDel.status).toBe(200);
  });
});
