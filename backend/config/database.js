const { testConnection } = require('./supabase');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const success = await testConnection();
    if (!success) {
      logger.warn('Database connection started in offline/standby mode. Provide valid Supabase credentials in .env to connect.');
    }
    return success;
  } catch (error) {
    logger.error(`Database connection check error: ${error.message}`);
    return false;
  }
};

module.exports = connectDB;
