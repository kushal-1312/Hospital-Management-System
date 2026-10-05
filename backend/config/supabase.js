const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const isConfigured = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('placeholder') &&
  supabaseKey
);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
});

let isConnected = false;

const testConnection = async () => {
  if (!isConfigured) {
    logger.warn('⚠️ Supabase credentials not set or using placeholder in .env. Please update SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return false;
  }
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      logger.warn(`Supabase connection note: ${error.message} (Code: ${error.code})`);
      isConnected = false;
      return false;
    } else {
      logger.info('✅ Supabase connected successfully');
      isConnected = true;
      return true;
    }
  } catch (err) {
    logger.error(`Supabase connection failed: ${err.message}`);
    isConnected = false;
    return false;
  }
};

module.exports = {
  supabase,
  testConnection,
  isReady: () => isConnected,
  isConfigured: () => isConfigured,
};
