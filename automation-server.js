#!/usr/bin/env node

/**
 * NexusTradeAI - Automation Server
 * 
 * FCT-style fully automated trading server that runs 24/7
 * Provides REST API for monitoring and control
 */

const express = require('express');
const cors = require('cors');
const AutomatedTradingEngine = require('./services/automation/AutomatedTradingEngine');
const NexusExecutionEngine = require('./services/execution-engine/NexusExecutionEngine');
const NexusAlpha = require('./services/strategy-engine/NexusAlpha');

const app = express();
const PORT = 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Global automation engine instance
let automationEngine = null;

// Enhanced Automation configuration with real trading support
const AUTOMATION_CONFIG = {
  // Trading service connection
  tradingServiceUrl: 'http://localhost:3002',

  // Market monitoring
  marketDataInterval: 5000, // 5 seconds
  strategyEvaluationInterval: 10000, // 10 seconds

  // Enhanced Risk management
  maxDailyLoss: parseInt(process.env.MAX_DAILY_LOSS) || -1000,
  maxPositionSize: parseInt(process.env.MAX_POSITION_SIZE) || 10000,
  riskPerTrade: parseFloat(process.env.RISK_PER_TRADE) || 0.02,
  maxOpenPositions: 5,

  // Real trading configuration
  realTradingEnabled: process.env.REAL_TRADING_ENABLED === 'true',
  paperTradingMode: process.env.ALPACA_PAPER === 'true',

  // Broker configuration
  primaryBroker: process.env.PRIMARY_BROKER || 'alpaca',
  enableMultiBroker: process.env.ENABLE_MULTI_BROKER === 'true',

  // Strategy configuration
  enabledStrategies: (process.env.ENABLED_STRATEGIES || 'meanReversion,momentum,rsi').split(','),
  symbols: (process.env.TRADING_SYMBOLS || 'AAPL,GOOGL,MSFT,TSLA,NVDA,AMZN,META').split(','),

  // Automation settings
  fullyAutomated: process.env.FULLY_AUTOMATED === 'true',

  // Enhanced features
  enableAI: process.env.AI_ENABLED === 'true',
  enableDatabase: process.env.DATABASE_ENABLED === 'true',
  enableWebSocket: process.env.WEBSOCKET_ENABLED === 'true'
};

/**
 * Initialize automation engine
 */
function initializeEngine() {
  if (automationEngine) {
    console.log('⚠️ Engine already initialized');
    return automationEngine;
  }
  
  automationEngine = new AutomatedTradingEngine(AUTOMATION_CONFIG);
  
  // Set up event listeners for monitoring
  setupEngineEventListeners();
  
  console.log('✅ Automation engine initialized');
  return automationEngine;
}

/**
 * Set up event listeners for the automation engine
 */
function setupEngineEventListeners() {
  if (!automationEngine) return;
  
  automationEngine.on('engineStarted', (data) => {
    console.log('🚀 Automation engine started:', data);
  });
  
  automationEngine.on('engineStopped', (data) => {
    console.log('🛑 Automation engine stopped:', data);
  });
  
  automationEngine.on('tradeExecuted', (data) => {
    console.log(`💰 Trade executed: ${data.action} ${data.quantity} ${data.symbol} @ $${data.price} (${data.strategy})`);
  });
  
  automationEngine.on('positionClosed', (data) => {
    console.log(`🔒 Position closed: ${data.symbol} - P&L: $${data.pnl.toFixed(2)} (${data.reason})`);
  });
  
  automationEngine.on('riskUpdate', (data) => {
    console.log(`📊 Risk Update: Daily P&L: $${data.dailyPnL.toFixed(2)}, Unrealized: $${data.unrealizedPnL.toFixed(2)}, Positions: ${data.activePositions}`);
  });
  
  automationEngine.on('emergencyStop', (data) => {
    console.error('🚨 EMERGENCY STOP:', data);
  });
  
  automationEngine.on('marketDataError', (error) => {
    console.error('❌ Market data error:', error.message);
  });
  
  automationEngine.on('strategyError', (error) => {
    console.error('❌ Strategy error:', error.message);
  });
  
  automationEngine.on('tradeError', (data) => {
    console.error(`❌ Trade error for ${data.symbol}:`, data.error);
  });
}

