/**
 * Winning Strategy with Mathematical Edge Validation
 *
 * This is an enhanced version of winning-strategy.js that integrates
 * the Math Advantage system to ensure only high-probability trades
 * are executed with optimal position sizing.
 *
 * Key Improvements:
 * 1. Pre-trade edge validation
 * 2. Optimal Kelly-based position sizing
 * 3. Real-time edge monitoring
 * 4. Statistical validation of signals
 * 5. Automatic rejection of low-edge setups
 */

const WinningStrategy = require('./winning-strategy');
const MathAdvantageIntegration = require('./math-advantage-integration');

class WinningStrategyWithMathEdge extends WinningStrategy {
    constructor(config) {
        super(config);

        // Initialize Math Advantage System
        this.mathAdvantage = new MathAdvantageIntegration({
            enableEdgeCalculator: true,
            enableStatisticalValidation: config.enableStatisticalValidation !== false,
            enableMonteCarloSimulation: false, // Disable for real-time (too slow)
            enableRealTimeMonitoring: true,

            minExpectedValue: config.minExpectedValue || 0.02, // 2% minimum EV
            minWinRate: config.minWinRate || 0.45, // 45% minimum win rate
            minSharpe: config.minSharpe || 1.0,
            minProfitFactor: config.minProfitFactor || 1.2,
            maxDrawdown: config.maxDrawdown || 0.15 // 15% max drawdown
        });

        // Start edge monitoring
        this.mathAdvantage.start();

        // Set up alert listeners
        this.setupMathAdvantageListeners();

        console.log('✅ Math Advantage System integrated and active');
    }

    /**
     * Set up listeners for math advantage events
     */
    setupMathAdvantageListeners() {
        // Critical alerts (stop trading temporarily)
        this.mathAdvantage.on('criticalAlert', (alerts) => {
            console.log('\n🚨 CRITICAL EDGE ALERT - REDUCING TRADING 🚨');
            for (const alert of alerts) {
                console.log(`   ${alert.message}`);
            }

            // Temporarily reduce position limits
            this.config.maxTotalPositions = Math.max(1, Math.floor(this.config.maxTotalPositions / 2));
            console.log(`   → Reduced max positions to ${this.config.maxTotalPositions}`);
        });

        // Edge degradation warnings
        this.mathAdvantage.on('edgeDegradation', (degradations) => {
            console.log('\n⚠️  EDGE DEGRADATION WARNING');
            for (const deg of degradations) {
                console.log(`   ${deg.metric}: ${deg.rolling} (was ${deg.current})`);
            }
            console.log('   → Monitoring closely for further degradation');
        });

        // Periodic dashboard updates
        let dashboardCounter = 0;
        this.mathAdvantage.on('metricsUpdated', () => {
            dashboardCounter++;
            // Print dashboard every 10 trades
            if (dashboardCounter % 10 === 0) {
                console.log('\n--- Edge Dashboard Update ---');
                this.mathAdvantage.printDashboard();
            }
        });
    }

