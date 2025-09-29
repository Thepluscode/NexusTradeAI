// src/app.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const mongoose = require('mongoose');
require('dotenv').config();

// Import services
const NotificationService = require('./services/notificationService');
const EmailService = require('./services/emailService');
const SMSService = require('./services/smsService');
const PushNotificationService = require('./services/pushNotificationService');
const TemplateService = require('./services/templateService');

// Import routes
const notificationRoutes = require('./routes/notifications');
const templateRoutes = require('./routes/templates');
const subscriptionRoutes = require('./routes/subscriptions');
const healthRoutes = require('./routes/health');

// Setup logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/notification-service.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Setup metrics
const register = promClient.register;
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register });

// Custom metrics
const notificationCounter = new promClient.Counter({
  name: 'notifications_total',
  help: 'Total number of notifications sent',
  labelNames: ['type', 'channel', 'status']
});

const notificationLatency = new promClient.Histogram({
  name: 'notification_processing_duration_seconds',
  help: 'Notification processing latency in seconds',
  labelNames: ['type', 'channel'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10]
});

const activeConnections = new promClient.Gauge({
  name: 'active_websocket_connections',
  help: 'Number of active WebSocket connections'
});

const app = express();
const server = http.createServer(app);

// Socket.IO server for real-time notifications
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/notification-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request context middleware
app.use((req, res, next) => {
  req.requestId = require('uuid').v4();
  req.startTime = process.hrtime.bigint();
  req.logger = logger.child({ requestId: req.requestId });
  next();
});

// Initialize services
const emailService = new EmailService({
  logger,
  metrics: { notificationCounter, notificationLatency }
});

const smsService = new SMSService({
  logger,
  metrics: { notificationCounter, notificationLatency }
});

const pushNotificationService = new PushNotificationService({
  logger,
  metrics: { notificationCounter, notificationLatency }
});

const templateService = new TemplateService({
  logger
});

const notificationService = new NotificationService({
  logger,
  metrics: { notificationCounter, notificationLatency, activeConnections },
  emailService,
  smsService,
  pushNotificationService,
  templateService,
  io
});

// Make services available to routes
app.set('notificationService', notificationService);
app.set('emailService', emailService);
app.set('smsService', smsService);
app.set('pushNotificationService', pushNotificationService);
app.set('templateService', templateService);
app.set('io', io);

// Routes
app.use('/api/notifications', notificationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/health', healthRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  const clientId = require('uuid').v4();
  socket.clientId = clientId;
  
  logger.info(`WebSocket client connected: ${clientId}`);
  activeConnections.inc();
  
  // Send welcome message
  socket.emit('connected', {
    clientId,
    timestamp: new Date().toISOString()
  });
  
  // Handle client events
  socket.on('subscribe', async (data) => {
    try {
      await handleSubscription(socket, data);
    } catch (error) {
      logger.error('Subscription error:', error);
      socket.emit('error', { message: 'Subscription failed' });
    }
  });
  
  socket.on('unsubscribe', async (data) => {
    try {
      await handleUnsubscription(socket, data);
    } catch (error) {
      logger.error('Unsubscription error:', error);
    }
  });
  
  socket.on('disconnect', () => {
    logger.info(`WebSocket client disconnected: ${clientId}`);
    activeConnections.dec();
  });
  
  socket.on('error', (error) => {
    logger.error(`WebSocket error for client ${clientId}:`, error);
  });
});

async function handleSubscription(socket, data) {
  const { userId, channels, preferences } = data;
  
  if (userId) {
    socket.userId = userId;
    socket.join(`user_${userId}`);
    
    // Subscribe to specific channels
    if (channels && Array.isArray(channels)) {
      channels.forEach(channel => {
        socket.join(`${channel}_${userId}`);
      });
    }
    
    // Store preferences
    if (preferences) {
      socket.preferences = preferences;
    }
    
    logger.info(`Client ${socket.clientId} subscribed for user ${userId}`);
  }
}

async function handleUnsubscription(socket, data) {
  const { channels } = data;
  
  if (channels && Array.isArray(channels)) {
    channels.forEach(channel => {
      socket.leave(channel);
    });
  }
}

// Global error handler
app.use((err, req, res, next) => {
  const duration = Number(process.hrtime.bigint() - req.startTime) / 1000000;
  
  req.logger.error('Request error:', {
    error: err.message,
    stack: err.stack,
    duration: `${duration.toFixed(3)}ms`
  });
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    requestId: req.requestId
  });
});

// Start the service
async function startService() {
  try {
    logger.info('Starting Notification Service...');
    
    // Initialize services
    await emailService.initialize();
    await smsService.initialize();
    await pushNotificationService.initialize();
    await templateService.initialize();
    await notificationService.initialize();
    
    const PORT = process.env.PORT || 3006;
    server.listen(PORT, () => {
      logger.info(`Notification Service running on port ${PORT}`);
    });
    
    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(() => {
        logger.info('Notification Service shutdown complete');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start Notification Service:', error);
    process.exit(1);
  }
}

startService();

module.exports = { app, server };