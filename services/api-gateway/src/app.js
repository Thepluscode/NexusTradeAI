const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');
const http = require('http');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const winston = require('winston');
require('dotenv').config();
promClient = require('prom-client');

// Start server
const app = express();
const PORT = process.env.PORT || 8000;
const wss = new WebSocket.Server({ server });
const server = app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Available services:', Object.keys(SERVICES));
});

// Redis client for caching and session management
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://nexustrade.com', 'https://app.nexustrade.com']
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});
app.use('/api/', limiter);

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Check if token is blacklisted
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      auth: 'healthy',
      marketData: 'healthy',
      trading: 'healthy'
    }
  });
});

// Service URLs
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  marketData: process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3002',
  trading: process.env.TRADING_ENGINE_URL || 'http://localhost:3003',
  risk: process.env.RISK_SERVICE_URL || 'http://localhost:3004'
};

// Proxy configurations
const createProxy = (target, pathRewrite = {}) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    onError: (err, req, res) => {
      console.error(`Proxy error for ${target}:`, err.message);
      res.status(502).json({ 
        error: 'Service temporarily unavailable',
        service: target 
      });
    },
    onProxyReq: (proxyReq, req, res) => {
      // Add correlation ID for request tracing
      const correlationId = req.headers['x-correlation-id'] || 
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      proxyReq.setHeader('x-correlation-id', correlationId);
      
      // Forward user information
      if (req.user) {
        proxyReq.setHeader('x-user-id', req.user.id);
        proxyReq.setHeader('x-user-role', req.user.role);
      }
    }
  });
};

// Route proxies
app.use('/api/auth', createProxy(services.auth, { '^/api/auth': '' }));

app.use('/api/market-data', 
  authenticateToken, 
  createProxy(services.marketData, { '^/api/market-data': '' })
);

app.use('/api/trading', 
  authenticateToken, 
  createProxy(services.trading, { '^/api/trading': '' })
);

app.use('/api/risk', 
  authenticateToken, 
  createProxy(services.risk, { '^/api/risk': '' })
);

// WebSocket handling for real-time data
const clients = new Map();

wss.on('connection', async (ws, req) => {
  console.log('New WebSocket connection');
  
  // Extract token from query params or headers
  const url = new URL(`http://dummy${req.url}`);
  const token = url.searchParams.get('token') || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    const clientId = decoded.id;
    
    // Store client connection
    clients.set(clientId, {
      ws,
      user: decoded,
      subscriptions: new Set(),
      lastActivity: Date.now()
    });

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        const client = clients.get(clientId);
        
        if (!client) return;
        
        client.lastActivity = Date.now();

        switch (data.type) {
          case 'subscribe':
            client.subscriptions.add(data.channel);
            // Subscribe to Redis channels for real-time data
            await redis.subscribe(`market:${data.symbol}`, `portfolio:${clientId}`);
            ws.send(JSON.stringify({
              type: 'subscribed',
              channel: data.channel,
              symbol: data.symbol
            }));
            break;

          case 'unsubscribe':
            client.subscriptions.delete(data.channel);
            await redis.unsubscribe(`market:${data.symbol}`);
            ws.send(JSON.stringify({
              type: 'unsubscribed',
              channel: data.channel,
              symbol: data.symbol
            }));
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid message format' 
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      clients.delete(clientId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(clientId);
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: Date.now()
    }));

  } catch (error) {
    console.error('WebSocket authentication error:', error);
    ws.close(1008, 'Invalid token');
  }
});

// Redis subscriber for real-time data distribution
const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

subscriber.on('message', (channel, message) => {
  const data = JSON.parse(message);
  
  // Broadcast to relevant clients
  clients.forEach((client, clientId) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      // Check if client is subscribed to this channel
      const isSubscribed = Array.from(client.subscriptions).some(sub => 
        channel.includes(sub) || channel.includes(clientId)
      );
      
      if (isSubscribed) {
        client.ws.send(JSON.stringify({
          type: 'data',
          channel,
          data,
          timestamp: Date.now()
        }));
      }
    }
  });
});

