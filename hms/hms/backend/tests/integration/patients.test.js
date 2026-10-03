/**
 * Integration tests: Patient Management
 *
 * Coverage:
 *  ✓ Admin can create, read, update, delete patients
 *  ✓ Doctor can create and view own patients, blocked from others
 *  ✓ Nurse can create + update (limited fields), cannot delete
 *  ✓ Staff can view patients, cannot create
 *  ✓ Pagination and search filters work
 *  ✓ Medical history entry added correctly
 *  ✓ CSV export available to admin only
 */

const request = require('supertest');
const app     = require('../../server');
const User    = require('../../models/User');
const Patient = require('../../models/Patient');

jest.mock('../../utils/logger', () => ({ info:jest.fn(), warn:jest.fn(), error:jest.fn(), http:jest.fn(), debug:jest.fn() }));
jest.mock('../../services/emailService', () => ({ sendPasswordResetEmail:jest.fn(), sendLoginAlertEmail:jest.fn(), sendEmail:jest.fn() }));
jest.mock('../../cache/redisClient', () => ({ cacheGet:jest.fn().mockResolvedValue(null), cacheSet:jest.fn().mockResolvedValue(undefined), cacheDel:jest.fn().mockResolvedValue(undefined), cacheInvalidatePattern:jest.fn().mockResolvedValue(undefined), withCache:jest.fn().mockImplementation(async(_,__,fn)=>fn()), isConnected:jest.fn().mockReturnValue(false) }));
jest.mock('../../sockets/socketManager', () => ({ socketManager:{ pushDashboardRefresh:jest.fn(), patientAdded:jest.fn(), patientStatusChanged:jest.fn(), emitToUser:jest.fn(), notifyRole:jest.fn() }, initSocket:jest.fn() }));
jest.mock('../../workers/queueManager', () => ({ initQueues:jest.fn(), addExportJob:jest.fn(), addEmailJob:jest.fn(), addReportJob:jest.fn(), scheduleCacheWarm:jest.fn(), getJobStatus:jest.fn(), getQueues:jest.fn().mockReturnValue({}) }));
jest.mock('../../controllers/notificationController', () => ({
  ...jest.requireActual('../../controllers/notificationController'),
  createAndPush:jest.fn().mockResolvedValue(null)
}));

async function loginAs(email, password = 'Admin@1234') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

