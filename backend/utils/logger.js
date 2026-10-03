const winston = require('winston');
const path = require('path');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) =>
    `${timestamp} [${level.toUpperCase()}]: ${stack || message}`)
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat)
    }),
    // Vercel's filesystem is read-only; its log drain captures console output
    ...(process.env.VERCEL ? [] : [new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error', maxsize: 5242880, maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 5242880, maxFiles: 5
    })])
  ]
});

module.exports = logger;