// API Routes

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'automation-server',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    engineStatus: automationEngine ? automationEngine.getStatus() : 'not_initialized'
  });
});

/**
 * Get automation status
 */
app.get('/api/automation/status', (req, res) => {
  try {
    if (!automationEngine) {
      return res.json({
        initialized: false,
        isRunning: false,
        message: 'Automation engine not initialized'
      });
    }
    
    const status = automationEngine.getStatus();
    res.json({
      initialized: true,
      ...status,
      config: AUTOMATION_CONFIG
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start automation
 */
app.post('/api/automation/start', async (req, res) => {
  try {
    if (!automationEngine) {
      initializeEngine();
    }
    
    if (automationEngine.isRunning) {
      return res.json({
        success: false,
        message: 'Automation is already running'
      });
    }
    
    await automationEngine.start();
    
    res.json({
      success: true,
      message: 'Automation started successfully',
      status: automationEngine.getStatus()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Stop automation
 */
app.post('/api/automation/stop', async (req, res) => {
  try {
    if (!automationEngine || !automationEngine.isRunning) {
      return res.json({
        success: false,
        message: 'Automation is not running'
      });
    }
    
    await automationEngine.stop();
    
    res.json({
      success: true,
      message: 'Automation stopped successfully',
      status: automationEngine.getStatus()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get automation configuration
 */
app.get('/api/automation/config', (req, res) => {
  res.json(AUTOMATION_CONFIG);
});

/**
 * Update automation configuration
 */
app.put('/api/automation/config', (req, res) => {
  try {
    const updates = req.body;
    
    // Validate updates
    const allowedUpdates = [
      'maxDailyLoss', 'maxPositionSize', 'riskPerTrade', 'maxOpenPositions',
      'enabledStrategies', 'symbols', 'fullyAutomated', 'paperTrading',
      'realTradingEnabled', 'paperTradingMode', 'primaryBroker', 'enableMultiBroker'
    ];
    
    const invalidKeys = Object.keys(updates).filter(key => !allowedUpdates.includes(key));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        error: `Invalid configuration keys: ${invalidKeys.join(', ')}`
      });
    }
    
    // Apply updates
    Object.assign(AUTOMATION_CONFIG, updates);
    
    // If engine is running, it needs to be restarted for changes to take effect
    const needsRestart = automationEngine && automationEngine.isRunning;
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: AUTOMATION_CONFIG,
      needsRestart: needsRestart
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Enable/Disable Real Trading
 */
app.post('/api/automation/real-trading/:action', (req, res) => {
  try {
    const { action } = req.params;

    if (action === 'enable') {
      AUTOMATION_CONFIG.realTradingEnabled = true;
      AUTOMATION_CONFIG.paperTradingMode = false;
    } else if (action === 'disable') {
      AUTOMATION_CONFIG.realTradingEnabled = false;
      AUTOMATION_CONFIG.paperTradingMode = true;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Use "enable" or "disable"'
      });
    }

    // Update engine if running
    if (automationEngine) {
      automationEngine.updateConfig(AUTOMATION_CONFIG);
    }

    res.json({
      success: true,
      message: `Real trading ${action}d successfully`,
      realTradingEnabled: AUTOMATION_CONFIG.realTradingEnabled,
      paperTradingMode: AUTOMATION_CONFIG.paperTradingMode
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get broker status and account information
 */
app.get('/api/automation/brokers', async (req, res) => {
  try {
    if (!automationEngine) {
      return res.json({
        brokers: [],
        message: 'Automation engine not initialized'
      });
    }

    const brokerStatus = await automationEngine.getBrokerStatus();
    res.json(brokerStatus);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Deploy new strategy
 */
app.post('/api/automation/strategies/deploy', async (req, res) => {
  try {
    if (!automationEngine) {
      return res.status(400).json({
        success: false,
        error: 'Automation engine not initialized'
      });
    }

    const { strategyName, config } = req.body;

    if (!strategyName) {
      return res.status(400).json({
        success: false,
        error: 'Strategy name is required'
      });
    }

    const result = await automationEngine.deployStrategy(strategyName, config || {});
    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Remove strategy
 */
app.delete('/api/automation/strategies/:strategyName', async (req, res) => {
  try {
    if (!automationEngine) {
      return res.status(400).json({
        success: false,
        error: 'Automation engine not initialized'
      });
    }

    const { strategyName } = req.params;
    const result = await automationEngine.removeStrategy(strategyName);
    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get strategy performance metrics
 */
app.get('/api/automation/strategies/performance', (req, res) => {
  try {
    if (!automationEngine) {
      return res.json({ strategies: {} });
    }

    const performance = automationEngine.getStrategyPerformance();
    res.json(performance);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get active positions
 */
app.get('/api/automation/positions', (req, res) => {
  try {
    if (!automationEngine) {
      return res.json({ positions: [] });
    }
    
    const positions = Array.from(automationEngine.activePositions.entries()).map(([symbol, position]) => ({
      symbol,
      ...position,
      currentPrice: automationEngine.marketData.get(symbol)?.currentPrice || 0,
      unrealizedPnL: calculateUnrealizedPnL(symbol, position, automationEngine.marketData.get(symbol)?.currentPrice)
    }));
    
    res.json({ positions });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get market data
 */
app.get('/api/automation/market-data', (req, res) => {
  try {
    if (!automationEngine) {
      return res.json({ marketData: {} });
    }
    
    const marketData = {};
    for (const [symbol, data] of automationEngine.marketData.entries()) {
      marketData[symbol] = {
        currentPrice: data.currentPrice,
        lastUpdate: data.lastUpdate,
        priceHistory: data.prices.slice(-20) // Last 20 price points
      };
    }
    
    res.json({ marketData });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Emergency stop
 */
app.post('/api/automation/emergency-stop', async (req, res) => {
  try {
    if (!automationEngine) {
      return res.json({
        success: false,
        message: 'Automation engine not initialized'
      });
    }
    
    await automationEngine.emergencyStop();
    
    res.json({
      success: true,
      message: 'Emergency stop executed',
      status: automationEngine.getStatus()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get automation logs/events (simplified)
 */
app.get('/api/automation/logs', (req, res) => {
  // In a real implementation, this would fetch from a logging system
  res.json({
    logs: [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Automation system operational',
        data: automationEngine ? automationEngine.getStatus() : null
      }
    ]
  });
});

// Helper functions

/**
 * Calculate unrealized P&L for a position
 */
function calculateUnrealizedPnL(symbol, position, currentPrice) {
  if (!currentPrice) return 0;
  
  return position.side === 'BUY' 
    ? (currentPrice - position.entryPrice) * position.quantity
    : (position.entryPrice - currentPrice) * position.quantity;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Graceful shutdown initiated...');
  
  if (automationEngine && automationEngine.isRunning) {
    console.log('🔄 Stopping automation engine...');
    await automationEngine.stop();
  }
  
  console.log('✅ Shutdown complete');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Graceful shutdown initiated...');
  
  if (automationEngine && automationEngine.isRunning) {
    console.log('🔄 Stopping automation engine...');
    await automationEngine.stop();
  }
  
  console.log('✅ Shutdown complete');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 NexusTradeAI Automation Server running on port ${PORT}`);
  console.log(`🚀 Automation API: http://localhost:${PORT}`);
  console.log(`📊 Health Check: http://localhost:${PORT}/health`);
  console.log(`\n🎯 FCT-Style Automation Ready!`);
  console.log(`   • 24/7 Market Monitoring: ✅`);
  console.log(`   • Automated Positioning: ✅`);
  console.log(`   • Risk Management: ✅`);
  console.log(`   • Zero Manual Input: ✅`);
  
  // Auto-initialize engine
  initializeEngine();
});

module.exports = app;
