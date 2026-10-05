const validateEnv = () => {
  if (process.env.NODE_ENV !== 'production') return;
  const errors = [];
  const secrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'AUDIT_HMAC_KEY'];
  for (const name of secrets) {
    const value = process.env[name] || '';
    if (value.length < 32 || /change|replace|example/i.test(value)) {
      errors.push(`${name} must be an independent random value of at least 32 characters`);
    }
  }
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder')) {
    errors.push('SUPABASE_URL is required');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) is required');
  }
  if (!process.env.CLIENT_URL && !process.env.VERCEL) errors.push('CLIENT_URL is required');
  if (errors.length) throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
};

module.exports = validateEnv;
