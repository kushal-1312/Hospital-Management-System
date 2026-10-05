const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const logger = require('../utils/logger');

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder-key';

const isConfigured = Boolean(
  process.env.SUPABASE_URL &&
  !process.env.SUPABASE_URL.includes('placeholder') &&
  !process.env.SUPABASE_URL.includes('your-project') &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('your-supabase')
);

// High-concurrency connection pool agent:
// Keeps 500-1000 TCP sockets warm and alive to prevent socket thrashing and TLS handshake overhead
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 1000,
  maxFreeSockets: 256,
  timeout: 30000,
});

const customFetch = (url, options = {}) => {
  return fetch(url, {
    ...options,
    // Enable keep-alive on HTTP requests
    keepalive: true,
    headers: {
      ...options.headers,
      Connection: 'keep-alive',
    },
  });
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: customFetch,
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
    } else {
      logger.info('✅ Supabase high-concurrency client connected successfully');
    }
    isConnected = true;
    return true;
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
