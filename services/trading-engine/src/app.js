const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
require('dotenv').config();

const TradingEngine = require('./core/TradingEngine');
const OrderManager = require('./execution/orderManager');
const MatchingEngine = require('./matching/matchingEngine');
const RiskCalculator = require('./risk/riskCalculator');
const PositionManager = require('./risk/positionManager');
const ComplianceChecker = require('./compliance/regulatoryChecker');

const tradingRoutes = require('./routes/trading');
const ordersRoutes = require('./routes/orders');
const positionsRoutes = require('./routes/positions');
const riskRoutes = require('./routes/risk');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');
const metricsRoutes = require('./routes/metrics');

// Setup logging with performance focus
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/trading.log' }),
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
const orderCounter = new promClient.Counter({
  name: 'trading_orders_total',
  help: 'Total number of orders processed',
  labelNames: ['type', 'side', 'status', 'symbol']
});

const executionLatency = new promClient.Histogram({
  name: 'trading_execution_latency_seconds',
  help: 'Order execution latency',
  labelNames: ['order_type', 'symbol'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]
});

const positionValue = new promClient.Gauge({
  name: 'trading_position_value_usd',
  help: 'Current position values in USD',
  labelNames: ['symbol', 'side']
});

const riskMetrics = new promClient.Gauge({
  name: 'trading_risk_metrics',
  help: 'Risk metrics (VaR, exposure, etc)',
  labelNames: ['metric_type', 'timeframe']
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    methods: ['GET', 'POST']
  },
  transports: ['websocket'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for trading applications
}));
app.use(cors());
app.use(compression());

// High-performance JSON parsing
app.use(express.json({ 
  limit: '1mb',
  type: ['application/json', 'application/vnd.api+json']
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Add context to requests
app.use((req, res, next) => {
  req.logger = logger;
  req.metrics = { orderCounter, executionLatency, positionValue, riskMetrics };
  req.startTime = process.hrtime.bigint();
  next();
});

// Routes
app.use('/api/trading', tradingRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/admin', adminRoutes);
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes);

// Initialize Trading Engine
const tradingEngine = new TradingEngine({
  logger,
  metrics: { orderCounter, executionLatency, positionValue, riskMetrics }
});

// Global error handler
app.use((err, req, res, next) => {
  const executionTime = Number(process.hrtime.bigint() - req.startTime) / 1000000; // Convert to ms
  
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

// Start the service
async function startService() {
  try {
    logger.info('Starting Trading Engine...');
    
    // Initialize trading engine
    await tradingEngine.initialize();
    
    // Make trading engine available to routes
    app.set('tradingEngine', tradingEngine);
    
    const PORT = process.env.PORT || 3003;
    server.listen(PORT, () => {
      logger.info(`Trading Engine running on port ${PORT}`);
      logger.info('Trading Engine initialized and ready for orders');
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      try {
        // Stop accepting new orders
        await tradingEngine.stopAcceptingOrders();
        
        // Process remaining orders
        await tradingEngine.processRemainingOrders();
        
        // Close server
        server.close(() => {
          logger.info('Trading Engine shut down complete');
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
    logger.error('Failed to start Trading Engine:', error);
    process.exit(1);
  }
}

// Handle WebSocket connections for real-time updates
io.on('connection', (socket) => {
  logger.info(`Trading client connected: ${socket.id}`);
  
  socket.on('subscribe_orders', (data) => {
    const { userId } = data;
    socket.join(`orders_${userId}`);
    logger.info(`Client ${socket.id} subscribed to orders for user ${userId}`);
  });
  
  socket.on('subscribe_positions', (data) => {
    const { userId } = data;
    socket.join(`positions_${userId}`);
    logger.info(`Client ${socket.id} subscribed to positions for user ${userId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Trading client disconnected: ${socket.id}`);
  });
});

// Expose io for real-time updates
app.set('io', io);

startService();

module.exports = { app, server, tradingEngine };