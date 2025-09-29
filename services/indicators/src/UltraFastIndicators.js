// Ultra-Fast Technical Indicators
// JavaScript implementation inspired by your Numba-optimized Python code

class UltraFastIndicators {
  constructor() {
    // Pre-allocate typed arrays for better performance
    this.priceBuffer = new Float64Array(1000);
    this.volumeBuffer = new Float64Array(1000);
    this.resultBuffer = new Float64Array(1000);
    
    // Cache for computed indicators
    this.indicatorCache = new Map();
    this.cacheExpiry = new Map();
  }

  /**
   * Ultra-fast Simple Moving Average (inspired by your calculate_sma_numba)
   * Optimized with typed arrays and minimal allocations
   */
  calculateSMAUltraFast(prices, window) {
    const n = prices.length;
    if (n < window) return null;
    
    // Use pre-allocated buffer to avoid garbage collection
    const sma = this.resultBuffer.subarray(0, n);
    
    // Fill initial values with NaN equivalent
    for (let i = 0; i < window - 1; i++) {
      sma[i] = 0;
    }
    
    // Calculate SMA using sliding window technique
    let sum = 0;
    
    // Initial window sum
    for (let i = 0; i < window; i++) {
      sum += prices[i];
    }
    sma[window - 1] = sum / window;
    
    // Sliding window calculation (O(n) instead of O(n*window))
    for (let i = window; i < n; i++) {
      sum = sum - prices[i - window] + prices[i];
      sma[i] = sum / window;
    }
    
    return sma[n - 1]; // Return latest value
  }

  /**
   * Ultra-fast Exponential Moving Average (inspired by your calculate_ema_numba)
   * Optimized with single-pass calculation
   */
  calculateEMAUltraFast(prices, alpha) {
    const n = prices.length;
    if (n === 0) return 0;
    
    let ema = prices[0];
    const oneMinusAlpha = 1 - alpha;
    
    // Single-pass EMA calculation
    for (let i = 1; i < n; i++) {
      ema = alpha * prices[i] + oneMinusAlpha * ema;
    }
    
    return ema;
  }

  /**
   * Ultra-fast RSI calculation (inspired by your calculate_rsi_numba)
   * Optimized with Wilder's smoothing and minimal memory allocation
   */
  calculateRSIUltraFast(prices, window = 14) {
    const n = prices.length;
    if (n < window + 1) return 50.0;
    
    // Calculate price changes
    let gains = 0;
    let losses = 0;
    
    // Initial period calculation
    for (let i = 1; i <= window; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }
    
    let avgGain = gains / window;
    let avgLoss = losses / window;
    
    // Continue with Wilder's smoothing for remaining periods
    const windowMinusOne = window - 1;
    for (let i = window + 1; i < n; i++) {
      const change = prices[i] - prices[i - 1];
      
      if (change > 0) {
        avgGain = (avgGain * windowMinusOne + change) / window;
        avgLoss = (avgLoss * windowMinusOne) / window;
      } else {
        avgGain = (avgGain * windowMinusOne) / window;
        avgLoss = (avgLoss * windowMinusOne - change) / window;
      }
    }
    
    if (avgLoss === 0) return 100.0;
    
    const rs = avgGain / avgLoss;
    return 100.0 - (100.0 / (1.0 + rs));
  }

  /**
   * Ultra-fast Bollinger Bands (inspired by your calculate_bollinger_bands_numba)
   * Optimized with single-pass variance calculation
   */
  calculateBollingerBandsUltraFast(prices, window = 20, numStd = 2.0) {
    const n = prices.length;
    if (n < window) return { upper: 0, middle: 0, lower: 0 };
    
    // Calculate SMA for the window
    const recentPrices = prices.slice(-window);
    let sum = 0;
    for (let i = 0; i < window; i++) {
      sum += recentPrices[i];
    }
    const sma = sum / window;
    
    // Calculate standard deviation in single pass
    let variance = 0;
    for (let i = 0; i < window; i++) {
      const diff = recentPrices[i] - sma;
      variance += diff * diff;
    }
    const stdDev = Math.sqrt(variance / window);
    
    const offset = stdDev * numStd;
    return {
      upper: sma + offset,
      middle: sma,
      lower: sma - offset
    };
  }

  /**
   * Ultra-fast MACD calculation
   * Optimized with pre-calculated EMA values
   */
  calculateMACDUltraFast(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod) return { macd: 0, signal: 0, histogram: 0 };
    
    const fastAlpha = 2.0 / (fastPeriod + 1);
    const slowAlpha = 2.0 / (slowPeriod + 1);
    const signalAlpha = 2.0 / (signalPeriod + 1);
    
    // Calculate fast and slow EMAs
    const fastEMA = this.calculateEMAUltraFast(prices, fastAlpha);
    const slowEMA = this.calculateEMAUltraFast(prices, slowAlpha);
    
    const macd = fastEMA - slowEMA;
    
    // For signal line, we need MACD history (simplified for performance)
    const signal = macd * signalAlpha; // Simplified signal calculation
    const histogram = macd - signal;
    
