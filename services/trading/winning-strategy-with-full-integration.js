/**
 * Winning Strategy with Full Integration
 *
 * Complete trading system combining:
 * 1. Math Advantage validation
 * 2. Blockchain trade logging
 * 3. Smart contract risk enforcement
 * 4. Performance tokenization
 *
 * This is the most advanced version - use this for maximum transparency
 * and DeFi-readiness.
 */

const WinningStrategy = require('./winning-strategy');
const MathAdvantageWithBlockchain = require('./math-advantage-with-blockchain');

class WinningStrategyWithFullIntegration extends WinningStrategy {
    constructor(config) {
        super(config);

        // Initialize Math Advantage + Blockchain System
        this.mathBlockchain = new MathAdvantageWithBlockchain({
            // ═══ Math Advantage Settings ═══
            enableMathValidation: config.enableMathValidation !== false,
            minExpectedValue: config.minExpectedValue || 0.02, // 2% min EV
            minWinRate: config.minWinRate || 0.45, // 45% min win rate
            minSharpe: config.minSharpe || 1.0,
            minProfitFactor: config.minProfitFactor || 1.2,

            // ═══ Blockchain Settings ═══
            enableBlockchain: config.enableBlockchain !== false,
            enableSmartContracts: config.enableSmartContracts !== false,
            chainId: config.chainId || 'nexustrade-mainnet',

            // ═══ Tokenization Settings ═══
            enableTokenization: config.enableTokenization !== false,
            tokenName: config.tokenName || 'NexusTradePerformance',
            tokenSymbol: config.tokenSymbol || 'NTP',

            // ═══ Risk Limits (enforced by smart contracts) ═══
            maxRiskPerTrade: config.riskPerTrade || 0.02,
            maxPositionSize: config.maxPositionSize || 10000,
            maxDrawdown: config.maxDrawdown || 0.15
        });

        // Set up event listeners
        this.setupFullIntegrationListeners();

        console.log('\n' + '='.repeat(70));
        console.log('🚀 WINNING STRATEGY WITH FULL INTEGRATION');
        console.log('='.repeat(70));
        console.log('   Math Advantage: ✅');
        console.log('   Blockchain Logging: ✅');
        console.log('   Smart Contracts: ✅');
        console.log('   Performance Tokens: ✅');
        console.log('='.repeat(70) + '\n');
    }

    /**
     * Set up listeners for all integration events
     */
    setupFullIntegrationListeners() {
        // Critical alerts from Math Advantage
        this.mathBlockchain.mathAdvantage.on('criticalAlert', (alerts) => {
            console.log('\n🚨 CRITICAL EDGE ALERT - PAUSING TRADING 🚨');
            for (const alert of alerts) {
                console.log(`   ${alert.message}`);
            }

            // Temporarily reduce position limits
            this.config.maxTotalPositions = Math.max(1, Math.floor(this.config.maxTotalPositions / 2));
            console.log(`   → Reduced max positions to ${this.config.maxTotalPositions}\n`);
        });

        // Edge degradation warnings
        this.mathBlockchain.mathAdvantage.on('edgeDegradation', (degradations) => {
            console.log('\n⚠️  EDGE DEGRADATION WARNING');
            for (const deg of degradations) {
                console.log(`   ${deg.metric}: ${deg.rolling} (was ${deg.current})`);
            }
            console.log('   → Monitoring closely for further degradation\n');
        });

        // Win rate warnings from smart contracts
        this.mathBlockchain.on('winRateWarning', (alert) => {
            console.log(`\n⚠️  Win Rate Warning: ${(alert.currentWinRate * 100).toFixed(1)}% below minimum ${(alert.minRequired * 100).toFixed(0)}%`);
            console.log('   → Consider reviewing strategy parameters\n');
        });

        // Drawdown alerts from smart contracts
        this.mathBlockchain.on('drawdownAlert', (alert) => {
            console.log(`\n🚨 DRAWDOWN ALERT: ${(alert.currentDrawdown * 100).toFixed(1)}% exceeds ${(alert.maxAllowed * 100).toFixed(0)}%`);
            console.log('   → HALTING ALL TRADING\n');

            // Emergency stop
            this.emergencyStop();
        });

        // Periodic dashboard (every 10 trades)
        let tradeCounter = 0;
        this.mathBlockchain.on('tradeRecorded', () => {
            tradeCounter++;
            if (tradeCounter % 10 === 0) {
                console.log('\n' + '─'.repeat(70));
                console.log('📊 PERIODIC DASHBOARD UPDATE (Every 10 Trades)');
                console.log('─'.repeat(70));
                this.mathBlockchain.printDashboard();
            }
        });
    }