    /**
     * ENHANCED: Trend Following Strategy with Math Edge Validation
     * Only enters trades that pass mathematical edge requirements
     */
    async trendFollowingStrategy(marketData) {
        // Update market regime before trading
        await this.updateMarketRegime();

        // Focus symbols
        const focusSymbols = [
            'SPY', 'QQQ', 'IWM',
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA',
            'META', 'NFLX', 'AMD', 'COIN'
        ];

        for (const symbol of focusSymbols) {
            // Standard checks
            if (this.hasPosition(symbol)) continue;

            const lastTrade = this.lastTradeTime.get(symbol);
            if (lastTrade && Date.now() - lastTrade < this.config.minTimeBetweenTrades) {
                continue;
            }

            if (!this.canOpenNewPosition(symbol, 'trendFollowing')) continue;

            try {
                const data = marketData[symbol];
                if (!data || !data.price) continue;

                // Add price to history
                this.smartPredictor.addPriceData(symbol, data.price);

                const priceHistory = this.smartPredictor.priceHistory.get(symbol);
                if (!priceHistory || priceHistory.length < 5) continue;

                // Analyze trend
                const analysis = this.analyzeTrend(priceHistory);
                const rsi = this.calculateRSI(priceHistory, 14);

                const baseStrategy = this.strategies.get('trendFollowing');
                const strategy = this.getRegimeAdjustedParams(baseStrategy);

                if (strategy.skipTrading) continue;

                // Testing mode check
                const totalTrades = this.performance ? this.performance.totalTrades : 0;
                const inTestingPeriod = totalTrades < 20;

                if (!inTestingPeriod && Math.abs(analysis.trendStrength) < baseStrategy.minTrendStrength) {
                    continue;
                }

                if (Math.abs(analysis.recentMove) > strategy.pullbackSize) continue;

                const direction = analysis.trendStrength > 0 ? 'long' : 'short';

                // RSI confirmation
                if (direction === 'long' && rsi > 70) continue;
                if (direction === 'short' && rsi < 30) continue;

                // Calculate entry, stops, targets
                const entry = data.price;
                const atr = this.calculateATR(priceHistory, 14);

                let stopLoss;
                if (atr && atr > 0) {
                    const atrStopDistance = atr * 2.0;
                    stopLoss = direction === 'long' ? entry - atrStopDistance : entry + atrStopDistance;

                    const maxStopDistance = entry * strategy.stopLoss;
                    if (direction === 'long') {
                        stopLoss = Math.max(stopLoss, entry - maxStopDistance);
                    } else {
                        stopLoss = Math.min(stopLoss, entry + maxStopDistance);
                    }
                } else {
                    stopLoss = direction === 'long'
                        ? entry * (1 - strategy.stopLoss)
                        : entry * (1 + strategy.stopLoss);
                }

                const target = direction === 'long'
                    ? entry * (1 + strategy.profitTarget)
                    : entry * (1 - strategy.profitTarget);

                // ═══════════════════════════════════════════════════════════════
                // ★ MATH ADVANTAGE VALIDATION - THE KEY DIFFERENCE ★
                // ═══════════════════════════════════════════════════════════════

                const signal = {
                    symbol,
                    strategy: 'trendFollowing',
                    direction,
                    entry,
                    stopLoss,
                    takeProfit: target,
                    confidence: 0.80
                };

                console.log(`\n🔍 Evaluating trade: ${symbol} ${direction.toUpperCase()}`);

                // Validate with Math Advantage System
                const validation = await this.mathAdvantage.validateTradeSignal(signal);

                if (!validation.approved) {
                    console.log(`❌ Trade REJECTED: ${validation.reasons.join(', ')}`);
                    console.log(`   Expected Value: ${validation.edge?.expectedValue || 'N/A'}`);
                    console.log(`   Win Probability: ${validation.edge?.probabilityOfProfit || 'N/A'}`);
                    continue; // SKIP THIS TRADE
                }

                // Trade approved - use recommended position size
                const recommendedSize = parseFloat(validation.edge.recommendedPositionSize);
                const stopDistance = Math.abs(entry - stopLoss) / entry;
                const targetDistance = Math.abs(target - entry) / entry;
                const actualRR = targetDistance / stopDistance;

                console.log(`✅ Trade APPROVED with Strong Edge`);
                console.log(`   Expected Value: ${validation.edge.expectedValue}`);
                console.log(`   Win Probability: ${(parseFloat(validation.edge.probabilityOfProfit) * 100).toFixed(1)}%`);
                console.log(`   Kelly Position Size: ${(recommendedSize * 100).toFixed(1)}%`);
                console.log(`   Market Regime: ${this.marketRegime.current}`);
                console.log(`   Entry: $${entry.toFixed(2)}`);
                console.log(`   Stop: $${stopLoss.toFixed(2)} (-${(stopDistance * 100).toFixed(2)}%)`);
                console.log(`   Target: $${target.toFixed(2)} (+${(targetDistance * 100).toFixed(2)}%)`);
                console.log(`   R:R Ratio: ${actualRR.toFixed(2)}:1`);

                // ═══════════════════════════════════════════════════════════════
                // ★ ENTER POSITION WITH OPTIMAL SIZING ★
                // ═══════════════════════════════════════════════════════════════

                // Use Kelly-optimized position size (capped at max position size)
                const optimalPositionSize = Math.min(
                    recommendedSize,
                    this.config.maxPositionSize / 100000, // Convert to fraction
                    0.10 // Max 10% of capital per position
                );

                if (direction === 'long') {
                    await this.enterLongPosition(symbol, 'trendFollowing', {
                        entry,
                        target,
                        stop: stopLoss,
                        trailingStop: strategy.trailingStop,
                        trailingActivation: strategy.trailingActivation,
                        confidence: 0.80,
                        kellySize: optimalPositionSize // Pass Kelly size
                    });
                } else {
                    await this.enterShortPosition(symbol, 'trendFollowing', {
                        entry,
                        target,
                        stop: stopLoss,
                        trailingStop: strategy.trailingStop,
                        trailingActivation: strategy.trailingActivation,
                        confidence: 0.80,
                        kellySize: optimalPositionSize
                    });
                }

                this.lastTradeTime.set(symbol, Date.now());

            } catch (error) {
                console.error(`Error in math-edge trend following for ${symbol}:`, error.message);
            }
        }
    }

    /**
     * ENHANCED: Close position with trade recording for math advantage
     */
    async closePosition(positionId, reason) {
        const position = this.positions.get(positionId);

        if (!position) {
            console.error(`Position ${positionId} not found`);
            return;
        }

        try {
            // Close position using parent class method
            await super.closePosition(positionId, reason);

            // ═══════════════════════════════════════════════════════════════
            // ★ RECORD TRADE FOR MATH ADVANTAGE ANALYSIS ★
            // ═══════════════════════════════════════════════════════════════

            // Record completed trade for edge analysis
            await this.mathAdvantage.recordTrade({
                symbol: position.symbol,
                strategy: position.strategy,
                profit: position.profit || 0,
                entry: position.entry,
                exit: position.exit || position.entry,
                timestamp: Date.now()
            });

            console.log(`📊 Trade recorded for edge analysis: ${position.symbol} P/L: $${(position.profit || 0).toFixed(2)}`);

        } catch (error) {
            console.error(`Error closing position ${positionId}:`, error);
        }
    }

    /**
     * Get comprehensive performance report including math edge metrics
     */
    getPerformanceReport() {
        const baseReport = super.getPerformanceMetrics ? super.getPerformanceMetrics() : {};
        const edgeReport = this.mathAdvantage.getPerformanceReport();

        return {
            ...baseReport,
            mathEdge: edgeReport,
            timestamp: Date.now()
        };
    }

    /**
     * Stop trading and cleanup
     */
    stop() {
        console.log('\n🛑 Stopping trading with Math Advantage...');

        // Print final edge dashboard
        console.log('\n📊 Final Edge Dashboard:');
        this.mathAdvantage.printDashboard();

        // Get final performance report
        const report = this.getPerformanceReport();
        console.log('\n📈 Final Performance Report:');
        console.log(JSON.stringify(report.mathEdge.overallEdge, null, 2));

        // Stop math advantage monitoring
        this.mathAdvantage.stop();

        // Call parent stop
        if (super.stop) {
            super.stop();
        }

        console.log('✅ Trading stopped successfully\n');
    }
}

module.exports = WinningStrategyWithMathEdge;
