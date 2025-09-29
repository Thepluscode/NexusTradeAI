// src/compliance/tradingHaltChecker.js
const EventEmitter = require('events');

class TradingHaltChecker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.haltedSymbols = new Set();
    this.haltReasons = new Map();
    this.isInitialized = false;
    
    // Trading halt types
    this.haltTypes = {
      REGULATORY: 'regulatory_halt',
      VOLATILITY: 'volatility_halt', 
      NEWS_PENDING: 'news_pending',
      TECHNICAL: 'technical_halt',
      MARKET_WIDE: 'market_wide_halt',
      UNUSUAL_ACTIVITY: 'unusual_activity',
      CIRCUIT_BREAKER: 'circuit_breaker'
    };
    
    // Circuit breaker thresholds (from NYSE/NASDAQ rules)
    this.circuitBreakerThresholds = {
      level1: 0.07,  // 7% decline
      level2: 0.13,  // 13% decline  
      level3: 0.20   // 20% decline
    };
    
    // Volatility halt parameters
    this.volatilityHaltConfig = {
      priceChangeThreshold: 0.10, // 10% price change
      timeWindow: 300000,         // 5 minutes
      volumeThreshold: 5.0,       // 5x normal volume
      spreadThreshold: 0.05       // 5% spread
    };
    
    // Market hours for halt rules
    this.marketHours = {
      open: '09:30',
      close: '16:00',
      timezone: 'America/New_York'
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing TradingHaltChecker...');
      
      // Load existing halts from external sources
      await this.loadCurrentHalts();
      
      // Start monitoring for halt conditions
      this.startMonitoring();
      
      this.isInitialized = true;
      this.logger?.info('TradingHaltChecker initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize TradingHaltChecker:', error);
      throw error;
    }
  }

  async loadCurrentHalts() {
    // In production, this would fetch from regulatory feeds (NASDAQ, NYSE, etc.)
    // For demo, initialize with no halts
    this.logger?.info('Loaded current trading halts from regulatory sources');
  }

  startMonitoring() {
    // Monitor for halt conditions every 30 seconds
    setInterval(() => {
      this.checkForHaltConditions();
    }, 30000);
    
    // Check circuit breakers more frequently during market hours
    setInterval(() => {
      if (this.isMarketHours()) {
        this.checkCircuitBreakers();
      }
    }, 5000);
  }

  async checkOrder(order) {
    try {
      const symbol = order.symbol;
      
      // Check if symbol is currently halted
      if (this.haltedSymbols.has(symbol)) {
        const haltReason = this.haltReasons.get(symbol);
        
        return {
          allowed: false,
          reason: `Trading halted for ${symbol}: ${haltReason.description}`,
          haltType: haltReason.type,
          haltTime: haltReason.timestamp,
          estimatedResumption: haltReason.estimatedResumption
        };
      }
      
      // Check for potential halt conditions
      const haltRisk = await this.assessHaltRisk(order);
      
      if (haltRisk.risk === 'HIGH') {
        this.logger?.warn(`High halt risk detected for ${symbol}`, haltRisk);
        
        return {
          allowed: true, // Allow but warn
          warning: `High trading halt risk for ${symbol}`,
          riskFactors: haltRisk.factors,
          recommendation: 'Consider smaller order size or delayed execution'
        };
      }
      
      return {
        allowed: true,
        haltRisk: haltRisk.risk
      };
      
    } catch (error) {
      this.logger?.error('Error checking trading halt status:', error);
      return {
        allowed: false,
        reason: 'Unable to verify halt status',
        error: error.message
      };
    }
  }

  async assessHaltRisk(order) {
    const symbol = order.symbol;
    const riskFactors = [];
    let riskScore = 0;
    
    try {
      // Get recent market data
      const marketData = await this.getMarketData(symbol);
      
      // Check price volatility
      const priceVolatility = this.checkPriceVolatility(marketData);
      if (priceVolatility.excessive) {
        riskFactors.push(`Excessive price volatility: ${priceVolatility.change}%`);
        riskScore += 30;
      }
      
      // Check volume surge
      const volumeSurge = this.checkVolumeSurge(marketData);
      if (volumeSurge.excessive) {
        riskFactors.push(`Volume surge: ${volumeSurge.multiplier}x normal`);
        riskScore += 20;
      }
      
      // Check spread widening
      const spreadWide = this.checkSpreadWidening(marketData);
      if (spreadWide.excessive) {
        riskFactors.push(`Wide spread: ${spreadWide.spread}%`);
        riskScore += 15;
      }
      
      // Check for news/events
      const newsRisk = await this.checkNewsRisk(symbol);
      if (newsRisk.high) {
        riskFactors.push('Significant news/events pending');
        riskScore += 25;
      }
      
      // Check trading pattern anomalies
      const patternAnomaly = this.checkTradingPatterns(marketData);
      if (patternAnomaly.detected) {
        riskFactors.push('Unusual trading patterns detected');
        riskScore += 20;
      }
      
      // Determine risk level
      let risk = 'LOW';
      if (riskScore >= 70) {
        risk = 'HIGH';
      } else if (riskScore >= 40) {
        risk = 'MEDIUM';
      }
      
      return {
        risk,
        score: riskScore,
        factors: riskFactors,
        recommendation: this.getRiskRecommendation(risk, riskScore)
      };
      
    } catch (error) {
      this.logger?.error(`Error assessing halt risk for ${symbol}:`, error);
      return {
        risk: 'UNKNOWN',
        score: 0,
        factors: ['Unable to assess risk'],
        error: error.message
      };
    }
  }

  checkPriceVolatility(marketData) {
    const priceChange = Math.abs(marketData.priceChangePercent || 0);
    const threshold = this.volatilityHaltConfig.priceChangeThreshold * 100;
    
    return {
      excessive: priceChange > threshold,
      change: priceChange.toFixed(2),
      threshold
    };
  }

  checkVolumeSurge(marketData) {
    const currentVolume = marketData.volume || 0;
    const normalVolume = marketData.averageVolume || currentVolume;
    const multiplier = normalVolume > 0 ? currentVolume / normalVolume : 1;
    
    return {
      excessive: multiplier > this.volatilityHaltConfig.volumeThreshold,
      multiplier: multiplier.toFixed(1),
      threshold: this.volatilityHaltConfig.volumeThreshold
    };
  }

  checkSpreadWidening(marketData) {
    const bid = marketData.bid || 0;
    const ask = marketData.ask || 0;
    const midPrice = (bid + ask) / 2;
    const spread = midPrice > 0 ? ((ask - bid) / midPrice) : 0;
    
    return {
      excessive: spread > this.volatilityHaltConfig.spreadThreshold,
      spread: (spread * 100).toFixed(2),
      threshold: this.volatilityHaltConfig.spreadThreshold * 100
    };
  }

  async checkNewsRisk(symbol) {
    // In production, this would check news feeds for pending announcements
    // For demo, return low risk
    return {
      high: false,
      pending: [],
      lastCheck: new Date()
    };
  }

  checkTradingPatterns(marketData) {
    // Simplified pattern detection
    const factors = [];
    let anomalyScore = 0;
    
    // Check for unusual time gaps between trades
    if (marketData.lastTradeGap > 300000) { // 5 minutes
      factors.push('Long gap between trades');
      anomalyScore += 10;
    }
    
    // Check for order book imbalance
    const imbalance = Math.abs((marketData.bidSize - marketData.askSize) / 
                              (marketData.bidSize + marketData.askSize));
    if (imbalance > 0.8) {
      factors.push('Severe order book imbalance');
      anomalyScore += 15;
    }
    
    return {
      detected: anomalyScore > 15,
      score: anomalyScore,
      factors
    };
  }

  getRiskRecommendation(risk, score) {
    switch (risk) {
      case 'HIGH':
        return 'Consider delaying order execution or reducing size significantly';
      case 'MEDIUM':
        return 'Monitor closely and consider smaller order size';
      case 'LOW':
        return 'Normal execution recommended';
      default:
        return 'Unable to provide recommendation';
    }
  }

  async checkForHaltConditions() {
    try {
      // This would check external feeds for new halts
      // For demo, we'll simulate checking
      this.logger?.debug('Checking for new trading halt conditions');
      
    } catch (error) {
      this.logger?.error('Error checking halt conditions:', error);
    }
  }

  async checkCircuitBreakers() {
    try {
      // Check market-wide circuit breakers
      const marketLevel = await this.getMarketLevel();
      
      if (marketLevel.decline >= this.circuitBreakerThresholds.level3) {
        await this.triggerMarketWideHalt('CIRCUIT_BREAKER_LEVEL3', marketLevel);
      } else if (marketLevel.decline >= this.circuitBreakerThresholds.level2) {
        await this.triggerMarketWideHalt('CIRCUIT_BREAKER_LEVEL2', marketLevel);
      } else if (marketLevel.decline >= this.circuitBreakerThresholds.level1) {
        await this.triggerMarketWideHalt('CIRCUIT_BREAKER_LEVEL1', marketLevel);
      }
      
    } catch (error) {
      this.logger?.error('Error checking circuit breakers:', error);
    }
  }

  async triggerMarketWideHalt(level, marketData) {
    const haltInfo = {
      type: this.haltTypes.CIRCUIT_BREAKER,
      level,
      reason: `Market-wide circuit breaker triggered at ${level}`,
      marketDecline: marketData.decline,
      timestamp: new Date(),
      estimatedResumption: this.calculateResumptionTime(level)
    };
    
    // Halt all symbols
    const allSymbols = await this.getAllTradingSymbols();
    
    for (const symbol of allSymbols) {
      await this.haltSymbol(symbol, haltInfo);
    }
    
    this.emit('market_wide_halt', {
      level,
      haltedSymbols: allSymbols.length,
      marketData,
      timestamp: new Date()
    });
    
    this.logger?.error(`Market-wide trading halt triggered: ${level}`, haltInfo);
  }

  async haltSymbol(symbol, haltInfo) {
    this.haltedSymbols.add(symbol);
    this.haltReasons.set(symbol, {
      ...haltInfo,
      symbol,
      haltedAt: new Date()
    });
    
    this.emit('symbol_halted', {
      symbol,
      reason: haltInfo.reason,
      type: haltInfo.type,
      timestamp: new Date()
    });
    
    this.logger?.warn(`Trading halted for ${symbol}`, haltInfo);
  }

  async resumeSymbol(symbol, reason = 'Conditions normalized') {
    if (this.haltedSymbols.has(symbol)) {
      this.haltedSymbols.delete(symbol);
      const haltInfo = this.haltReasons.get(symbol);
      this.haltReasons.delete(symbol);
      
      this.emit('symbol_resumed', {
        symbol,
        reason,
        haltDuration: Date.now() - haltInfo.haltedAt.getTime(),
        timestamp: new Date()
      });
      
      this.logger?.info(`Trading resumed for ${symbol}: ${reason}`);
    }
  }

  calculateResumptionTime(level) {
    const now = new Date();
    
    switch (level) {
      case 'CIRCUIT_BREAKER_LEVEL1':
        return new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
      case 'CIRCUIT_BREAKER_LEVEL2':
        return new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
      case 'CIRCUIT_BREAKER_LEVEL3':
        // Level 3 halts trading for the rest of the day
        const endOfDay = new Date(now);
        endOfDay.setHours(16, 0, 0, 0); // 4 PM ET
        return endOfDay;
      default:
        return new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes default
    }
  }

  isMarketHours() {
    const now = new Date();
    const timeString = now.toTimeString().substring(0, 5); // HH:MM format
    
    return timeString >= this.marketHours.open && timeString <= this.marketHours.close;
  }

  async getMarketLevel() {
    // Simplified market level calculation
    // In production, would use S&P 500 or other market indices
    return {
      decline: 0.02, // 2% decline
      timestamp: new Date()
    };
  }

  async getAllTradingSymbols() {
    // Return list of all tradable symbols
    // In production, would fetch from symbol master
    return ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'BTCUSDT', 'ETHUSDT'];
  }

  async getMarketData(symbol) {
    // Simplified market data - in production would fetch real data
    return {
      symbol,
      lastPrice: 100 + Math.random() * 20,
      priceChangePercent: (Math.random() - 0.5) * 10,
      volume: 1000000 + Math.random() * 500000,
      averageVolume: 1000000,
      bid: 99.5,
      ask: 100.5,
      bidSize: 1000,
      askSize: 1200,
      lastTradeGap: Math.random() * 600000, // Up to 10 minutes
      timestamp: new Date()
    };
  }

  getHaltedSymbols() {
    return Array.from(this.haltedSymbols).map(symbol => ({
      symbol,
      haltInfo: this.haltReasons.get(symbol)
    }));
  }

  isSymbolHalted(symbol) {
    return this.haltedSymbols.has(symbol);
  }

  getHaltInfo(symbol) {
    return this.haltReasons.get(symbol) || null;
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      haltedSymbols: this.haltedSymbols.size,
      marketHours: this.isMarketHours(),
      circuitBreakerThresholds: this.circuitBreakerThresholds,
      volatilityHaltConfig: this.volatilityHaltConfig
    };
  }
}

module.exports = TradingHaltChecker;