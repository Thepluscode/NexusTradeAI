/**
 * Error Codes for NexusTradeAI
 * Standardized error codes for the trading platform
 */

const ERROR_CODES = {
  // Authentication Errors (1000-1999)
  AUTH_INVALID_CREDENTIALS: {
    code: 1001,
    message: 'Invalid credentials provided',
    httpStatus: 401
  },
  AUTH_TOKEN_EXPIRED: {
    code: 1002,
    message: 'Authentication token has expired',
    httpStatus: 401
  },
  AUTH_TOKEN_INVALID: {
    code: 1003,
    message: 'Invalid authentication token',
    httpStatus: 401
  },
  AUTH_INSUFFICIENT_PERMISSIONS: {
    code: 1004,
    message: 'Insufficient permissions for this operation',
    httpStatus: 403
  },
  AUTH_ACCOUNT_LOCKED: {
    code: 1005,
    message: 'Account is locked due to security reasons',
    httpStatus: 423
  },
  AUTH_2FA_REQUIRED: {
    code: 1006,
    message: 'Two-factor authentication is required',
    httpStatus: 401
  },
  AUTH_2FA_INVALID: {
    code: 1007,
    message: 'Invalid two-factor authentication code',
    httpStatus: 401
  },

  // Trading Errors (2000-2999)
  TRADING_INSUFFICIENT_FUNDS: {
    code: 2001,
    message: 'Insufficient funds for this trade',
    httpStatus: 400
  },
  TRADING_INVALID_SYMBOL: {
    code: 2002,
    message: 'Invalid trading symbol',
    httpStatus: 400
  },
  TRADING_MARKET_CLOSED: {
    code: 2003,
    message: 'Market is currently closed',
    httpStatus: 400
  },
  TRADING_ORDER_REJECTED: {
    code: 2004,
    message: 'Order was rejected by the exchange',
    httpStatus: 400
  },
  TRADING_POSITION_NOT_FOUND: {
    code: 2005,
    message: 'Position not found',
    httpStatus: 404
  },
  TRADING_INVALID_ORDER_TYPE: {
    code: 2006,
    message: 'Invalid order type',
    httpStatus: 400
  },
  TRADING_RISK_LIMIT_EXCEEDED: {
    code: 2007,
    message: 'Risk limit exceeded for this trade',
    httpStatus: 400
  },
  TRADING_PDT_VIOLATION: {
    code: 2008,
    message: 'Pattern day trader rule violation',
    httpStatus: 400
  },

  // Account Errors (3000-3999)
  ACCOUNT_NOT_FOUND: {
    code: 3001,
    message: 'Account not found',
    httpStatus: 404
  },
  ACCOUNT_SUSPENDED: {
    code: 3002,
    message: 'Account is suspended',
    httpStatus: 403
  },
  ACCOUNT_VERIFICATION_REQUIRED: {
    code: 3003,
    message: 'Account verification is required',
    httpStatus: 403
  },
  ACCOUNT_INSUFFICIENT_PERMISSIONS: {
    code: 3004,
    message: 'Account does not have required permissions',
    httpStatus: 403
  },

  // Market Data Errors (4000-4999)
  MARKET_DATA_UNAVAILABLE: {
    code: 4001,
    message: 'Market data is currently unavailable',
    httpStatus: 503
  },
  MARKET_DATA_DELAYED: {
    code: 4002,
    message: 'Market data is delayed',
    httpStatus: 200
  },
  MARKET_DATA_SUBSCRIPTION_REQUIRED: {
    code: 4003,
    message: 'Market data subscription is required',
    httpStatus: 402
  },

  // System Errors (5000-5999)
  SYSTEM_MAINTENANCE: {
    code: 5001,
    message: 'System is under maintenance',
    httpStatus: 503
  },
  SYSTEM_OVERLOADED: {
    code: 5002,
    message: 'System is currently overloaded',
    httpStatus: 503
  },
  SYSTEM_DATABASE_ERROR: {
    code: 5003,
    message: 'Database error occurred',
    httpStatus: 500
  },
  SYSTEM_EXTERNAL_SERVICE_ERROR: {
    code: 5004,
    message: 'External service error',
    httpStatus: 502
  },

  // Validation Errors (6000-6999)
  VALIDATION_REQUIRED_FIELD: {
    code: 6001,
    message: 'Required field is missing',
    httpStatus: 400
  },
  VALIDATION_INVALID_FORMAT: {
    code: 6002,
    message: 'Invalid data format',
    httpStatus: 400
  },
  VALIDATION_OUT_OF_RANGE: {
    code: 6003,
    message: 'Value is out of acceptable range',
    httpStatus: 400
  },
  VALIDATION_DUPLICATE_VALUE: {
    code: 6004,
    message: 'Duplicate value not allowed',
    httpStatus: 409
  },

  // Rate Limiting Errors (7000-7999)
  RATE_LIMIT_EXCEEDED: {
    code: 7001,
    message: 'Rate limit exceeded',
    httpStatus: 429
  },
  RATE_LIMIT_API_QUOTA: {
    code: 7002,
    message: 'API quota exceeded',
    httpStatus: 429
  },

  // Payment Errors (8000-8999)
  PAYMENT_FAILED: {
    code: 8001,
    message: 'Payment processing failed',
    httpStatus: 402
  },
  PAYMENT_CARD_DECLINED: {
    code: 8002,
    message: 'Payment card was declined',
    httpStatus: 402
  },
  PAYMENT_SUBSCRIPTION_EXPIRED: {
    code: 8003,
    message: 'Subscription has expired',
    httpStatus: 402
  },

  // Generic Errors (9000-9999)
  GENERIC_BAD_REQUEST: {
    code: 9001,
    message: 'Bad request',
    httpStatus: 400
  },
  GENERIC_UNAUTHORIZED: {
    code: 9002,
    message: 'Unauthorized access',
    httpStatus: 401
  },
  GENERIC_FORBIDDEN: {
    code: 9003,
    message: 'Access forbidden',
    httpStatus: 403
  },
  GENERIC_NOT_FOUND: {
    code: 9004,
    message: 'Resource not found',
    httpStatus: 404
  },
  GENERIC_INTERNAL_ERROR: {
    code: 9005,
    message: 'Internal server error',
    httpStatus: 500
  },
  GENERIC_SERVICE_UNAVAILABLE: {
    code: 9006,
    message: 'Service temporarily unavailable',
    httpStatus: 503
  }
};

/**
 * Get error by code
 */
function getErrorByCode(code) {
  const errorKey = Object.keys(ERROR_CODES).find(key => ERROR_CODES[key].code === code);
  return errorKey ? ERROR_CODES[errorKey] : null;
}

/**
 * Create standardized error response
 */
function createErrorResponse(errorCode, details = null, requestId = null) {
  const error = typeof errorCode === 'string' ? ERROR_CODES[errorCode] : errorCode;

  if (!error) {
    throw new Error('Invalid error code provided');
  }

  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: details,
      timestamp: new Date().toISOString(),
      requestId: requestId
    }
  };
}

module.exports = {
  ERROR_CODES,
  getErrorByCode,
  createErrorResponse
};