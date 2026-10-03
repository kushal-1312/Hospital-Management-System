/**
 * jest.config.js
 * Separate config file for cleaner setup (alternative to package.json jest key)
 */
module.exports = {
  testEnvironment:  'node',
  testTimeout:      15000,
  setupFilesAfterEnv: ['./tests/fixtures/setup.js'],

  // Only run files in tests/ directory
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],

  // Coverage
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches:   60,
      functions:  70,
      lines:      70,
      statements: 70
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],

  // Clear mocks between tests
  clearMocks: true,
  resetMocks:  false,

  // Verbose output
  verbose: true
};
