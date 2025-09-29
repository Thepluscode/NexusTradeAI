#!/usr/bin/env node

/**
 * Nexus Trade AI - Enhanced Integration Server
 * 
 * Comprehensive server that integrates all advanced features:
 * - Database persistence for historical analysis
 * - WebSocket real-time feeds for ultra-low latency
 * - Advanced monitoring dashboard
 * - Multiple broker integrations
 * - Real-time market data
 * - Trading automation
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');

// Import enhanced services
const DatabaseService = require('./services/database/DatabaseService');
const WebSocketService = require('./services/websocket/WebSocketService');
const EnhancedBrokerService = require('./services/broker-connector/EnhancedBrokerService');

class EnhancedIntegrationServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = process.env.PORT || 3001;
    
    // Enhanced services
    this.database = null;
    this.websocket = null;
    this.brokerService = null;
    
    // Service status
    this.services = {
      database: { enabled: process.env.DATABASE_ENABLED === 'true', status: 'stopped' },
      websocket: { enabled: process.env.WEBSOCKET_ENABLED === 'true', status: 'stopped' },
      brokers: { enabled: true, status: 'stopped' },
      marketData: { enabled: true, status: 'stopped' },
      automation: { enabled: true, status: 'stopped' }
    };
    
    this.isRunning = false;
    
    console.log('🚀 Enhanced Integration Server initializing...');
    this.setupExpress();
  }

  /**
   * Setup Express application
   */
  setupExpress() {
    // Middleware
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'services/dashboard')));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'enhanced-integration-server',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        services: this.services,
        uptime: process.uptime()
      });
    });

    // Dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'services/dashboard/dashboard.html'));
    });

    // Enhanced API routes
    this.setupAPIRoutes();
  }

  /**
   * Setup enhanced API routes
   */
  setupAPIRoutes() {
    const router = express.Router();

    // Database API
    router.get('/database/health', async (req, res) => {
      if (!this.database) {
        return res.json({ status: 'disabled' });
      }
      
      try {
        const health = await this.database.healthCheck();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/database/market-data/:symbol', async (req, res) => {
      if (!this.database) {
        return res.status(503).json({ error: 'Database not available' });
      }
      
      try {
        const { symbol } = req.params;
        const { days = 30 } = req.query;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const data = await this.database.getMarketData(symbol, startDate);
        res.json({ symbol, data, count: data.length });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/database/performance', async (req, res) => {
      if (!this.database) {
        return res.status(503).json({ error: 'Database not available' });
      }
      
      try {
        const { strategy, symbol, days = 30 } = req.query;
        const analytics = await this.database.getPerformanceAnalytics(strategy, symbol, days);
        res.json({ analytics });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // WebSocket API
    router.get('/websocket/stats', (req, res) => {
      if (!this.websocket) {
        return res.json({ status: 'disabled' });
      }
      
      const stats = this.websocket.getStats();
      res.json(stats);
    });

    // Broker API
    router.get('/brokers/status', async (req, res) => {
      if (!this.brokerService) {
        return res.json({ status: 'disabled' });
      }
      
      const status = this.brokerService.getStatus();
      res.json(status);
    });

    router.get('/brokers/accounts', async (req, res) => {
      if (!this.brokerService) {
        return res.status(503).json({ error: 'Broker service not available' });
      }
      
      try {
        const accounts = await this.brokerService.getAggregatedAccounts();
        res.json(accounts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/brokers/order', async (req, res) => {
      if (!this.brokerService) {
        return res.status(503).json({ error: 'Broker service not available' });
      }
      
      try {
        const order = req.body;
        const { broker } = req.query;
        
        const results = await this.brokerService.executeOrder(order, broker);
        res.json({ results });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // System API
    router.get('/system/status', (req, res) => {
      res.json({
        server: {
          running: this.isRunning,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: '2.0.0'
        },
        services: this.services,
        timestamp: new Date().toISOString()
      });
    });

    router.post('/system/restart-service', async (req, res) => {
      const { service } = req.body;
      
      try {
        await this.restartService(service);
        res.json({ success: true, message: `${service} restarted` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mount router
    this.app.use('/api/enhanced', router);
  }

  /**
   * Start all enhanced services
   */
  async start() {
    try {
      console.log('🚀 Starting Enhanced Integration Server...');
      
      // Start database service
      if (this.services.database.enabled) {
        await this.startDatabaseService();
      }
      
      // Start broker service
      await this.startBrokerService();
      
      // Start WebSocket service
      if (this.services.websocket.enabled) {
        await this.startWebSocketService();
      }
      
      // Start HTTP server
      this.server = http.createServer(this.app);
      
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      this.isRunning = true;
      
      console.log(`🚀 Enhanced Integration Server running on port ${this.port}`);
      console.log(`📊 Dashboard: http://localhost:${this.port}`);
      console.log(`🔌 WebSocket: ws://localhost:${process.env.WEBSOCKET_PORT || 8080}`);
      console.log(`🗄️  Database: ${this.services.database.status}`);
      console.log(`🏦 Brokers: ${this.services.brokers.status}`);
      
      this.logSystemEvent('info', 'Enhanced Integration Server started successfully');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to start Enhanced Integration Server:', error.message);
      throw error;
    }
  }

  /**
   * Start database service
   */
  async startDatabaseService() {
    try {
      console.log('🗄️  Starting Database Service...');
      
      this.database = new DatabaseService();
      await this.database.initialize();
      
      this.services.database.status = 'running';
      console.log('✅ Database Service started');
    } catch (error) {
      this.services.database.status = 'error';
      console.error('❌ Database Service failed:', error.message);
      // Continue without database
    }
  }

  /**
   * Start WebSocket service
   */
  async startWebSocketService() {
    try {
      console.log('🔌 Starting WebSocket Service...');
      
      this.websocket = new WebSocketService({
        port: process.env.WEBSOCKET_PORT || 8080
      });
      
      await this.websocket.start();
      
      this.services.websocket.status = 'running';
      console.log('✅ WebSocket Service started');
    } catch (error) {
      this.services.websocket.status = 'error';
      console.error('❌ WebSocket Service failed:', error.message);
      // Continue without WebSocket
    }
  }

  /**
   * Start broker service
   */
  async startBrokerService() {
    try {
      console.log('🏦 Starting Enhanced Broker Service...');
      
      this.brokerService = new EnhancedBrokerService();
      await this.brokerService.initialize();
      
      this.services.brokers.status = 'running';
      console.log('✅ Enhanced Broker Service started');
    } catch (error) {
      this.services.brokers.status = 'error';
      console.error('❌ Enhanced Broker Service failed:', error.message);
      // Continue without brokers
    }
  }

  /**
   * Restart specific service
   */
  async restartService(serviceName) {
    console.log(`🔄 Restarting ${serviceName} service...`);
    
    switch (serviceName) {
      case 'database':
        if (this.database) {
          await this.database.close();
        }
        await this.startDatabaseService();
        break;
        
      case 'websocket':
        if (this.websocket) {
          await this.websocket.stop();
        }
        await this.startWebSocketService();
        break;
        
      case 'brokers':
        if (this.brokerService) {
          await this.brokerService.disconnect();
        }
        await this.startBrokerService();
        break;
        
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
    
    console.log(`✅ ${serviceName} service restarted`);
  }

  /**
   * Log system event
   */
  async logSystemEvent(level, message, metadata = {}) {
    console.log(`📝 [${level.toUpperCase()}] ${message}`);
    
    if (this.database) {
      try {
        await this.database.logEvent(level, 'enhanced-integration-server', message, metadata);
      } catch (error) {
        // Silently handle database logging errors
      }
    }
  }

  /**
   * Stop all services
   */
  async stop() {
    console.log('🛑 Stopping Enhanced Integration Server...');
    
    // Stop WebSocket service
    if (this.websocket) {
      await this.websocket.stop();
      this.services.websocket.status = 'stopped';
    }
    
    // Stop broker service
    if (this.brokerService) {
      await this.brokerService.disconnect();
      this.services.brokers.status = 'stopped';
    }
    
    // Stop database service
    if (this.database) {
      await this.database.close();
      this.services.database.status = 'stopped';
    }
    
    // Stop HTTP server
    if (this.server) {
      this.server.close();
    }
    
    this.isRunning = false;
    console.log('🛑 Enhanced Integration Server stopped');
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new EnhancedIntegrationServer();
  
  server.start().catch(error => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

module.exports = EnhancedIntegrationServer;