// Cleanup inactive connections
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  clients.forEach((client, clientId) => {
    if (now - client.lastActivity > timeout) {
      client.ws.close(1000, 'Timeout');
      clients.delete(clientId);
    }
  });
}, 60000); // Check every minute

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Gateway error:', error);
  
  const correlationId = req.headers['x-correlation-id'] || 'unknown';
  
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    correlationId,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl 
  });
});


server.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket server ready`);
});

// Services configuration
const SERVICES = {
  auth: {
    url: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    healthCheck: '/health'
  },
  'market-data': {
    url: process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3002',
    healthCheck: '/health'
  },
  trading: {
    url: process.env.TRADING_SERVICE_URL || 'http://localhost:3003',
    healthCheck: '/health'
  },
  'risk-management': {
    url: process.env.RISK_SERVICE_URL || 'http://localhost:3004',
    healthCheck: '/health'
  },
  portfolio: {
    url: process.env.PORTFOLIO_SERVICE_URL || 'http://localhost:3007',
    healthCheck: '/health'
  },
  notifications: {
    url: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006',
    healthCheck: '/health'
  },
  analytics: {
    url: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3008',
    healthCheck: '/health'
  },
  compliance: {
    url: process.env.COMPLIANCE_SERVICE_URL || 'http://localhost:3009',
    healthCheck: '/health'
  },
  payments: {
    url: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3010',
    healthCheck: '/health'
  },
  subscriptions: {
    url: process.env.SUBSCRIPTION_SERVICE_URL || 'http://localhost:3011',
    healthCheck: '/health'
  }
};

// Setup logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/api-gateway.log' }),
    new winston.transports.Console()
  ]
});

// Setup metrics
const register = promClient.register;
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service']
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'service'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10]
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Request ID and logging middleware
app.use((req, res, next) => {
  req.requestId = require('uuid').v4();
  req.startTime = process.hrtime.bigint();
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  
  logger.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  next();
});

// Speed limiting for suspected attacks
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 100, // allow 100 requests per windowMs without delay
  delayMs: 500 // add 500ms of delay per request after delayAfter
});

app.use(limiter);
app.use(speedLimiter);


// Metrics middleware
app.use((req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Number(process.hrtime.bigint() - req.startTime) / 1000000000;
    const service = req.route?.path?.split('/')[2] || 'unknown';
    
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
      service
    });
    
    httpRequestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path,
      service
    }, duration);
    
    logger.info('Request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(3)}s`
    });
    
    return originalSend.call(this, data);
  };
  
  next();
});

// Health check for API Gateway
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});

// Service health checks
app.get('/health/services', async (req, res) => {
  const healthChecks = {};
  
  for (const [serviceName, config] of Object.entries(SERVICES)) {
    try {
      const response = await fetch(`${config.url}${config.healthCheck}`);
      healthChecks[serviceName] = {
        status: response.ok ? 'healthy' : 'unhealthy',
        url: config.url,
        responseTime: response.headers.get('x-response-time')
      };
    } catch (error) {
      healthChecks[serviceName] = {
        status: 'unhealthy',
        url: config.url,
        error: error.message
      };
    }
  }
  
  const allHealthy = Object.values(healthChecks).every(check => check.status === 'healthy');
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    services: healthChecks,
    timestamp: new Date().toISOString()
  });
});

// Service discovery and load balancing
class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.healthyInstances = new Map();
  }
  
  registerService(name, instances) {
    this.services.set(name, instances);
    this.healthyInstances.set(name, [...instances]);
  }
  
  getHealthyInstance(serviceName) {
    const instances = this.healthyInstances.get(serviceName) || [];
    if (instances.length === 0) return null;
    
    // Simple round-robin load balancing
    const instance = instances.shift();
    instances.push(instance);
    this.healthyInstances.set(serviceName, instances);
    
    return instance;
  }
  
  markUnhealthy(serviceName, instance) {
    const instances = this.healthyInstances.get(serviceName) || [];
    const index = instances.indexOf(instance);
    if (index > -1) {
      instances.splice(index, 1);
      this.healthyInstances.set(serviceName, instances);
    }
  }
}

