/**
 * Integration tests: Authentication Flow
 *
 * Tests the full HTTP request cycle using Supertest.
 * Uses the in-memory MongoDB from setup.js.
 *
 * Coverage:
 *  ✓ POST /api/auth/login — success
 *  ✓ POST /api/auth/login — wrong password
 *  ✓ POST /api/auth/login — account lockout after N failures
 *  ✓ POST /api/auth/refresh — valid refresh token
 *  ✓ POST /api/auth/refresh — invalid token
 *  ✓ GET  /api/auth/me — returns current user
 *  ✓ POST /api/auth/logout — invalidates refresh token
 *  ✓ POST /api/auth/forgot-password — always returns 200
 *  ✓ POST /api/auth/change-password — success
 *  ✓ POST /api/auth/change-password — wrong current password
 *  ✓ POST /api/auth/register — admin can create users
 *  ✓ POST /api/auth/register — non-admin blocked
 */

const request = require('supertest');
const app     = require('../../server');
const User    = require('../../models/User');

// Silence logger noise during tests
jest.mock('../../utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  http:  jest.fn(),
  debug: jest.fn()
}));

// Mock email service — don't actually send emails in tests
jest.mock('../../services/emailService', () => ({
  sendPasswordResetEmail:  jest.fn().mockResolvedValue(true),
  sendTwoFactorSetupEmail: jest.fn().mockResolvedValue(true),
  sendLoginAlertEmail:     jest.fn().mockResolvedValue(true),
  sendEmail:               jest.fn().mockResolvedValue(true)
}));

// Mock Redis — unavailable in CI (graceful fallback)
jest.mock('../../cache/redisClient', () => ({
  cacheGet:              jest.fn().mockResolvedValue(null),
  cacheSet:              jest.fn().mockResolvedValue(null),
  cacheDel:              jest.fn().mockResolvedValue(null),
  cacheInvalidatePattern: jest.fn().mockResolvedValue(null),
  withCache:             jest.fn().mockImplementation(async (_, __, fn) => fn()),
  isConnected:           jest.fn().mockReturnValue(false)
}));

// Mock Socket.io
jest.mock('../../sockets/socketManager', () => ({
  socketManager: {
    pushDashboardRefresh:    jest.fn(),
    patientAdded:            jest.fn(),
    patientStatusChanged:    jest.fn(),
    appointmentScheduled:    jest.fn(),
    appointmentStatusChanged: jest.fn(),
    notifyRole:              jest.fn(),
    emitToUser:              jest.fn()
  },
  initSocket: jest.fn()
}));

// Mock Bull queues
jest.mock('../../workers/queueManager', () => ({
  initQueues:      jest.fn(),
  addExportJob:    jest.fn().mockResolvedValue(null),
  addEmailJob:     jest.fn().mockResolvedValue(null),
  addReportJob:    jest.fn().mockResolvedValue(null),
  scheduleCacheWarm: jest.fn(),
  getJobStatus:    jest.fn().mockResolvedValue(null),
  getQueues:       jest.fn().mockReturnValue({})
}));

