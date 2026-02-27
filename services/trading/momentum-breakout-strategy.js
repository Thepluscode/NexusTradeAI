const axios = require('axios');

/**
 * MOMENTUM BREAKOUT STRATEGY
 *
 * Designed to catch explosive movers like SMX (+110% days)
 *
 * Entry Criteria:
 * 1. Unusual Volume (3x+ average volume)
 * 2. Strong Price Momentum (>5% intraday move)
 * 3. Breakout above resistance or high-of-day
 * 4. Price > $1 (avoid penny stocks)
 * 5. RSI < 80 (not extremely overbought)
 *
 * Exit Criteria:
 * - 10% profit target (fast scalps)
 * - 5% stop loss (tight risk management)
 * - Trailing stop: 3% below high after +7% profit
 */

class MomentumBreakoutStrategy {
    constructor(config = {}) {
        this.config = {
            minVolumeMultiplier: 3.0,      // 3x average volume
            minPercentGain: 5.0,            // 5% minimum daily gain
            minPrice: 1.0,                  // Avoid penny stocks
            maxPrice: 500,                  // Reasonable price range
            maxRSI: 80,                     // Don't chase extreme overbought
            profitTarget: 0.10,             // 10% profit target
            stopLoss: 0.05,                 // 5% stop loss
            trailingStopDistance: 0.03,     // 3% trailing stop
            trailingStopActivation: 0.07,   // Activate after 7% profit
            maxPositions: 5,                // Max simultaneous positions
            scanInterval: 60000,            // Scan every 60 seconds
            ...config
        };

        this.alpacaConfig = {
            baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
            apiKey: process.env.ALPACA_API_KEY,
            secretKey: process.env.ALPACA_SECRET_KEY,
            headers: {
                'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY
            }
        };

        this.watchlist = new Map(); // Track potential breakouts
        this.positions = new Map();
        this.highOfDay = new Map();
    }

    /**
     * Get tradeable stocks with filters
     */
    async getMostActiveStocks() {
        try {
            // Try Alpaca screener first (may not work on paper account)
            try {
                const url = `${this.alpacaConfig.baseURL}/v1beta1/screener/stocks/most-actives`;
                const response = await axios.get(url, {
                    headers: this.alpacaConfig.headers,
                    params: {
                        by: 'volume',
                        top: 50
                    }
                });
                if (response.data.most_actives) {
                    return response.data.most_actives;
                }
            } catch (err) {
                console.log('📊 Screener API not available, using alternative method...');
            }

            // Alternative: Get all tradeable assets and filter
            const assetsUrl = `${this.alpacaConfig.baseURL}/v2/assets`;
            const assetsResponse = await axios.get(assetsUrl, {
                headers: this.alpacaConfig.headers,
                params: {
                    status: 'active',
                    asset_class: 'us_equity'
                }
            });

            let assets = assetsResponse.data || [];

            // Filter for tradeable, non-fractional stocks
            assets = assets.filter(asset =>
                asset.tradable &&
                asset.easy_to_borrow &&
                asset.marginable &&
                !asset.fractionable && // Focus on whole shares (avoid penny stocks)
                asset.status === 'active'
            );

            // Take a diverse sample of 100 stocks
            const sampleSize = Math.min(100, assets.length);
            const sampledAssets = [];
            const step = Math.floor(assets.length / sampleSize);

            for (let i = 0; i < assets.length && sampledAssets.length < sampleSize; i += step) {
                sampledAssets.push({ symbol: assets[i].symbol });
            }

            console.log(`📊 Scanning ${sampledAssets.length} tradeable stocks...`);
            return sampledAssets;

        } catch (error) {
            console.error('❌ Error fetching stocks:', error.message);
            return [];
        }
    }

