import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import Boom from '@hapi/boom';
import logger from '../utils/logger';
import config from '../config';

const redis = new Redis(config.redis.url);

/**
 * Middleware to verify JWT token and attach user to request
 */
export const authenticate = () => async (req, res, next) => {
  try {
    // Get token from header or query param
    let token = req.headers.authorization || req.query.token;
    
    if (!token) {
      return next(Boom.unauthorized('No token provided'));
    }

    // Remove 'Bearer ' if present
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`token:blacklist:${token}`);
    if (isBlacklisted) {
      return next(Boom.unauthorized('Token has been revoked'));
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Check if user session is still valid
    const sessionKey = `user:session:${decoded.id}`;
    const session = await redis.get(sessionKey);
    
    if (!session) {
      return next(Boom.unauthorized('Session expired or invalid'));
    }

    // Attach user to request
    req.user = decoded;
    req.token = token;
    
    // Log successful authentication
    logger.info(`User authenticated: ${decoded.id}`, {
      userId: decoded.id,
      role: decoded.role,
      ip: req.ip,
      method: req.method,
      path: req.path
    });
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(Boom.unauthorized('Token expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(Boom.unauthorized('Invalid token'));
    }
    logger.error('Authentication error:', error);
    next(Boom.unauthorized('Authentication failed'));
  }
};

/**
 * Middleware to check if user has required roles
 * @param {...string} roles - List of allowed roles
 */
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(Boom.unauthorized('Authentication required'));
  }
  
  if (!roles.includes(req.user.role)) {
    logger.warn(`Unauthorized access attempt by user ${req.user.id} (${req.user.role}) to ${req.method} ${req.path}`, {
      userId: req.user.id,
      userRole: req.user.role,
      requiredRoles: roles,
      ip: req.ip,
      method: req.method,
      path: req.path
    });
    return next(Boom.forbidden('Insufficient permissions'));
  }
  
  next();
};

/**
 * Middleware to check if user has required permissions
 * @param {...string} permissions - List of required permissions
 */
export const hasPermission = (...permissions) => (req, res, next) => {
  if (!req.user) {
    return next(Boom.unauthorized('Authentication required'));
  }
  
  const userPermissions = req.user.permissions || [];
  const hasAllPermissions = permissions.every(permission => 
    userPermissions.includes(permission)
  );
  
  if (!hasAllPermissions) {
    logger.warn(`Permission denied for user ${req.user.id} (${req.user.role}) to ${req.method} ${req.path}`, {
      userId: req.user.id,
      userRole: req.user.role,
      userPermissions,
      requiredPermissions: permissions,
      ip: req.ip,
      method: req.method,
      path: req.path
    });
    return next(Boom.forbidden('Insufficient permissions'));
  }
  
  next();
};

/**
 * Middleware to verify API key
 */
export const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return next(Boom.unauthorized('API key required'));
  }
  
  // In a real app, you would validate the API key against a database
  // This is a simplified example
  if (apiKey !== process.env.API_KEY) {
    logger.warn('Invalid API key provided', {
      providedKey: apiKey,
      ip: req.ip,
      method: req.method,
      path: req.path
    });
    return next(Boom.unauthorized('Invalid API key'));
  }
  
  next();
};

/**
 * Rate limiting middleware
 */
export const rateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    keyGenerator = (req) => req.ip, // default key generator uses IP
    skip = () => false, // function to skip rate limiting
    handler = (req, res) => {
      res.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many requests, please try again later.',
        timestamp: new Date().toISOString()
      });
    }
  } = options;
  
  const store = new Map();
  
  return async (req, res, next) => {
    if (skip(req)) return next();
    
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean up old entries
    for (const [ip, entry] of store.entries()) {
      if (entry.timestamp < windowStart) {
        store.delete(ip);
      }
    }
    
    // Get or create entry for this key
    let entry = store.get(key) || { count: 0, timestamp: now };
    
    // Check if window has passed
    if (now - entry.timestamp > windowMs) {
      entry = { count: 0, timestamp: now };
    }
    
    // Check rate limit
    if (entry.count >= max) {
      logger.warn('Rate limit exceeded', {
        key,
        count: entry.count,
        max,
        windowMs,
        ip: req.ip,
        method: req.method,
        path: req.path
      });
      return handler(req, res);
    }
    
    // Increment counter
    entry.count++;
    store.set(key, entry);
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': max - entry.count,
      'X-RateLimit-Reset': Math.ceil((entry.timestamp + windowMs) / 1000)
    });
    
    next();
  };
};