describe('Auth Integration — POST /api/auth/login', () => {
  let adminUser;

  beforeEach(async () => {
    adminUser = await User.create({
      name: 'Admin User', email: 'admin@test.com',
      password: 'Admin@1234', role: 'admin', isActive: true
    });
  });

  // ── Successful login ──────────────────────────────────────────
  it('should return tokens and user on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin@1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe('admin@test.com');
    // Should NEVER expose password
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.refreshTokenHash).toBeUndefined();
  });

  // ── Wrong password ────────────────────────────────────────────
  it('should return 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // Generic message — no indication of which field is wrong
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  // ── User enumeration prevention ───────────────────────────────
  it('should return the same message for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doesnotexist@test.com', password: 'AnyPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  // ── Account lockout ───────────────────────────────────────────
  it('should lock account after MAX_LOGIN_ATTEMPTS failures', async () => {
    const max = Number(process.env.MAX_LOGIN_ATTEMPTS) || 5;

    // Exhaust all attempts
    for (let i = 0; i < max; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'Wrong!' });
    }

    // Next attempt should get 423 Locked
    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin@1234' }); // correct password

    expect(locked.status).toBe(423);
    expect(locked.body.message).toMatch(/locked/i);
  });

  // ── Inactive account ──────────────────────────────────────────
  it('should reject login for deactivated account', async () => {
    await User.findByIdAndUpdate(adminUser._id, { isActive: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin@1234' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  // ── Validation ────────────────────────────────────────────────
  it('should return 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Admin@1234' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });
});

describe('Auth Integration — Token refresh', () => {
  let tokens;

  beforeEach(async () => {
    await User.create({ name: 'Refresh User', email: 'refresh@test.com', password: 'Admin@1234', role: 'staff', isActive: true });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'refresh@test.com', password: 'Admin@1234' });
    tokens = { access: res.body.accessToken, refresh: res.body.refreshToken };
  });

  it('should issue new access token with valid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: tokens.refresh });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('should return 401 for invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'totally_invalid_token_abc' });

    expect(res.status).toBe(401);
  });
});

describe('Auth Integration — Protected routes', () => {
  let admin, adminTokens;

  beforeEach(async () => {
    admin = await User.create({ name: 'Admin', email: 'prot-admin@test.com', password: 'Admin@1234', role: 'admin', isActive: true });
    const res = await request(app).post('/api/auth/login').send({ email: 'prot-admin@test.com', password: 'Admin@1234' });
    adminTokens = res.body;
  });

  it('GET /api/auth/me should return current user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('prot-admin@test.com');
    expect(res.body.user.password).toBeUndefined();
  });

  it('GET /api/auth/me should return 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout should invalidate refresh token', async () => {
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(logout.status).toBe(200);

    // Refresh should now fail
    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: adminTokens.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('POST /api/auth/register requires admin role', async () => {
    // Create a non-admin user and get their token
    const staff = await User.create({ name: 'Staff', email: 'staff@test.com', password: 'Admin@1234', role: 'staff', isActive: true });
    const staffRes = await request(app).post('/api/auth/login').send({ email: 'staff@test.com', password: 'Admin@1234' });

    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${staffRes.body.accessToken}`)
      .send({ name: 'New User', email: 'new@test.com', password: 'Admin@1234', role: 'staff' });

    expect(res.status).toBe(403);
  });

  it('POST /api/auth/register should work for admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ name: 'New Doctor', email: 'doc@test.com', password: 'Admin@1234', role: 'doctor' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('doctor');
    expect(res.body.user.password).toBeUndefined();
  });
});

describe('Auth Integration — Forgot password', () => {
  it('should always return 200 regardless of email existence', async () => {
    const res1 = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.com' });
    const res2 = await request(app).post('/api/auth/forgot-password').send({ email: 'also@nobody.com' });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both return same message — prevents enumeration
    expect(res1.body.message).toBe(res2.body.message);
  });
});

describe('Auth Integration — Change password', () => {
  let user, token;

  beforeEach(async () => {
    user = await User.create({ name: 'CP User', email: 'cp@test.com', password: 'OldPass@123', role: 'nurse', isActive: true });
    const res = await request(app).post('/api/auth/login').send({ email: 'cp@test.com', password: 'OldPass@123' });
    token = res.body.accessToken;
  });

  it('should change password with correct current password', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OldPass@123', newPassword: 'NewPass@456' });

    expect(res.status).toBe(200);

    // Verify old password no longer works
    const login = await request(app).post('/api/auth/login').send({ email: 'cp@test.com', password: 'OldPass@123' });
    expect(login.status).toBe(401);
  });

  it('should return 400 for wrong current password', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongOld!', newPassword: 'NewPass@456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/incorrect/i);
  });
});