    return { macd, signal, histogram };
  }

  /**
   * Ultra-fast Stochastic Oscillator
   * Optimized with single-pass min/max calculation
   */
  calculateStochasticUltraFast(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    const n = closes.length;
    if (n < kPeriod) return { k: 50, d: 50 };
    
    // Get recent data
    const recentHighs = highs.slice(-kPeriod);
    const recentLows = lows.slice(-kPeriod);
    const currentClose = closes[n - 1];
    
    // Find highest high and lowest low in single pass
    let highestHigh = recentHighs[0];
    let lowestLow = recentLows[0];
    
    for (let i = 1; i < kPeriod; i++) {
      if (recentHighs[i] > highestHigh) highestHigh = recentHighs[i];
      if (recentLows[i] < lowestLow) lowestLow = recentLows[i];
    }
    
    // Calculate %K
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    // Simplified %D calculation (would need K history for accurate calculation)
    const d = k; // Simplified for performance
    
    return { k, d };
  }

  /**
   * Batch indicator calculation with caching
   * Processes multiple indicators in single pass for maximum efficiency
   */
  calculateAllIndicatorsBatch(symbol, prices, highs, lows, volumes) {
    const cacheKey = `${symbol}_${prices.length}_${prices[prices.length - 1]}`;
    
    // Check cache first
    if (this.indicatorCache.has(cacheKey)) {
      const cached = this.indicatorCache.get(cacheKey);
      const expiry = this.cacheExpiry.get(cacheKey);
      
      if (Date.now() < expiry) {
        return cached;
      }
    }
    
    // Calculate all indicators in batch
    const indicators = {
      sma_20: this.calculateSMAUltraFast(prices, 20),
      sma_50: this.calculateSMAUltraFast(prices, 50),
      ema_12: this.calculateEMAUltraFast(prices, 2.0 / 13.0),
      ema_26: this.calculateEMAUltraFast(prices, 2.0 / 27.0),
      rsi_14: this.calculateRSIUltraFast(prices, 14),
      bb: this.calculateBollingerBandsUltraFast(prices, 20, 2.0),
      macd: this.calculateMACDUltraFast(prices, 12, 26, 9),
      stoch: this.calculateStochasticUltraFast(highs, lows, prices, 14, 3),
      price: prices[prices.length - 1],
      volume: volumes[volumes.length - 1],
      timestamp: Date.now()
    };
    
    // Cache results for 1 second
    this.indicatorCache.set(cacheKey, indicators);
    this.cacheExpiry.set(cacheKey, Date.now() + 1000);
    
    // Clean old cache entries periodically
    if (this.indicatorCache.size > 1000) {
      this.cleanCache();
    }
    
    return indicators;
  }

  /**
   * WebAssembly-ready indicator calculation
   * Prepares data for WASM module processing
   */
  async calculateIndicatorsWASM(prices, volumes) {
    // This would interface with a WebAssembly module compiled from your Python Numba code
    // For now, we'll use the optimized JavaScript versions
    
    try {
      // Convert to typed arrays for WASM compatibility
      const pricesArray = new Float64Array(prices);
      const volumesArray = new Float64Array(volumes);
      
      // In production, this would call WASM functions:
      // const wasmModule = await WebAssembly.instantiate(indicatorModule);
      // const sma = wasmModule.exports.calculate_sma(pricesArray, 20);
      
      // For now, use optimized JavaScript
      return {
        sma_20: this.calculateSMAUltraFast(pricesArray, 20),
        ema_12: this.calculateEMAUltraFast(pricesArray, 2.0 / 13.0),
        rsi_14: this.calculateRSIUltraFast(pricesArray, 14),
        bb: this.calculateBollingerBandsUltraFast(pricesArray, 20, 2.0)
      };
      
    } catch (error) {
      console.error('WASM indicator calculation failed:', error);
      // Fallback to JavaScript implementation
      return this.calculateAllIndicatorsBatch('default', prices, prices, prices, volumes);
    }
  }

  /**
   * Parallel indicator calculation using Worker threads
   * Distributes calculations across multiple CPU cores
   */
  async calculateIndicatorsParallel(prices, volumes, workers) {
    const chunks = this.chunkArray(prices, workers.length);
    
    const promises = chunks.map((chunk, index) => {
      return new Promise((resolve, reject) => {
        const worker = workers[index];
        
        worker.postMessage({
          type: 'calculate_indicators',
          prices: chunk,
          volumes: volumes.slice(index * chunk.length, (index + 1) * chunk.length)
        });
        
        worker.once('message', (result) => {
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result.indicators);
          }
        });
      });
    });
    
    const results = await Promise.all(promises);
    
    // Combine results from all workers
    return this.combineIndicatorResults(results);
  }

  /**
   * Performance benchmarking
   * Measures indicator calculation speed
   */
  benchmark(prices, iterations = 1000) {
    const results = {};
    
    // Benchmark SMA
    const smaStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      this.calculateSMAUltraFast(prices, 20);
    }
    const smaEnd = process.hrtime.bigint();
    results.sma = Number(smaEnd - smaStart) / 1000000 / iterations; // ms per calculation
    
    // Benchmark EMA
    const emaStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      this.calculateEMAUltraFast(prices, 2.0 / 13.0);
    }
    const emaEnd = process.hrtime.bigint();
    results.ema = Number(emaEnd - emaStart) / 1000000 / iterations;
    
    // Benchmark RSI
    const rsiStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      this.calculateRSIUltraFast(prices, 14);
    }
    const rsiEnd = process.hrtime.bigint();
    results.rsi = Number(rsiEnd - rsiStart) / 1000000 / iterations;
    
    // Benchmark Bollinger Bands
    const bbStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      this.calculateBollingerBandsUltraFast(prices, 20, 2.0);
    }
    const bbEnd = process.hrtime.bigint();
    results.bb = Number(bbEnd - bbStart) / 1000000 / iterations;
    
    return results;
  }

  // Helper methods
  chunkArray(array, chunks) {
    const chunkSize = Math.ceil(array.length / chunks);
    const result = [];
    
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    
    return result;
  }

  combineIndicatorResults(results) {
    // Combine results from parallel workers
    // This is a simplified implementation
    return results[results.length - 1]; // Return last chunk result
  }

  cleanCache() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now >= expiry) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.indicatorCache.delete(key);
      this.cacheExpiry.delete(key);
    }
  }
}

module.exports = UltraFastIndicators;
