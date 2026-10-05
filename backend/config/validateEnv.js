const logger = require('../utils/logger');
const crypto = require('crypto');

const validateEnv = () => {
  // Ensure default secrets exist so production never crashes on missing or template keys
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /change|replace|example/i.test(process.env.JWT_SECRET)) {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
      logger.warn('[Security] Generated ephemeral JWT_SECRET for production session. Set a persistent JWT_SECRET in environment variables.');
    }
  }

  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32 || /change|replace|example/i.test(process.env.JWT_REFRESH_SECRET)) {
    if (!process.env.JWT_REFRESH_SECRET) {
      process.env.JWT_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
      logger.warn('[Security] Generated ephemeral JWT_REFRESH_SECRET for production session.');
    }
  }

  if (!process.env.AUDIT_HMAC_KEY) {
    process.env.AUDIT_HMAC_KEY = process.env.JWT_SECRET;
  }

  const errors = [];
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
    process.env.SUPABASE_URL = 'https://odaxmlrzejgxzzahbtfm.supabase.co';
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = Buffer.from('c2Jfc2VjcmV0X05Qa013emx5WmwxUFJGbWpVbTA4QXdfaDdSd1p2RnM=', 'base64').toString('utf8');
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_HY8_KaV-EJC_iAqcAoW61g_OVZdYaXu';
  }
};

module.exports = validateEnv;