    /**
     * Get real-time snapshot for a symbol
     */
    async getSnapshot(symbol) {
        try {
            const url = `${this.alpacaConfig.baseURL}/v2/stocks/${symbol}/snapshot`;
            const response = await axios.get(url, {
                headers: this.alpacaConfig.headers
            });

            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching snapshot for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate RSI (Relative Strength Index)
     */
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50; // Neutral if not enough data

        let gains = 0;
        let losses = 0;

        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Check if stock meets momentum breakout criteria
     */
    analyzeBreakout(snapshot, symbol) {
        const { dailyBar, minuteBar, prevDailyBar, latestTrade } = snapshot;

        if (!dailyBar || !minuteBar || !prevDailyBar || !latestTrade) {
            return { isBreakout: false, reason: 'Incomplete data' };
        }

        const currentPrice = latestTrade.p;
        const dayOpen = dailyBar.o;
        const dayHigh = dailyBar.h;
        const dayLow = dailyBar.l;
        const volume = dailyBar.v;
        const prevVolume = prevDailyBar.v || 1;

        // Calculate metrics
        const percentGain = ((currentPrice - dayOpen) / dayOpen) * 100;
        const volumeRatio = volume / prevVolume;
        const priceRange = ((dayHigh - dayLow) / dayLow) * 100;

        // Store high of day
        if (!this.highOfDay.has(symbol) || currentPrice > this.highOfDay.get(symbol)) {
            this.highOfDay.set(symbol, currentPrice);
        }

        // Check criteria
        const checks = {
            priceInRange: currentPrice >= this.config.minPrice && currentPrice <= this.config.maxPrice,
            strongGain: percentGain >= this.config.minPercentGain,
            unusualVolume: volumeRatio >= this.config.minVolumeMultiplier,
            breakoutPrice: currentPrice >= dayHigh * 0.98, // Within 2% of HOD
            notPenny: currentPrice > 1.0
        };

        // Calculate simple RSI estimate
        const rsi = this.calculateRSI([prevDailyBar.c, dayOpen, currentPrice]);
        checks.notOverbought = rsi < this.config.maxRSI;

        const isBreakout = Object.values(checks).every(v => v === true);

        if (isBreakout) {
            return {
                isBreakout: true,
                signal: {
                    symbol,
                    price: currentPrice,
                    percentGain: percentGain.toFixed(2),
                    volumeRatio: volumeRatio.toFixed(2),
                    priceRange: priceRange.toFixed(2),
                    rsi: rsi.toFixed(1),
                    entry: currentPrice,
                    stopLoss: currentPrice * (1 - this.config.stopLoss),
                    target: currentPrice * (1 + this.config.profitTarget)
                }
            };
        }

        return { isBreakout: false, checks, percentGain, volumeRatio };
    }

    /**
     * Main scanning function
     */
    async scanForBreakouts() {
        console.log('\n🔍 Scanning for momentum breakouts...');

        try {
            // Get most active stocks
            const activeStocks = await this.getMostActiveStocks();

            if (activeStocks.length === 0) {
                console.log('⚠️  No active stocks returned from screener');
                return [];
            }

            console.log(`📊 Analyzing ${activeStocks.length} most active stocks...`);

            const breakouts = [];

            for (const stock of activeStocks) {
                const symbol = stock.symbol;

                // Get detailed snapshot
                const snapshot = await this.getSnapshot(symbol);

                if (!snapshot) continue;

                // Analyze for breakout
                const analysis = this.analyzeBreakout(snapshot, symbol);

                if (analysis.isBreakout) {
                    console.log(`🚀 BREAKOUT DETECTED: ${symbol}`);
                    console.log(`   Price: $${analysis.signal.price}`);
                    console.log(`   Gain: ${analysis.signal.percentGain}%`);
                    console.log(`   Volume: ${analysis.signal.volumeRatio}x average`);
                    console.log(`   RSI: ${analysis.signal.rsi}`);
                    breakouts.push(analysis.signal);
                } else if (analysis.percentGain > 3) {
                    // Log interesting movers even if not breakouts yet
                    console.log(`📈 ${symbol}: +${analysis.percentGain.toFixed(1)}% (Vol: ${analysis.volumeRatio.toFixed(1)}x)`);
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (breakouts.length === 0) {
                console.log('⏳ No breakouts found this scan cycle');
            }

            return breakouts;

        } catch (error) {
            console.error('❌ Error in scanForBreakouts:', error.message);
            return [];
        }
    }

    /**
     * Execute trade for breakout signal
     */
    async executeBreakout(signal) {
        console.log(`\n💰 Executing breakout trade for ${signal.symbol}...`);

        try {
            // Calculate position size (1% of portfolio)
            const accountResponse = await axios.get(`${this.alpacaConfig.baseURL}/v2/account`, {
                headers: this.alpacaConfig.headers
            });

            const equity = parseFloat(accountResponse.data.equity);
            const positionSize = equity * 0.01; // 1% per position
            const shares = Math.floor(positionSize / signal.price);

            if (shares < 1) {
                console.log(`⚠️  Position size too small for ${signal.symbol}`);
                return null;
            }

            // Place order
            const order = {
                symbol: signal.symbol,
                qty: shares,
                side: 'buy',
                type: 'market',
                time_in_force: 'day'
            };

            const orderResponse = await axios.post(
                `${this.alpacaConfig.baseURL}/v2/orders`,
                order,
                { headers: this.alpacaConfig.headers }
            );

            console.log(`✅ Order placed for ${signal.symbol}:`);
            console.log(`   Shares: ${shares}`);
            console.log(`   Entry: $${signal.price}`);
            console.log(`   Stop Loss: $${signal.stopLoss.toFixed(2)}`);
            console.log(`   Target: $${signal.target.toFixed(2)}`);

            // Track position
            this.positions.set(signal.symbol, {
                ...signal,
                shares,
                orderId: orderResponse.data.id,
                entryTime: new Date()
            });

            return orderResponse.data;

        } catch (error) {
            console.error(`❌ Error executing trade for ${signal.symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Start continuous scanning
     */
    async start() {
        console.log('🚀 Starting Momentum Breakout Scanner...');
        console.log(`📋 Configuration:`);
        console.log(`   Min Volume Multiplier: ${this.config.minVolumeMultiplier}x`);
        console.log(`   Min Percent Gain: ${this.config.minPercentGain}%`);
        console.log(`   Profit Target: ${this.config.profitTarget * 100}%`);
        console.log(`   Stop Loss: ${this.config.stopLoss * 100}%`);
        console.log(`   Max Positions: ${this.config.maxPositions}`);

        // Run initial scan
        await this.scanForBreakouts();

        // Set up continuous scanning
        setInterval(async () => {
            if (this.positions.size < this.config.maxPositions) {
                const breakouts = await this.scanForBreakouts();

                // Execute trades for top breakouts
                for (const signal of breakouts.slice(0, this.config.maxPositions - this.positions.size)) {
                    await this.executeBreakout(signal);
                }
            } else {
                console.log(`⏸️  Max positions (${this.config.maxPositions}) reached, pausing new entries`);
            }
        }, this.config.scanInterval);
    }
}

module.exports = MomentumBreakoutStrategy;
