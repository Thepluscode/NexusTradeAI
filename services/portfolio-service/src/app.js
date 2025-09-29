// src/app.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

// Import services
const PortfolioService = require('./services/portfolioService');
const PositionService = require('./services/positionService');
const PerformanceService = require('./services/performanceService');
const ValuationService = require('./services/valuationService');
const RiskService = require('./services/riskService');

// Import routes
const portfolioRoutes = require('./routes/portfolios');
const positionRoutes = require('./routes/positions');
const performanceRoutes = require('./routes/performance');
const valuationRoutes = require('./routes/valuation');
const healthRoutes = require('./routes/health');
const riskRoutes = require('./routes/risk');

// Setup logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/portfolio-service.log' }),
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
const portfolioCounter = new promClient.Counter({
  name: 'portfolios_total',
  help: 'Total number of portfolios managed',
  labelNames: ['status', 'user_type']
});

const positionCounter = new promClient.Counter({
  name: 'positions_total',
  help: 'Total number of positions tracked',
  labelNames: ['symbol', 'side', 'status']
});

const valuationGauge = new promClient.Gauge({
  name: 'portfolio_value',
  help: 'Current portfolio values',
  labelNames: ['portfolio_id', 'currency']
});

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time portfolio updates
const wss = new WebSocket.Server({ 
  server,
  path: '/ws/portfolio'
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio-service', {
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
const portfolioService = new PortfolioService({
  logger,
  metrics: { portfolioCounter, valuationGauge }
});

const positionService = new PositionService({
  logger,
  metrics: { positionCounter }
});

const performanceService = new PerformanceService({
  logger,
  portfolioService,
  positionService
});

const valuationService = new ValuationService({
  logger,
  metrics: { valuationGauge }
});

const riskService = new RiskService({
  logger,
  portfolioService,
  positionService
});

// Make services available to routes
app.set('portfolioService', portfolioService);
app.set('positionService', positionService);
app.set('performanceService', performanceService);
app.set('valuationService', valuationService);
app.set('wss', wss);
app.set('riskService', riskService);

// Routes
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/valuation', valuationRoutes);
app.use('/health', healthRoutes);
app.use('/api/risk', riskRoutes);

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientId = require('uuid').v4();
  ws.clientId = clientId;
  
  logger.info(`Portfolio WebSocket client connected: ${clientId}`);
  
  ws.send(JSON.stringify({
    type: 'connection_established',
    clientId,
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      await handleWebSocketMessage(ws, message);
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  ws.on('close', () => {
    logger.info(`Portfolio WebSocket client disconnected: ${clientId}`);
  });
});


async function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'subscribe_portfolio':
      ws.portfolioId = message.portfolioId;
      ws.subscriptions = ws.subscriptions || [];
      ws.subscriptions.push(`portfolio_${message.portfolioId}`);
      break;
      
    case 'subscribe_user_portfolios':
      ws.userId = message.userId;
      ws.subscriptions = ws.subscriptions || [];
      ws.subscriptions.push(`user_portfolios_${message.userId}`);
      break;
      
    case 'unsubscribe':
      ws.subscriptions = [];
      break;
  }
}

// Scheduled jobs
const scheduleJobs = () => {
  // Portfolio valuation updates (every 30 seconds)
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await valuationService.updateAllPortfolioValuations();
    } catch (error) {
      logger.error('Error updating portfolio valuations:', error);
    }
  });
  
  // Performance calculations (every 5 minutes)
  cron.schedule('*/5 * * * *', async () => {
    try {
      await performanceService.calculatePerformanceMetrics();
    } catch (error) {
      logger.error('Error calculating performance metrics:', error);
    }
  });
  
  // Daily portfolio sync (at 6 AM)
  cron.schedule('0 6 * * *', async () => {
    try {
      await portfolioService.performDailySync();
    } catch (error) {
      logger.error('Error in daily portfolio sync:', error);
    }
  });
  
  logger.info('Portfolio service jobs scheduled');
};

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
    logger.info('Starting Portfolio Service...');
    
    // Initialize services
    await portfolioService.initialize();
    await positionService.initialize();
    await performanceService.initialize();
    await valuationService.initialize();
    
    // Schedule jobs
    scheduleJobs();
    
    const PORT = process.env.PORT || 3005;
    server.listen(PORT, () => {
      logger.info(`Portfolio Service running on port ${PORT}`);
    });
    
    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(() => {
        logger.info('Portfolio Service shutdown complete');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start Portfolio Service:', error);
    process.exit(1);
  }
}

startService();

module.exports = { app, server };