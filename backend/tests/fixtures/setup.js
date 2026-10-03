/**
 * UPGRADE 9: Global Test Setup
 *
 * Uses mongodb-memory-server to spin up a real MongoDB instance
 * in memory for each test run. This means:
 *   - No external MongoDB needed for CI
 *   - Tests are fully isolated (each suite gets a clean DB)
 *   - Fast — no network I/O to a real server
 *
 * Jest config in package.json points setupFilesAfterFramework here.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

// Set test environment variables before anything imports dotenv
process.env.NODE_ENV        = 'test';
process.env.JWT_SECRET      = 'test_jwt_secret_min_32_characters_xyz';
process.env.JWT_EXPIRE      = '15m';
process.env.JWT_REFRESH_SECRET  = 'test_refresh_secret_min_32_chars_xyz';
process.env.JWT_REFRESH_EXPIRE  = '7d';
process.env.MAX_LOGIN_ATTEMPTS  = '5';
process.env.LOCKOUT_DURATION    = '15';
process.env.RESET_TOKEN_EXPIRE  = '10';
process.env.TOTP_APP_NAME       = 'MedCare-Test';
process.env.CLIENT_URL          = 'http://localhost:3000';
process.env.REDIS_HOST          = '127.0.0.1';  // Redis gracefully unavailable in tests

let mongoServer;

// ── Before all tests: start in-memory MongoDB ──────────────────
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri   = mongoServer.getUri();
  await mongoose.connect(uri, { dbName: 'hms_test' });
});

// ── After each test: wipe all collections ─────────────────────
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ── After all tests: stop MongoDB ─────────────────────────────
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});

// ── Global helpers ─────────────────────────────────────────────

/**
 * Generate a JWT for a given user object (for auth headers in tests)
 */
global.generateTestToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

/**
 * Create an auth header object ready for supertest
 */
global.authHeader = (user) => ({
  Authorization: `Bearer ${global.generateTestToken(user)}`
});

/**
 * Build a sample patient payload
 */
global.samplePatient = (overrides = {}) => ({
  name:   'Test Patient',
  age:    35,
  gender: 'male',
  ...overrides
});

/**
 * Build a sample user payload
 */
global.sampleUser = (role = 'staff', overrides = {}) => ({
  name:     `Test ${role}`,
  email:    `${role}@test.com`,
  password: 'TestPass@123',
  role,
  ...overrides
});