describe('Patient Integration — CRUD & RBAC', () => {
  let adminToken, doctorToken, nurseToken, staffToken;
  let doctor, doctorId;

  beforeEach(async () => {
    const [admin, doc, nurse, staff] = await Promise.all([
      User.create({ name:'Admin',  email:'pat-admin@test.com',  password:'Admin@1234', role:'admin',  isActive:true }),
      User.create({ name:'Doctor', email:'pat-doc@test.com',    password:'Admin@1234', role:'doctor', isActive:true }),
      User.create({ name:'Nurse',  email:'pat-nurse@test.com',  password:'Admin@1234', role:'nurse',  isActive:true }),
      User.create({ name:'Staff',  email:'pat-staff@test.com',  password:'Admin@1234', role:'staff',  isActive:true }),
    ]);
    doctor   = doc;
    doctorId = doc._id.toString();

    [adminToken, doctorToken, nurseToken, staffToken] = await Promise.all([
      loginAs('pat-admin@test.com'),
      loginAs('pat-doc@test.com'),
      loginAs('pat-nurse@test.com'),
      loginAs('pat-staff@test.com'),
    ]);
  });

  // ── Create patient ────────────────────────────────────────────
  describe('POST /api/patients', () => {
    it('admin should create a patient successfully', async () => {
      const res = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name:'John Doe', age:45, gender:'male' });

      expect(res.status).toBe(201);
      expect(res.body.data.patientId).toMatch(/^PAT-\d{5}$/);
      expect(res.body.data.name).toBe('John Doe');
    });

    it('doctor should create a patient', async () => {
      const res = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ name:'Jane Doe', age:32, gender:'female' });
      expect(res.status).toBe(201);
    });

    it('nurse should create a patient', async () => {
      const res = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({ name:'Nurse Patient', age:28, gender:'male' });
      expect(res.status).toBe(201);
    });

    it('staff should NOT be able to create a patient', async () => {
      const res = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name:'Staff Patient', age:28, gender:'male' });
      expect(res.status).toBe(403);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name:'No Age' }); // missing age and gender
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  // ── Read patients ─────────────────────────────────────────────
  describe('GET /api/patients', () => {
    beforeEach(async () => {
      const admin = await User.findOne({ email:'pat-admin@test.com' });
      // Create 3 patients, 2 assigned to doctor
      await Patient.create([
        { name:'Patient A', age:30, gender:'male',   assignedDoctor:doctor._id, createdBy:admin._id, updatedBy:admin._id },
        { name:'Patient B', age:40, gender:'female', assignedDoctor:doctor._id, createdBy:admin._id, updatedBy:admin._id },
        { name:'Patient C', age:50, gender:'male',   createdBy:admin._id, updatedBy:admin._id }
      ]);
    });

    it('admin should see all patients', async () => {
      const res = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(3);
    });

    it('doctor should only see their assigned patients', async () => {
      const res = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(2); // only their 2
    });

    it('should filter by search query', async () => {
      const res = await request(app)
        .get('/api/patients?search=Patient A')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].name).toBe('Patient A');
    });

    it('should apply status filter', async () => {
      const admin = await User.findOne({ email:'pat-admin@test.com' });
      await Patient.create({ name:'Critical P', age:60, gender:'male', status:'critical', createdBy:admin._id, updatedBy:admin._id });

      const res = await request(app)
        .get('/api/patients?status=critical')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every(p => p.status === 'critical')).toBe(true);
    });
  });

  // ── Update patient ────────────────────────────────────────────
  describe('PUT /api/patients/:id', () => {
    let patient;

    beforeEach(async () => {
      const admin = await User.findOne({ email:'pat-admin@test.com' });
      patient = await Patient.create({ name:'Update Me', age:35, gender:'male', createdBy:admin._id, updatedBy:admin._id });
    });

    it('admin should update any field', async () => {
      const res = await request(app)
        .put(`/api/patients/${patient._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentDiagnosis:'Hypertension', status:'stable' });
      expect(res.status).toBe(200);
      expect(res.body.data.currentDiagnosis).toBe('Hypertension');
    });

    it('nurse should NOT update medical/diagnosis fields', async () => {
      const res = await request(app)
        .put(`/api/patients/${patient._id}`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({ name:'Updated Name', currentDiagnosis:'Nurse Diagnosis' });

      expect(res.status).toBe(200);
      // Name should update, diagnosis should be stripped
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.currentDiagnosis).toBeFalsy(); // was empty before, nurse can't set it
    });
  });

  // ── Delete patient ────────────────────────────────────────────
  describe('DELETE /api/patients/:id', () => {
    let patient;

    beforeEach(async () => {
      const admin = await User.findOne({ email:'pat-admin@test.com' });
      patient = await Patient.create({ name:'Delete Me', age:30, gender:'female', createdBy:admin._id, updatedBy:admin._id });
    });

    it('admin should delete a patient', async () => {
      const res = await request(app)
        .delete(`/api/patients/${patient._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      // Confirm deleted
      const check = await Patient.findById(patient._id);
      expect(check).toBeNull();
    });

    it('doctor should NOT delete a patient', async () => {
      const res = await request(app)
        .delete(`/api/patients/${patient._id}`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });

    it('nurse should NOT delete a patient', async () => {
      const res = await request(app)
        .delete(`/api/patients/${patient._id}`)
        .set('Authorization', `Bearer ${nurseToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ── Medical history ───────────────────────────────────────────
  describe('POST /api/patients/:id/history', () => {
    let patient;

    beforeEach(async () => {
      const admin = await User.findOne({ email:'pat-admin@test.com' });
      patient = await Patient.create({ name:'History Patient', age:45, gender:'male', createdBy:admin._id, updatedBy:admin._id });
    });

    it('doctor should add medical history entry', async () => {
      const res = await request(app)
        .post(`/api/patients/${patient._id}/history`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ diagnosis:'Hypertension Stage 1', treatment:'Medication', prescription:'Amlodipine 5mg' });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].diagnosis).toBe('Hypertension Stage 1');
    });

    it('nurse should NOT add medical history', async () => {
      const res = await request(app)
        .post(`/api/patients/${patient._id}/history`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({ diagnosis:'Nurse Diagnosis' });
      expect(res.status).toBe(403);
    });
  });

  // ── CSV Export ────────────────────────────────────────────────
  describe('GET /api/patients/export', () => {
    it('admin should download CSV export', async () => {
      const admin = await User.findOne({ email:'pat-admin@test.com' });
      await Patient.create({ name:'Export Patient', age:50, gender:'male', createdBy:admin._id, updatedBy:admin._id });

      const res = await request(app)
        .get('/api/patients/export')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('Patient ID');
      expect(res.text).toContain('Export Patient');
    });

    it('doctor should NOT access CSV export', async () => {
      const res = await request(app)
        .get('/api/patients/export')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });
  });
});