const serviceRegistry = new ServiceRegistry();

// Initialize service registry
for (const [serviceName, config] of Object.entries(SERVICES)) {
  serviceRegistry.registerService(serviceName, [config.url]);
}

// Dynamic proxy middleware
const createDynamicProxy = (serviceName) => {
  return createProxyMiddleware({
    target: (req) => {
      const instance = serviceRegistry.getHealthyInstance(serviceName);
      if (!instance) {
        throw new Error(`No healthy instances available for ${serviceName}`);
      }
      return instance;
    },
    changeOrigin: true,
    pathRewrite: {
      [`^/api/${serviceName}`]: '/api'
    },
    onProxyReq: (proxyReq, req, res) => {
      // Add request ID to proxied requests
      proxyReq.setHeader('X-Request-ID', req.requestId);
      proxyReq.setHeader('X-Forwarded-For', req.ip);
      
      // Add user context if authenticated
      if (req.user) {
        proxyReq.setHeader('X-User-ID', req.user.id);
        proxyReq.setHeader('X-User-Roles', JSON.stringify(req.user.roles || []));
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      // Add response time header
      const duration = Number(process.hrtime.bigint() - req.startTime) / 1000000;
      proxyRes.headers['x-response-time'] = `${duration.toFixed(3)}ms`;
    },
    onError: (err, req, res) => {
      logger.error('Proxy error', {
        service: serviceName,
        error: err.message,
        url: req.url
      });
      
      res.status(503).json({
        error: 'Service unavailable',
        message: `${serviceName} service is currently unavailable`,
        requestId: req.requestId
      });
    }
  });
};

// Route configuration
const routes = [
  // Public routes (no authentication required)
  { path: '/api/auth', service: 'auth', public: true },
  { path: '/api/market-data/public', service: 'market-data', public: true },
  
  // Protected routes (authentication required)
  { path: '/api/market-data', service: 'market-data', authenticated: true },
  { path: '/api/trading', service: 'trading', authenticated: true },
  { path: '/api/portfolios', service: 'portfolio', authenticated: true },
  { path: '/api/positions', service: 'portfolio', authenticated: true },
  { path: '/api/performance', service: 'portfolio', authenticated: true },
  { path: '/api/risk', service: 'risk-management', authenticated: true },
  { path: '/api/notifications', service: 'notifications', authenticated: true },
  { path: '/api/analytics', service: 'analytics', authenticated: true },
  { path: '/api/compliance', service: 'compliance', authenticated: true },
  { path: '/api/payments', service: 'payments', authenticated: true },
  { path: '/api/subscriptions', service: 'subscriptions', authenticated: true }
];

// Apply routes
routes.forEach(route => {
  const middleware = [];
  
  // Add authentication middleware for protected routes
  if (route.authenticated) {
    middleware.push(authenticateToken);
  }
  
  // Add specific rate limits for different services
  if (route.service === 'trading') {
    middleware.push(rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // 100 trading requests per minute
      message: 'Trading rate limit exceeded'
    }));
  }
  
  if (route.service === 'market-data') {
    middleware.push(rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 1000, // 1000 market data requests per minute
      message: 'Market data rate limit exceeded'
    }));
  }
  
  // Add the proxy middleware
  middleware.push(createDynamicProxy(route.service));
  
  app.use(route.path, ...middleware);
});

// Global error handler
app.use((err, req, res, next) => {
  const duration = Number(process.hrtime.bigint() - req.startTime) / 1000000;
  
  logger.error('Request error', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    duration: `${duration.toFixed(3)}ms`
  });
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    requestId: req.requestId
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found',
    requestId: req.requestId
  });
});

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('API Gateway shutdown complete');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
