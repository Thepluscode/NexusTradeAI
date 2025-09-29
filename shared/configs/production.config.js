/**
 * Nexus Trade AI - Production Configuration
 * 
 * This file contains all production-ready configurations for the
 * NexusTradeSystemOrchestrator and related services.
 */

module.exports = {
  // Environment
  environment: 'production',
  
  // System Performance Configuration
  performance: {
    // Latency targets (microseconds)
    targetLatency: 100,
    maxLatency: 1000,
    criticalLatencyThreshold: 5000,
    
    // Throughput targets
    targetThroughput: 100000, // orders per second
    maxOrdersPerSecond: 150000,
    
    // Memory and CPU limits
    maxMemoryUsage: 0.8, // 80% of available memory
    maxCpuUsage: 0.9, // 90% of available CPU
  },
  
  // Risk Management Configuration
  risk: {
    // Daily limits
    maxDailyVolume: 100_000_000, // $100M
    maxDailyLoss: -500_000, // $500k
    emergencyShutdownLoss: -1_000_000, // $1M
    
    // Position limits
    maxPositions: 100,
    maxPositionPerSymbol: 100_000,
    maxDrawdown: -0.15, // 15%
    
    // Risk monitoring
    maxRiskBreaches: 10,
    riskCheckInterval: 1000, // 1 second
    
    // Margin requirements
    initialMarginRequirement: 0.5, // 50%
    maintenanceMarginRequirement: 0.25, // 25%
  },
  
  // Trading Configuration
  trading: {
    // Market hours (UTC)
    marketOpen: '14:30', // 9:30 AM EST
    marketClose: '21:00', // 4:00 PM EST
    
    // Order types
    supportedOrderTypes: ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'],
    
    // Execution settings
    defaultSlippage: 0.001, // 0.1%
    maxSlippage: 0.005, // 0.5%
    
    // Algorithm settings
    algorithms: {
      twap: {
        defaultSliceInterval: 60, // seconds
        minSliceSize: 100,
        maxSliceSize: 10000
      },
      vwap: {
        adaptiveSlicing: true,
        volumeParticipationRate: 0.1, // 10%
        maxParticipationRate: 0.3 // 30%
      },
      implementationShortfall: {
        baseParticipationRate: 0.15, // 15%
        urgencyMultiplier: 1.5
      }
    }
  },
  
  // Market Data Configuration
  marketData: {
    // Data sources
    primaryFeed: 'websocket',
    backupFeeds: ['fix', 'rest'],
    
    // Connection settings
    maxReconnectAttempts: 5,
    reconnectDelay: 1000, // milliseconds
    heartbeatInterval: 30000, // 30 seconds
    
    // Data quality
    maxLatency: 100, // milliseconds
    requiredUptime: 0.999, // 99.9%
    
    // Symbols
    defaultSymbols: [
      'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA',
      'AMZN', 'META', 'NFLX', 'AMD', 'INTC',
      'SPY', 'QQQ', 'IWM', 'GLD', 'TLT'
    ]
  },
  
  // Monitoring Configuration
  monitoring: {
    // Health check intervals
    systemHealthCheckInterval: 30000, // 30 seconds
    componentHealthCheckInterval: 10000, // 10 seconds
    
    // Performance logging
    performanceLogInterval: 60000, // 1 minute
    metricsRetentionPeriod: 86400000, // 24 hours
    
    // Alerting
    alertThresholds: {
      highLatency: 1000, // microseconds
      lowThroughput: 50000, // orders/sec
      highMemoryUsage: 0.85, // 85%
      highCpuUsage: 0.9, // 90%
      lowSystemHealth: 0.8 // 80%
    },
    
    // Alert channels
    alertChannels: ['console', 'email', 'slack'],
    
    // Emergency procedures
    emergencyContacts: [
      'admin@nexustradeai.com',
      'risk@nexustradeai.com'
    ]
  },
  
  // Database Configuration
  database: {
    // MongoDB settings
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nexustradeai',
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }
    },
    
    // Redis settings
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: 0
    },
    
    // Time series database for market data
    timeseries: {
      retentionPeriod: '30d',
      compressionLevel: 'high'
    }
  },
  
  // API Configuration
  api: {
    // Server settings
    port: process.env.PORT || 8080,
    host: process.env.HOST || '0.0.0.0',
    
    // Security
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    },
    
    // Rate limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000 // requests per window
    },
    
    // Authentication
    jwt: {
      secret: process.env.JWT_SECRET || 'your-secret-key',
      expiresIn: '24h'
    }
  },
  
  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    
    // File logging
    file: {
      enabled: true,
      filename: 'logs/nexustradeai.log',
      maxSize: '100MB',
      maxFiles: 10
    },
    
    // Console logging
    console: {
      enabled: true,
      colorize: true
    }
  },
  
  // Strategy Configuration
  strategies: {
    // Default strategy parameters
    defaults: {
      maxPositionSize: 10000,
      stopLoss: -0.02, // 2%
      takeProfit: 0.04, // 4%
      maxHoldingPeriod: 86400000 // 24 hours
    },
    
    // Strategy-specific settings
    meanReversion: {
      lookbackPeriod: 20,
      zScoreThreshold: 2.0,
      meanReversionSpeed: 0.1
    },
    
    momentum: {
      momentumPeriod: 10,
      threshold: 0.02,
      momentumDecay: 0.95
    },
    
    arbitrage: {
      minProfitBps: 5,
      maxHoldingTime: 300000, // 5 minutes
      exchanges: ['NYSE', 'NASDAQ', 'ARCA']
    }
  },
  
  // Feature Flags
  features: {
    enablePaperTrading: process.env.ENABLE_PAPER_TRADING === 'true',
    enableLiveTrading: process.env.ENABLE_LIVE_TRADING === 'true',
    enableMLInference: process.env.ENABLE_ML_INFERENCE === 'true',
    enableAdvancedRisk: true,
    enableGPUOptimization: process.env.ENABLE_GPU === 'true'
  }
};