    /**
     * Start trading with full integration
     */
    async start() {
        console.log('\n🚀 Starting Winning Strategy with Full Integration...\n');

        // Start Math Advantage + Blockchain system
        await this.mathBlockchain.start();

        // Start parent trading engine
        await super.start();

        console.log('✅ All systems operational and trading\n');
    }

    /**
     * ENHANCED: Trend Following Strategy with Full Validation
     */
    async trendFollowingStrategy(marketData) {
        // Update market regime
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
                // ★ FULL VALIDATION: MATH + BLOCKCHAIN + SMART CONTRACTS ★
                // ═══════════════════════════════════════════════════════════════

                const signal = {
                    symbol,
                    strategy: 'trendFollowing',
                    direction,
                    entry,
                    stopLoss,
                    takeProfit: target,
                    confidence: 0.80,
                    size: this.config.maxPositionSize || 10000
                };

                console.log(`\n${'═'.repeat(70)}`);
                console.log(`🔍 Evaluating Trade: ${symbol} ${direction.toUpperCase()}`);
                console.log('═'.repeat(70));

                // Comprehensive validation (Math + Blockchain + Smart Contracts)
                const validation = await this.mathBlockchain.validateTradeSignal(signal);

                if (!validation.approved) {
                    console.log('❌ TRADE REJECTED');
                    console.log(`   Reasons: ${validation.reasons.join(', ')}`);

                    if (validation.edge) {
                        console.log(`   Expected Value: ${validation.edge.expectedValue}`);
                        console.log(`   Win Probability: ${validation.edge.probabilityOfProfit}`);
                    }

                    console.log('═'.repeat(70) + '\n');
                    continue; // SKIP THIS TRADE
                }

                // ═══════════════════════════════════════════════════════════════
                // ★ TRADE APPROVED - ENTER WITH OPTIMAL SIZING ★
                // ═══════════════════════════════════════════════════════════════

                const recommendedSize = parseFloat(validation.edge.recommendedPositionSize);
                const stopDistance = Math.abs(entry - stopLoss) / entry;
                const targetDistance = Math.abs(target - entry) / entry;
                const actualRR = targetDistance / stopDistance;

                console.log('✅ TRADE FULLY APPROVED');
                console.log('\n📊 VALIDATION DETAILS:');
                console.log(`   Math Validation: ${validation.mathApproved ? '✅' : '❌'}`);
                console.log(`   Blockchain Validation: ${validation.blockchainApproved ? '✅' : '❌'}`);
                console.log(`   Smart Contract Validation: ${validation.smartContractApproved ? '✅' : '❌'}`);

                console.log('\n💰 TRADE PARAMETERS:');
                console.log(`   Expected Value: ${validation.edge.expectedValue}`);
                console.log(`   Win Probability: ${(parseFloat(validation.edge.probabilityOfProfit) * 100).toFixed(1)}%`);
                console.log(`   Kelly Position Size: ${(recommendedSize * 100).toFixed(1)}%`);
                console.log(`   Market Regime: ${this.marketRegime.current}`);

                console.log('\n📈 PRICE LEVELS:');
                console.log(`   Entry: $${entry.toFixed(2)}`);
                console.log(`   Stop: $${stopLoss.toFixed(2)} (-${(stopDistance * 100).toFixed(2)}%)`);
                console.log(`   Target: $${target.toFixed(2)} (+${(targetDistance * 100).toFixed(2)}%)`);
                console.log(`   R:R Ratio: ${actualRR.toFixed(2)}:1`);
                console.log('═'.repeat(70) + '\n');

                // Use Kelly-optimized position size
                const optimalPositionSize = Math.min(
                    recommendedSize,
                    this.config.maxPositionSize / 100000,
                    0.10 // Max 10% of capital
                );

                if (direction === 'long') {
                    await this.enterLongPosition(symbol, 'trendFollowing', {
                        entry,
                        target,
                        stop: stopLoss,
                        trailingStop: strategy.trailingStop,
                        trailingActivation: strategy.trailingActivation,
                        confidence: 0.80,
                        kellySize: optimalPositionSize
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
                console.error(`Error in full integration strategy for ${symbol}:`, error.message);
            }
        }
    }

    /**
     * ENHANCED: Close position with full recording
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
            // ★ RECORD ACROSS ALL SYSTEMS ★
            // ═══════════════════════════════════════════════════════════════

            console.log('\n📝 Recording trade across all systems...');

            // Record with Math Advantage + Blockchain + Tokenization
            await this.mathBlockchain.recordTrade({
                symbol: position.symbol,
                strategy: position.strategy,
                profit: position.profit || 0,
                entry: position.entry,
                exit: position.exit || position.entry,
                timestamp: Date.now(),
                expectedValue: position.expectedValue,
                winProbability: position.winProbability,
                kellySize: position.kellySize
            });

            console.log('✅ Trade recorded successfully\n');

        } catch (error) {
            console.error(`Error closing position ${positionId}:`, error);
        }
    }

    /**
     * Emergency stop (triggered by critical alerts)
     */
    emergencyStop() {
        console.log('\n🚨 EMERGENCY STOP TRIGGERED');
        console.log('   Closing all positions...');

        // Close all positions
        for (const [positionId] of this.positions) {
            this.closePosition(positionId, 'Emergency stop - critical alert');
        }

        // Disable trading
        this.config.maxTotalPositions = 0;

        console.log('   All positions closed');
        console.log('   Trading disabled\n');
    }

    /**
     * Get comprehensive performance report
     */
    getComprehensivePerformanceReport() {
        const baseReport = super.getPerformanceMetrics ? super.getPerformanceMetrics() : {};
        const fullReport = this.mathBlockchain.getComprehensiveDashboard();

        return {
            ...baseReport,
            fullIntegration: fullReport,
            timestamp: Date.now()
        };
    }

    /**
     * Stop trading with full reporting
     */
    stop() {
        console.log('\n🛑 Stopping Winning Strategy with Full Integration...');

        // Print comprehensive final dashboard
        console.log('\n' + '═'.repeat(70));
        console.log('📊 FINAL COMPREHENSIVE DASHBOARD');
        console.log('═'.repeat(70) + '\n');

        this.mathBlockchain.printDashboard();

        // Verify blockchain integrity
        console.log('\n🔍 Final Blockchain Verification...');
        this.mathBlockchain.verifyBlockchain();

        // Print token dashboard if tokenization enabled
        if (this.mathBlockchain.config.enableTokenization) {
            this.mathBlockchain.tokenization.printDashboard();
        }

        // Export final audit report
        const auditReport = this.mathBlockchain.exportAuditReport();
        console.log('\n📄 Final Audit Report Summary:');
        console.log(`   System: ${auditReport.system}`);
        console.log(`   Export Time: ${auditReport.exportTime}`);
        console.log(`   Total Blocks: ${auditReport.blockchain.totalBlocks}`);
        console.log(`   Total Transactions: ${auditReport.blockchain.totalTransactions}`);
        console.log(`   Blockchain Verified: ${auditReport.blockchain.verified ? '✅' : '❌'}`);
        console.log(`   Performance Tokens: ${auditReport.tokenization.token.totalSupply.toLocaleString()}`);

        // Get final performance report
        const finalReport = this.getComprehensivePerformanceReport();
        console.log('\n📈 Final Performance Metrics:');
        console.log(`   Total Trades: ${finalReport.fullIntegration.mathEdge.totalTrades || 0}`);
        console.log(`   Win Rate: ${((finalReport.fullIntegration.mathEdge.winRate || 0) * 100).toFixed(1)}%`);
        console.log(`   Total Profit: $${(finalReport.fullIntegration.mathEdge.totalProfit || 0).toFixed(2)}`);
        console.log(`   Sharpe Ratio: ${(finalReport.fullIntegration.mathEdge.sharpeRatio || 0).toFixed(2)}`);

        // Stop all systems
        this.mathBlockchain.stop();

        // Call parent stop
        if (super.stop) {
            super.stop();
        }

        console.log('\n✅ All systems stopped successfully');
        console.log('═'.repeat(70) + '\n');
    }
}

module.exports = WinningStrategyWithFullIntegration;
