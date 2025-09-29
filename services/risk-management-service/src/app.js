// src/app.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
const cron = require('node-cron');
const mongoose = require('mongoose');
require('dotenv').config();

// Import services
const RiskCalculationService = require('./services/riskCalculationService');
const RiskMonitorService = require('./services/riskMonitorService');
const AlertManagerService = require('./services/alertManagerService');

// Import routes
const riskRoutes = require('./routes/risk');
const metricsRoutes = require('./routes/metrics');
const alertsRoutes = require('./routes/alerts');
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
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/risk.log' }),
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
collectDefaultMetrics({ register, timeout: 5000 });

// Custom metrics
const riskCalculationCounter = new promClient.Counter({
  name: 'risk_calculations_total',
  help: 'Total number of risk calculations performed',
  labelNames: ['calculation_type', 'status']
});

const riskMetricsGauge = new promClient.Gauge({
  name: 'risk_metrics_value',
  help: 'Current risk metrics values',
  labelNames: ['metric_type', 'portfolio_id', 'asset_class']
});

const alertCounter = new promClient.Counter({
  name: 'risk_alerts_total',
  help: 'Total number of risk alerts generated',
  labelNames: ['alert_type', 'severity', 'portfolio_id']
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    methods: ['GET', 'POST']
  },
  transports: ['websocket']
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/risk-management', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add context to requests
app.use((req, res, next) => {
  req.logger = logger;
  req.metrics = { riskCalculationCounter, riskMetricsGauge, alertCounter };
  req.startTime = process.hrtime.bigint();
  next();
});

// Initialize services
const riskCalculationService = new RiskCalculationService({
  logger,
  metrics: { riskCalculationCounter, riskMetricsGauge }
});

const riskMonitorService = new RiskMonitorService({
  logger,
  metrics: { riskMetricsGauge, alertCounter },
  io
});

const alertManagerService = new AlertManagerService({
  logger,
  metrics: { alertCounter },
  io
});

// Routes
app.use('/api/risk', riskRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/health', healthRoutes);

// Make services available to routes
app.set('riskCalculationService', riskCalculationService);
app.set('riskMonitorService', riskMonitorService);
app.set('alertManagerService', alertManagerService);
app.set('io', io);

// Global error handler
app.use((err, req, res, next) => {
  const executionTime = Number(process.hrtime.bigint() - req.startTime) / 1000000;
  
  logger.error('Request error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    executionTime: `${executionTime.toFixed(3)}ms`
  });
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// WebSocket connections
io.on('connection', (socket) => {
  logger.info(`Risk management client connected: ${socket.id}`);
  
  socket.on('subscribe_portfolio_risk', (data) => {
    const { portfolioId } = data;
    socket.join(`portfolio_risk_${portfolioId}`);
    logger.info(`Client ${socket.id} subscribed to portfolio risk for ${portfolioId}`);
  });
  
  socket.on('subscribe_alerts', (data) => {
    const { userId } = data;
    socket.join(`alerts_${userId}`);
    logger.info(`Client ${socket.id} subscribed to alerts for user ${userId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Risk management client disconnected: ${socket.id}`);
  });
});

// Schedule risk calculation jobs
const scheduleJobs = () => {
  // Real-time risk monitoring (every 30 seconds)
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await riskMonitorService.performRealTimeMonitoring();
    } catch (error) {
      logger.error('Error in real-time risk monitoring:', error);
    }
  });
  
  // Portfolio risk calculation (every 5 minutes)
  cron.schedule('*/5 * * * *', async () => {
    try {
      await riskCalculationService.calculatePortfolioRisk();
    } catch (error) {
      logger.error('Error in portfolio risk calculation:', error);
    }
  });
  
  // Stress testing (every hour)
  cron.schedule('0 * * * *', async () => {
    try {
      await riskCalculationService.runStressTests();
    } catch (error) {
      logger.error('Error in stress testing:', error);
    }
  });
  
  // Daily risk reports (at 6 AM)
  cron.schedule('0 6 * * *', async () => {
    try {
      await riskCalculationService.generateDailyReports();
    } catch (error) {
      logger.error('Error generating daily risk reports:', error);
    }
  });
  
  logger.info('Risk management jobs scheduled');
};

// Start the service
async function startService() {
  try {
    logger.info('Starting Risk Management Service...');
    
    // Initialize services
    await riskCalculationService.initialize();
    await riskMonitorService.initialize();
    await alertManagerService.initialize();
    
    // Schedule jobs
    scheduleJobs();
    
    const PORT = process.env.PORT || 3004;
    server.listen(PORT, () => {
      logger.info(`Risk Management Service running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      try {
        server.close(() => {
          logger.info('Risk Management Service shut down complete');
          process.exit(0);
        });
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start Risk Management Service:', error);
    process.exit(1);
  }
}

startService();

module.exports = { app, server };