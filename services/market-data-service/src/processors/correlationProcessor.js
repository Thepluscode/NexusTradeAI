const EventEmitter = require('events');

class CorrelationProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.priceData = new Map();
    this.correlationMatrix = new Map();
    this.correlationHistory = new Map();
    this.maxDataPoints = 100;
    this.minDataPoints = 20;
    this.isRunning = false;
    this.updateInterval = 30000; // 30 seconds
    this.correlationThreshold = 0.7; // High correlation threshold
  }

  async start() {
    this.isRunning = true;
    
    // Start periodic correlation updates
    this.updateTimer = setInterval(() => {
      this.updateAllCorrelations();
    }, this.updateInterval);
    
    this.logger?.info('CorrelationProcessor started');
  }

  async stop() {
    this.isRunning = false;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    this.logger?.info('CorrelationProcessor stopped');
  }

  async process(data) {
    if (!this.isRunning) {
      return data;
    }

    try {
      const processedData = { ...data };
      
      // Store price data for correlation analysis
      if (data.price || data.close) {
        const price = data.price || data.close;
        const key = `${data.exchange}-${data.symbol}`;
        
        this.storePriceData(key, price, data.timestamp || Date.now());
        
        // Add correlation data if available
        const correlations = this.getCorrelations(key);
        if (correlations && correlations.length > 0) {
          processedData.correlations = correlations;
        }
      }
      
      return processedData;
      
    } catch (error) {
      this.logger?.error('Error processing correlation data:', error);
      return data;
    }
  }

  storePriceData(key, price, timestamp) {
    if (!this.priceData.has(key)) {
      this.priceData.set(key, []);
    }
    
    const data = this.priceData.get(key);
    data.push({ price, timestamp });
    
    // Keep only recent data
    if (data.length > this.maxDataPoints) {
      data.splice(0, data.length - this.maxDataPoints);
    }
  }

  updateAllCorrelations() {
    try {
      const symbols = Array.from(this.priceData.keys());
      
      if (symbols.length < 2) {
        return;
      }
      
      // Calculate correlations for all symbol pairs
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const symbol1 = symbols[i];
          const symbol2 = symbols[j];
          
          const correlation = this.calculateCorrelation(symbol1, symbol2);
          
          if (correlation !== null) {
            this.storeCorrelation(symbol1, symbol2, correlation);
          }
        }
      }
      
      // Detect correlation changes
      this.detectCorrelationChanges();
      
    } catch (error) {
      this.logger?.error('Error updating correlations:', error);
    }
  }

  calculateCorrelation(symbol1, symbol2) {
    const data1 = this.priceData.get(symbol1);
    const data2 = this.priceData.get(symbol2);
    
    if (!data1 || !data2 || data1.length < this.minDataPoints || data2.length < this.minDataPoints) {
      return null;
    }
    
    // Align data by timestamp (get overlapping periods)
    const aligned = this.alignPriceData(data1, data2);
    
    if (aligned.length < this.minDataPoints) {
      return null;
    }
    
    // Calculate returns
    const returns1 = this.calculateReturns(aligned.map(d => d.price1));
    const returns2 = this.calculateReturns(aligned.map(d => d.price2));
    
    if (returns1.length !== returns2.length || returns1.length < this.minDataPoints - 1) {
      return null;
    }
    
    // Calculate Pearson correlation coefficient
    const correlation = this.pearsonCorrelation(returns1, returns2);
    
    return {
      coefficient: parseFloat(correlation.toFixed(4)),
      dataPoints: returns1.length,
      timestamp: Date.now()
    };
  }

  alignPriceData(data1, data2) {
    const aligned = [];
    const tolerance = 60000; // 1 minute tolerance
    
    let i = 0, j = 0;
    
    while (i < data1.length && j < data2.length) {
      const timeDiff = Math.abs(data1[i].timestamp - data2[j].timestamp);
      
      if (timeDiff <= tolerance) {
        aligned.push({
          timestamp: Math.min(data1[i].timestamp, data2[j].timestamp),
          price1: data1[i].price,
          price2: data2[j].price
        });
        i++;
        j++;
      } else if (data1[i].timestamp < data2[j].timestamp) {
        i++;
      } else {
        j++;
      }
    }
    
    return aligned;
  }

  calculateReturns(prices) {
    const returns = [];
    
    for (let i = 1; i < prices.length; i++) {
      const return_ = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(return_);
    }
    
    return returns;
  }

  pearsonCorrelation(x, y) {
    if (x.length !== y.length || x.length === 0) {
      return 0;
    }
    
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) {
      return 0;
    }
    
    return numerator / denominator;
  }

  storeCorrelation(symbol1, symbol2, correlation) {
    const pairKey = this.getCorrelationKey(symbol1, symbol2);
    
    if (!this.correlationMatrix.has(pairKey)) {
      this.correlationMatrix.set(pairKey, []);
    }
    
    const history = this.correlationMatrix.get(pairKey);
    history.push(correlation);
    
    // Keep only recent correlations
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    // Store current correlation
    if (!this.correlationHistory.has(symbol1)) {
      this.correlationHistory.set(symbol1, new Map());
    }
    
    this.correlationHistory.get(symbol1).set(symbol2, correlation);
    
    // Store reverse mapping
    if (!this.correlationHistory.has(symbol2)) {
      this.correlationHistory.set(symbol2, new Map());
    }
    
    this.correlationHistory.get(symbol2).set(symbol1, correlation);
  }

  getCorrelationKey(symbol1, symbol2) {
    return symbol1 < symbol2 ? `${symbol1}-${symbol2}` : `${symbol2}-${symbol1}`;
  }

  detectCorrelationChanges() {
    try {
      for (const [pairKey, history] of this.correlationMatrix) {
        if (history.length < 2) continue;
        
        const current = history[history.length - 1];
        const previous = history[history.length - 2];
        
        const change = Math.abs(current.coefficient - previous.coefficient);
        
        if (change > 0.3) { // Significant correlation change
          const [symbol1, symbol2] = pairKey.split('-');
          
          this.emit('correlation-change', {
            symbol1,
            symbol2,
            previousCorrelation: previous.coefficient,
            currentCorrelation: current.coefficient,
            change,
            timestamp: current.timestamp
          });
        }
      }
    } catch (error) {
      this.logger?.error('Error detecting correlation changes:', error);
    }
  }

  getCorrelations(symbol) {
    const correlations = this.correlationHistory.get(symbol);
    
    if (!correlations) {
      return [];
    }
    
    return Array.from(correlations.entries())
      .map(([otherSymbol, correlation]) => ({
        symbol: otherSymbol,
        correlation: correlation.coefficient,
        strength: this.getCorrelationStrength(correlation.coefficient),
        dataPoints: correlation.dataPoints,
        timestamp: correlation.timestamp
      }))
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  getCorrelationStrength(coefficient) {
    const abs = Math.abs(coefficient);
    
    if (abs >= 0.8) return 'very_strong';
    if (abs >= 0.6) return 'strong';
    if (abs >= 0.4) return 'moderate';
    if (abs >= 0.2) return 'weak';
    return 'very_weak';
  }

  getCorrelationMatrix(symbols = null) {
    const matrix = {};
    
    if (symbols) {
      // Return matrix for specified symbols only
      symbols.forEach(symbol1 => {
        matrix[symbol1] = {};
        symbols.forEach(symbol2 => {
          if (symbol1 === symbol2) {
            matrix[symbol1][symbol2] = 1.0;
          } else {
            const correlations = this.correlationHistory.get(symbol1);
            const correlation = correlations?.get(symbol2);
            matrix[symbol1][symbol2] = correlation ? correlation.coefficient : null;
          }
        });
      });
    } else {
      // Return full matrix
      for (const [symbol1, correlations] of this.correlationHistory) {
        matrix[symbol1] = {};
        for (const [symbol2, correlation] of correlations) {
          matrix[symbol1][symbol2] = correlation.coefficient;
        }
      }
    }
    
    return matrix;
  }

  getHighlyCorrelatedPairs(threshold = null) {
    const correlationThreshold = threshold !== null ? threshold : this.correlationThreshold;
    const pairs = [];
    
    for (const [pairKey, history] of this.correlationMatrix) {
      if (history.length === 0) continue;
      
      const latest = history[history.length - 1];
      const absCorrelation = Math.abs(latest.coefficient);
      
      if (absCorrelation >= correlationThreshold) {
        const [symbol1, symbol2] = pairKey.split('-');
        pairs.push({
          symbol1,
          symbol2,
          correlation: latest.coefficient,
          strength: this.getCorrelationStrength(latest.coefficient),
          dataPoints: latest.dataPoints,
          timestamp: latest.timestamp
        });
      }
    }
    
    return pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  getCorrelationTrend(symbol1, symbol2, periods = 10) {
    const pairKey = this.getCorrelationKey(symbol1, symbol2);
    const history = this.correlationMatrix.get(pairKey);
    
    if (!history || history.length < periods) {
      return null;
    }
    
    const recentHistory = history.slice(-periods);
    const trend = this.calculateTrend(recentHistory.map(h => h.coefficient));
    
    return {
      trend,
      currentCorrelation: recentHistory[recentHistory.length - 1].coefficient,
      averageCorrelation: recentHistory.reduce((sum, h) => sum + h.coefficient, 0) / recentHistory.length,
      volatility: this.calculateVolatility(recentHistory.map(h => h.coefficient)),
      periods
    };
  }

  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const first = values.slice(0, Math.floor(values.length / 2));
    const second = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = first.reduce((sum, val) => sum + val, 0) / first.length;
    const secondAvg = second.reduce((sum, val) => sum + val, 0) / second.length;
    
    const change = secondAvg - firstAvg;
    
    if (Math.abs(change) < 0.05) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
  }

  calculateVolatility(values) {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;
    
    return Math.sqrt(variance);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      symbolsTracked: this.priceData.size,
      correlationPairs: this.correlationMatrix.size,
      updateInterval: this.updateInterval
    };
  }

  clearHistory(symbol) {
    this.priceData.delete(symbol);
    this.correlationHistory.delete(symbol);
    
    // Remove from correlation matrix
    const keysToRemove = [];
    for (const [key, _] of this.correlationMatrix) {
      if (key.includes(symbol)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      this.correlationMatrix.delete(key);
    });
  }
}

module.exports = CorrelationProcessor;