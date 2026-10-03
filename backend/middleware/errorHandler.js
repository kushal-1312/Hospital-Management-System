const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message };

  logger.error(`${err.name || 'Error'}: ${err.message}`, {
    url: req.originalUrl, method: req.method, ip: req.ip, user: req.user?.email
  });

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    error = new AppError(`${field} already exists.`, 409);
  }
  if (err.name === 'ValidationError') {
    const msg = Object.values(err.errors).map(e => e.message).join('. ');
    error = new AppError(`Validation failed: ${msg}`, 400);
  }
  if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }
  if (err.message === 'Origin is not allowed by CORS') {
    error = new AppError('Origin is not allowed.', 403);
  }

  const statusCode = error.statusCode || 500;
  const message = error.isOperational ? error.message : 'Internal server error.';

  res.status(statusCode).json({
    success: false,
    message,
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.`, requestId: req.id });
};

module.exports = { AppError, errorHandler, notFound };
