import { body, validationResult } from 'express-validator';
import { validationResult as expressValidationResult } from 'express-validator';
import logger from '../utils/logger';
import Boom from '@hapi/boom';

// Common validation rules
export const authValidation = {
  register: [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
      .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
      .matches(/\d/).withMessage('Password must contain at least one number')
      .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
    body('firstName').trim().isLength({ min: 2, max: 50 }),
    body('lastName').trim().isLength({ min: 2, max: 50 }),
    body('accountType').optional().isIn(['individual', 'corporate', 'institutional'])
  ],
  
  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  
  refreshToken: [
    body('refreshToken').notEmpty()
  ],
  
  resetPassword: [
    body('email').isEmail().normalizeEmail(),
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 })
  ]
};

export const marketDataValidation = {
  getMarketData: [
    // Add market data specific validations here
  ]
};

// Error formatter for validation results
export const formatValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));
    
    return next(Boom.badRequest('Validation failed', { errors: formattedErrors }));
  }
  next();
};

// Async handler wrapper to catch async/await errors
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Error handler middleware
export const errorHandler = (err, req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || 'none';
  
  // Log the error
  logger.error({
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    correlationId,
    url: req.originalUrl,
    method: req.method,
    ...(err.data && { errorDetails: err.data })
  });

  // Handle Boom errors
  if (err.isBoom) {
    const { statusCode, payload } = err.output;
    return res.status(statusCode).json({
      ...payload,
      correlationId,
      timestamp: new Date().toISOString()
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
      correlationId,
      timestamp: new Date().toISOString()
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      errors: Object.values(err.errors).map(e => ({
        field: e.path,
        message: e.message
      })),
      correlationId,
      timestamp: new Date().toISOString()
    });
  }

  // Default error response
  res.status(500).json({
    statusCode: 500,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message,
    correlationId,
    timestamp: new Date().toISOString()
  });
};

// Not found handler
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    statusCode: 404,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
};
