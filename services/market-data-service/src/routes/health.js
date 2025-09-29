const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'market-data-service',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development'
  };

  res.json(healthStatus);
});

router.get('/detailed', (req, res) => {
  // This would typically be called by the MarketDataManager
  // For now, we'll return a basic structure
  const detailedHealth = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'market-data-service',
    components: {
      collectors: {
        stock: { status: 'OK', connections: 0 },
        crypto: { status: 'OK', connections: 0 },
        forex: { status: 'OK', connections: 0 },
        commodities: { status: 'OK', connections: 0 }
      },
      processors: {
        price: { status: 'OK', processed: 0 },
        volume: { status: 'OK', processed: 0 },
        correlation: { status: 'OK', processed: 0 }
      },
      distributors: {
        websocket: { status: 'OK', clients: 0 },
        kafka: { status: 'OK', connected: false },
        redis: { status: 'OK', connected: false }
      }
    },
    metrics: {
      dataPointsProcessed: 0,
      activeSubscriptions: 0,
      averageLatency: 0
    }
  };

  res.json(detailedHealth);
});

module.exports = router;