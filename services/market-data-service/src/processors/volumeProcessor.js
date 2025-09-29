const EventEmitter = require('events');

class VolumeProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.volumeHistory = new Map();
    this.volumeWeightedPrices = new Map();
    this.volumeProfiles = new Map();
    this.maxHistorySize = 1000;
    this.isRunning = false;
    this.volumeSpikeThreshold = 3; // 3x average volume
  }

  async start() {
    this.isRunning = true;
    this.logger?.info('VolumeProcessor started');
  }

  async stop() {
    this.isRunning = false;
    this.logger?.info('VolumeProcessor stopped');
  }

  async process(data) {
    if (!this.isRunning) {
      return data;
    }

    try {
      const processedData = { ...data };
      
      // Process volume data
      if (data.volume && data.volume > 0) {
        const key = `${data.exchange}-${data.symbol}`;
        
        // Calculate volume analytics
        const volumeAnalytics = this.calculateVolumeAnalytics(key, data.volume, data.price || data.close);
        processedData.volumeAnalytics = volumeAnalytics;
        
        // Detect volume anomalies
        const volumeAnomaly = this.detectVolumeAnomaly(key, data.volume);
        if (volumeAnomaly) {
          processedData.volumeAnomaly = volumeAnomaly;
          this.emit('volume-anomaly', { data: processedData, anomaly: volumeAnomaly });
        }
        
        // Update volume profile
        this.updateVolumeProfile(key, data.price || data.close, data.volume);
        
        // Update volume history
        this.updateVolumeHistory(key, data.volume, data.timestamp || Date.now());
      }
      
      // Process order book volume if available
      if (data.dataType === 'orderbook' && data.bids && data.asks) {
        processedData.orderBookVolume = this.calculateOrderBookVolume(data);
      }
      
      return processedData;
      
    } catch (error) {
      this.logger?.error('Error processing volume data:', error);
      return data;
    }
  }

  calculateVolumeAnalytics(key, currentVolume, price) {
    const history = this.volumeHistory.get(key) || [];
    
    if (history.length === 0) {
      return {
        averageVolume: currentVolume,
        volumeRatio: 1,
        volumeTrend: 'neutral',
        cumulativeVolume: currentVolume
      };
    }
    
    // Calculate average volume (last 20 periods)
    const recentVolumes = history.slice(-20).map(h => h.volume);
    const averageVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    
    // Volume ratio (current vs average)
    const volumeRatio = currentVolume / averageVolume;
    
    // Volume trend
    const volumeTrend = this.calculateVolumeTrend(recentVolumes);
    
    // Cumulative volume for the day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayVolumes = history.filter(h => h.timestamp >= todayStart.getTime());
    const cumulativeVolume = todayVolumes.reduce((sum, h) => sum + h.volume, 0) + currentVolume;
    
    // Volume-weighted average price (VWAP)
    const vwap = this.calculateVWAP(key, price, currentVolume);
    
    return {
      averageVolume: parseFloat(averageVolume.toFixed(2)),
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      volumeTrend,
      cumulativeVolume: parseFloat(cumulativeVolume.toFixed(2)),
      vwap: parseFloat(vwap.toFixed(6))
    };
  }

  calculateVolumeTrend(volumes) {
    if (volumes.length < 3) return 'neutral';
    
    const recent = volumes.slice(-3);
    const increasing = recent[2] > recent[1] && recent[1] > recent[0];
    const decreasing = recent[2] < recent[1] && recent[1] < recent[0];
    
    if (increasing) return 'increasing';
    if (decreasing) return 'decreasing';
    return 'neutral';
  }

  calculateVWAP(key, price, volume) {
    if (!this.volumeWeightedPrices.has(key)) {
      this.volumeWeightedPrices.set(key, {
        totalValue: 0,
        totalVolume: 0,
        trades: []
      });
    }
    
    const vwapData = this.volumeWeightedPrices.get(key);
    vwapData.totalValue += price * volume;
    vwapData.totalVolume += volume;
    vwapData.trades.push({ price, volume, timestamp: Date.now() });
    
    // Keep only today's trades
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    vwapData.trades = vwapData.trades.filter(trade => trade.timestamp >= todayStart.getTime());
    
    // Recalculate totals from today's trades
    vwapData.totalValue = vwapData.trades.reduce((sum, trade) => sum + (trade.price * trade.volume), 0);
    vwapData.totalVolume = vwapData.trades.reduce((sum, trade) => sum + trade.volume, 0);
    
    return vwapData.totalVolume > 0 ? vwapData.totalValue / vwapData.totalVolume : price;
  }

  detectVolumeAnomaly(key, currentVolume) {
    const history = this.volumeHistory.get(key) || [];
    
    if (history.length < 10) {
      return null;
    }
    
    const recentVolumes = history.slice(-10).map(h => h.volume);
    const averageVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    const volumeRatio = currentVolume / averageVolume;
    
    if (volumeRatio > this.volumeSpikeThreshold) {
      return {
        type: 'volume_spike',
        severity: volumeRatio > 5 ? 'high' : 'medium',
        ratio: volumeRatio,
        currentVolume,
        averageVolume,
        timestamp: Date.now()
      };
    }
    
    // Detect unusually low volume
    if (volumeRatio < 0.1) {
      return {
        type: 'volume_drought',
        severity: 'low',
        ratio: volumeRatio,
        currentVolume,
        averageVolume,
        timestamp: Date.now()
      };
    }
    
    return null;
  }

  updateVolumeProfile(key, price, volume) {
    if (!this.volumeProfiles.has(key)) {
      this.volumeProfiles.set(key, new Map());
    }
    
    const profile = this.volumeProfiles.get(key);
    const priceLevel = this.getPriceLevel(price);
    
    const currentVolume = profile.get(priceLevel) || 0;
    profile.set(priceLevel, currentVolume + volume);
    
    // Keep only recent price levels (last 1000 levels)
    if (profile.size > 1000) {
      const entries = Array.from(profile.entries()).sort((a, b) => b[1] - a[1]);
      profile.clear();
      entries.slice(0, 1000).forEach(([level, vol]) => {
        profile.set(level, vol);
      });
    }
  }

  getPriceLevel(price, precision = 2) {
    return Math.round(price * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  updateVolumeHistory(key, volume, timestamp) {
    if (!this.volumeHistory.has(key)) {
      this.volumeHistory.set(key, []);
    }
    
    const history = this.volumeHistory.get(key);
    history.push({ volume, timestamp });
    
    // Keep only recent history
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  calculateOrderBookVolume(data) {
    const { bids, asks } = data;
    
    if (!bids || !asks || bids.length === 0 || asks.length === 0) {
      return null;
    }
    
    // Calculate total bid and ask volumes
    const totalBidVolume = bids.reduce((sum, bid) => sum + bid[1], 0);
    const totalAskVolume = asks.reduce((sum, ask) => sum + ask[1], 0);
    
    // Calculate volume at different price levels
    const levels = [0.1, 0.5, 1.0, 2.0, 5.0]; // percentage from best price
    const bestBid = Math.max(...bids.map(bid => bid[0]));
    const bestAsk = Math.min(...asks.map(ask => ask[0]));
    
    const bidLevels = {};
    const askLevels = {};
    
    for (const level of levels) {
      const bidThreshold = bestBid * (1 - level / 100);
      const askThreshold = bestAsk * (1 + level / 100);
      
      bidLevels[`${level}%`] = bids
        .filter(bid => bid[0] >= bidThreshold)
        .reduce((sum, bid) => sum + bid[1], 0);
      
      askLevels[`${level}%`] = asks
        .filter(ask => ask[0] <= askThreshold)
        .reduce((sum, ask) => sum + ask[1], 0);
    }
    
    return {
      totalBidVolume: parseFloat(totalBidVolume.toFixed(4)),
      totalAskVolume: parseFloat(totalAskVolume.toFixed(4)),
      bidAskVolumeRatio: parseFloat((totalBidVolume / totalAskVolume).toFixed(4)),
      bidLevels,
      askLevels
    };
  }

  getVolumeProfile(symbol, exchange, limit = 20) {
    const key = `${exchange}-${symbol}`;
    const profile = this.volumeProfiles.get(key);
    
    if (!profile) {
      return null;
    }
    
    // Convert to array and sort by volume
    const profileArray = Array.from(profile.entries())
      .map(([price, volume]) => ({ price, volume }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit);
    
    return profileArray;
  }

  getVolumeHistory(symbol, exchange, limit = 100) {
    const key = `${exchange}-${symbol}`;
    const history = this.volumeHistory.get(key) || [];
    return history.slice(-limit);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      volumeHistorySize: this.volumeHistory.size,
      volumeProfilesSize: this.volumeProfiles.size,
      vwapDataSize: this.volumeWeightedPrices.size
    };
  }

  clearHistory(symbol, exchange) {
    const key = `${exchange}-${symbol}`;
    this.volumeHistory.delete(key);
    this.volumeProfiles.delete(key);
    this.volumeWeightedPrices.delete(key);
  }
}

module.exports = VolumeProcessor;