/**
 * Centralized Cookie Configuration
 * Supports iframe embedding across cross-site contexts using CHIPS (Partitioned Cookies).
 */

const cookieConfig = {
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
      partitioned: true,
    },
  },
};

const getCookieOptions = (overrides = {}) => ({
  ...cookieConfig.advanced.defaultCookieAttributes,
  ...overrides,
});

module.exports = {
  cookieConfig,
  getCookieOptions,
};
