/**
 * Math Advantage Integration Layer
 *
 * Integrates all mathematical edge components into the trading engine:
 * 1. Edge Calculator - Quantifies edge before each trade
 * 2. Statistical Validator - Validates signals statistically
 * 3. Backtester - Tests strategies with walk-forward optimization
 * 4. Monte Carlo Simulator - Estimates risk and returns
 * 5. Edge Monitor - Real-time edge tracking
 *
 * This layer ensures every trade has positive mathematical expectancy.
 */

const MathEdgeCalculator = require('./math-edge-calculator');
const StatisticalValidator = require('./statistical-validator');
const EnhancedBacktester = require('./enhanced-backtester');
const MonteCarloSimulator = require('./monte-carlo-simulator');
const EdgeMonitor = require('./edge-monitor');
const EventEmitter = require('events');

class MathAdvantageIntegration extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Enable/disable components
            enableEdgeCalculator: config.enableEdgeCalculator !== false,
            enableStatisticalValidation: config.enableStatisticalValidation !== false,
            enableMonteCarloSimulation: config.enableMonteCarloSimulation !== false,
            enableRealTimeMonitoring: config.enableRealTimeMonitoring !== false,

            // Edge requirements
            minExpectedValue: config.minExpectedValue || 0.02, // 2% minimum EV
            minWinRate: config.minWinRate || 0.45, // 45%
            minProfitFactor: config.minProfitFactor || 1.2,
            minSharpe: config.minSharpe || 1.0,

            // Risk management
            maxPositionRisk: config.maxPositionRisk || 0.02, // 2% per trade
            maxDrawdown: config.maxDrawdown || 0.15, // 15%

            ...config
        };

        // Initialize components
        this.edgeCalculator = new MathEdgeCalculator({
            minSampleSize: 30,
            minWinRate: this.config.minWinRate,
            minExpectedValue: this.config.minExpectedValue,
            minConfidenceLevel: 0.90
        });

        this.statisticalValidator = new StatisticalValidator({
            minSampleSize: 30,
            significanceLevel: 0.05
        });

        this.backtester = new EnhancedBacktester({
            inSampleRatio: 0.70,
            walkForwardSteps: 5,
            minSharpe: this.config.minSharpe,
            minWinRate: this.config.minWinRate
        });

        this.monteCarloSimulator = new MonteCarloSimulator({
            simulations: 10000,
            trades: 252,
            initialCapital: 100000
        });

        this.edgeMonitor = new EdgeMonitor({
            minWinRate: this.config.minWinRate,
            minSharpe: this.config.minSharpe,
            minProfitFactor: this.config.minProfitFactor,
            maxDrawdown: this.config.maxDrawdown
        });

        // Set up event listeners
        this.setupEventListeners();
    }

    /**
     * Set up cross-component event listeners
     */
    setupEventListeners() {
        // Edge calculator events
        this.edgeCalculator.on('edgeCalculated', (edge) => {
            this.emit('edgeCalculated', edge);
        });

        this.edgeCalculator.on('historyUpdated', (data) => {
            this.emit('historyUpdated', data);
        });

        // Edge monitor events
        this.edgeMonitor.on('criticalAlert', (alerts) => {
            console.log('\n🚨 CRITICAL EDGE ALERT 🚨');
            for (const alert of alerts) {
                console.log(`   ${alert.message}`);
            }
            console.log('');
            this.emit('criticalAlert', alerts);
        });

        this.edgeMonitor.on('edgeDegradation', (degradations) => {
            console.log('\n⚠️  Edge Degradation Detected:');
            for (const deg of degradations) {
                console.log(`   ${deg.metric}: ${deg.rolling} (was ${deg.current})`);
            }
            console.log('');
            this.emit('edgeDegradation', degradations);
        });

        this.edgeMonitor.on('metricsUpdated', (metrics) => {
            this.emit('metricsUpdated', metrics);
        });
    }

    /**
     * Start the math advantage system
     */
    start() {
        console.log('\n🎯 Starting Math Advantage System...\n');

        if (this.config.enableRealTimeMonitoring) {
            this.edgeMonitor.start();
            console.log('✅ Real-time edge monitoring active');
        }

        console.log('✅ Math advantage system ready\n');
    }

    /**
     * Stop the system
     */
    stop() {
        if (this.config.enableRealTimeMonitoring) {
            this.edgeMonitor.stop();
        }
        console.log('🛑 Math advantage system stopped');
    }

    /**
     * Pre-trade validation - Check if trade has mathematical edge
     * This is the main function called before entering a trade
     */
    async validateTradeSignal(signal) {
        console.log(`\n🔍 Validating Trade Signal: ${signal.symbol} ${signal.direction}`);

        const validation = {
            signal,
            approved: false,
            reasons: [],
            edge: null,
            statistical: null,
            recommendation: null
        };

        // 1. Calculate mathematical edge
        if (this.config.enableEdgeCalculator) {
            const edge = this.edgeCalculator.validateTradeEdge(signal);
            validation.edge = edge;

            if (!edge.hasEdge) {
                validation.reasons.push('Insufficient mathematical edge');
                validation.approved = false;
                return validation;
            }

            validation.reasons.push(`Positive edge: EV=${edge.expectedValue}, P(profit)=${edge.probabilityOfProfit}`);
        }

        // 2. Statistical validation (if enough history)
        if (this.config.enableStatisticalValidation) {
            const history = this.edgeCalculator.getStrategyHistory(signal.strategy, signal.symbol);

            if (history.recentTrades && history.recentTrades.length >= 30) {
                const statValidation = this.statisticalValidator.validateSignal(
                    history.recentTrades.map(t => ({
                        profit: t.profit,
                        returnPct: t.returnPct
                    }))
                );

                validation.statistical = statValidation;

                if (!statValidation.valid) {
                    validation.reasons.push('Failed statistical validation');
                    validation.approved = false;
                    return validation;
                }

                validation.reasons.push(`Statistically valid: ${statValidation.passedTests}/${statValidation.totalTests} tests passed`);
            }
        }

        // 3. Calculate recommended position size
        if (validation.edge) {
            const recommendedSize = parseFloat(validation.edge.recommendedPositionSize);
            validation.recommendation = {
                positionSize: recommendedSize,
                riskAmount: signal.entry * recommendedSize * Math.abs(signal.entry - signal.stopLoss) / signal.entry,
                expectedProfit: parseFloat(validation.edge.expectedValue) * recommendedSize
            };
        }

        validation.approved = true;
        validation.reasons.push('✅ Trade approved - has mathematical edge');

        console.log(`\n${validation.approved ? '✅' : '❌'} Validation Result: ${validation.reasons.join(', ')}\n`);

        return validation;
    }

    /**
     * Record completed trade for ongoing analysis
     */
    async recordTrade(trade) {
        // Update edge calculator history
        this.edgeCalculator.updateStrategyHistory(trade);

        // Update real-time monitor
        if (this.config.enableRealTimeMonitoring) {
            this.edgeMonitor.recordTrade(trade);
        }

        this.emit('tradeRecorded', trade);
    }

    /**
     * Run comprehensive backtest with walk-forward optimization
     */
    async runBacktest(historicalData, strategy) {
        console.log('\n📊 Running Comprehensive Backtest with Walk-Forward Optimization...\n');

        const results = await this.backtester.runWalkForward(historicalData, strategy);

        if (results.valid) {
            console.log('✅ Strategy passed walk-forward validation');
        } else {
            console.log('❌ Strategy failed walk-forward validation');
        }

        return results;
    }

    /**
     * Run Monte Carlo simulation on strategy
     */
    async runMonteCarloAnalysis(historicalTrades) {
        console.log('\n🎲 Running Monte Carlo Risk Analysis...\n');

        const analysis = await this.monteCarloSimulator.runSimulation(historicalTrades);

        // Check if risk is acceptable
        const riskOfRuin = parseFloat(analysis.summary.riskOfRuin);
        const expectedReturn = parseFloat(analysis.expected.return);

        const acceptable = riskOfRuin < 1.0 && expectedReturn > 0;

        console.log(`\n${acceptable ? '✅' : '❌'} Monte Carlo Result: ${acceptable ? 'Risk acceptable' : 'Risk too high'}\n`);

        return {
            ...analysis,
            acceptable
        };
    }

    /**
     * Optimize position sizing using Monte Carlo
     */
    async optimizePositionSizing(historicalTrades) {
        console.log('\n🎯 Optimizing Position Size...\n');

        const result = await this.monteCarloSimulator.optimizePositionSize(historicalTrades);

        console.log(`✅ Optimal position size: ${(result.optimalSize * 100).toFixed(1)}%\n`);

        return result;
    }

    /**
     * Get comprehensive edge dashboard
     */
    getEdgeDashboard() {
        return {
            monitor: this.edgeMonitor.getEdgeReport(),
            calculator: this.edgeCalculator.getEdgeReport(),
            timestamp: Date.now()
        };
    }

    /**
     * Print comprehensive edge dashboard
     */
    printDashboard() {
        this.edgeMonitor.printDashboard();
    }

    /**
     * Validate entire strategy before deployment
     */
    async validateStrategy(strategy, historicalData, historicalTrades) {
        console.log('\n' + '='.repeat(70));
        console.log('🎯 COMPREHENSIVE STRATEGY VALIDATION');
        console.log('='.repeat(70));
        console.log(`\nStrategy: ${strategy.name || 'Unknown'}\n`);

        const validation = {
            strategy: strategy.name || 'Unknown',
            passed: false,
            results: {}
        };

        // 1. Statistical validation
        console.log('1️⃣  Statistical Validation...');
        if (historicalTrades && historicalTrades.length >= 30) {
            const statValidation = this.statisticalValidator.validateSignal(historicalTrades);
            validation.results.statistical = statValidation;
            console.log(`   ${statValidation.valid ? '✅' : '❌'} Statistical Tests: ${statValidation.passedTests}/${statValidation.totalTests} passed\n`);
        } else {
            console.log('   ⏭️  Skipped (insufficient data)\n');
        }

        // 2. Walk-forward backtest
        console.log('2️⃣  Walk-Forward Backtest...');
        if (historicalData && historicalData.length >= 252) {
            const backtestResults = await this.runBacktest(historicalData, strategy);
            validation.results.backtest = backtestResults;
            console.log(`   ${backtestResults.valid ? '✅' : '❌'} Walk-Forward: ${backtestResults.valid ? 'PASSED' : 'FAILED'}\n`);
        } else {
            console.log('   ⏭️  Skipped (insufficient data)\n');
        }

        // 3. Monte Carlo simulation
        console.log('3️⃣  Monte Carlo Risk Analysis...');
        if (historicalTrades && historicalTrades.length >= 50) {
            const monteCarloResults = await this.runMonteCarloAnalysis(historicalTrades);
            validation.results.monteCarlo = monteCarloResults;
            console.log(`   ${monteCarloResults.acceptable ? '✅' : '❌'} Risk Analysis: ${monteCarloResults.acceptable ? 'ACCEPTABLE' : 'TOO RISKY'}\n`);
        } else {
            console.log('   ⏭️  Skipped (insufficient data)\n');
        }

        // Overall validation decision
        const testsRun = Object.keys(validation.results).length;
        const testsPassed = Object.values(validation.results).filter(r => {
            return r.valid || r.acceptable || (r.aggregatedResults && r.valid);
        }).length;

        validation.passed = testsPassed >= Math.floor(testsRun * 0.67); // 2/3 must pass

        console.log('='.repeat(70));
        console.log(`\n${validation.passed ? '✅ STRATEGY APPROVED' : '❌ STRATEGY REJECTED'}`);
        console.log(`   Tests Passed: ${testsPassed}/${testsRun}`);
        console.log('='.repeat(70) + '\n');

        return validation;
    }

    /**
     * Get comprehensive performance report
     */
    getPerformanceReport() {
        const edge = this.edgeCalculator.getEdgeReport();
        const monitor = this.edgeMonitor.getEdgeReport();

        return {
            overallEdge: edge.overallEdge,
            strategies: edge.strategies,
            currentMetrics: monitor.current,
            rollingMetrics: monitor.rolling,
            recentAlerts: monitor.recentAlerts,
            timestamp: Date.now()
        };
    }
}

module.exports = MathAdvantageIntegration;
