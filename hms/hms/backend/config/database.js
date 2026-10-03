const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 50,
      minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE) || 5,
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
      maxIdleTimeMS: 60_000,
      retryWrites: true,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('error', (err) => logger.error(`MongoDB error: ${err.message}`));
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
