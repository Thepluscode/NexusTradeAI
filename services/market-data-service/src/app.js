const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const winston = require('winston');
const promClient = require('prom-client');
require('dotenv').config();

const MarketDataManager = require('./core/MarketDataManager');
const WebSocketDistributor = require('./distributors/websocketDistributor');
const KafkaDistributor = require('./distributors/kafkaDistributor');
const RedisDistributor = require('./distributors/redisDistributor');
const healthRoutes = require('./routes/health');
const dataRoutes = require('./routes/data');
const adminRoutes = require('./routes/admin');
const metricsRoutes = require('./routes/metrics');

// Setup logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Setup metrics
const register = promClient.register;
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register });

// Custom metrics
const dataPointsCounter = new promClient.Counter({
  name: 'market_data_points_total',
  help: 'Total number of market data points processed',
  labelNames: ['exchange', 'symbol', 'type']
});

const latencyHistogram = new promClient.Histogram({
  name: 'market_data_latency_seconds',
  help: 'Market data processing latency',
  labelNames: ['operation', 'exchange'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add logger and metrics to request
app.use((req, res, next) => {
  req.logger = logger;
  req.metrics = { dataPointsCounter, latencyHistogram };
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/metrics', metricsRoutes);

// Initialize Market Data Manager
const marketDataManager = new MarketDataManager({
  logger,
  metrics: { dataPointsCounter, latencyHistogram }
});

// Initialize Distributors (conditionally)
const distributors = {};

// Always initialize WebSocket for basic functionality
const webSocketDistributor = new WebSocketDistributor(io, { logger });
distributors.websocket = webSocketDistributor;
marketDataManager.addDistributor(webSocketDistributor);

// Only initialize Kafka if enabled
if (process.env.ENABLE_KAFKA === 'true') {
  const kafkaDistributor = new KafkaDistributor({ logger });
  distributors.kafka = kafkaDistributor;
  marketDataManager.addDistributor(kafkaDistributor);
}

// Only initialize Redis if enabled
if (process.env.ENABLE_REDIS === 'true') {
  const redisDistributor = new RedisDistributor({ logger });
  distributors.redis = redisDistributor;
  marketDataManager.addDistributor(redisDistributor);
}

// Start the service
async function startService() {
  try {
    logger.info('Starting Market Data Service...');

    // Initialize distributors conditionally
    if (distributors.kafka) {
      logger.info('Initializing Kafka distributor...');
      await distributors.kafka.initialize();
    }
    if (distributors.redis) {
      logger.info('Initializing Redis distributor...');
      await distributors.redis.initialize();
    }
    
    // Start market data collection
    await marketDataManager.start();
    
    // Start server
    const PORT = process.env.PORT || 3002;
    server.listen(PORT, () => {
      logger.info(`Market Data Service running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (error) {
    logger.error('Failed to start Market Data Service:', error);
    process.exit(1);
  }
}

async function gracefulShutdown() {
  logger.info('Shutting down Market Data Service...');
  
  try {
    await marketDataManager.stop();

    // Disconnect distributors conditionally
    if (distributors.kafka) {
      await distributors.kafka.disconnect();
    }
    if (distributors.redis) {
      await distributors.redis.disconnect();
    }
    
    server.close(() => {
      logger.info('Market Data Service shut down complete');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle WebSocket connections
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('subscribe', (data) => {
    webSocketDistributor.handleSubscription(socket, data);
  });
  
  socket.on('unsubscribe', (data) => {
    webSocketDistributor.handleUnsubscription(socket, data);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    webSocketDistributor.handleDisconnection(socket);
  });
});

startService();

module.exports = app;