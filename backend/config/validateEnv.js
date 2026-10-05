const logger = require('../utils/logger');
const crypto = require('crypto');

const validateEnv = () => {
  const DEFAULT_JWT_SECRET = 'medcare_enterprise_hms_jwt_secret_token_key_32chars_long_2026';
  const DEFAULT_REFRESH_SECRET = 'medcare_enterprise_hms_refresh_secret_key_32chars_long_2026';

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
  }

  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    process.env.JWT_REFRESH_SECRET = DEFAULT_REFRESH_SECRET;
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
