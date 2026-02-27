/**
 * Example Usage of Math Advantage System
 *
 * This file demonstrates how to use all components of the math advantage system
 * in a real trading scenario.
 */

const MathAdvantageIntegration = require('./math-advantage-integration');
const EnhancedBacktester = require('./enhanced-backtester');
const MonteCarloSimulator = require('./monte-carlo-simulator');

// ============================================================================
// EXAMPLE 1: Complete Strategy Validation Before Deployment
// ============================================================================

async function validateStrategyBeforeDeployment() {
    console.log('\n' + '='.repeat(70));
    console.log('EXAMPLE 1: COMPLETE STRATEGY VALIDATION');
    console.log('='.repeat(70) + '\n');

    // Initialize system
    const mathAdvantage = new MathAdvantageIntegration({
        minExpectedValue: 0.02,
        minWinRate: 0.45,
        minSharpe: 1.0
    });

    // Generate mock historical data
    const backtester = new EnhancedBacktester();
    const historicalData = backtester.generateMockData(252, 0.001); // 1 year, 0.1% daily drift

    // Generate mock trade history
    const historicalTrades = generateMockTrades(50);

    // Define strategy
    const strategy = {
        name: 'Trend Following Example',
        type: 'trendFollowing'
    };

    // Run comprehensive validation
    const validation = await mathAdvantage.validateStrategy(
        strategy,
        historicalData,
        historicalTrades
    );

    if (validation.passed) {
        console.log('✅ Strategy is ready for live trading!');
        return true;
    } else {
        console.log('❌ Strategy needs more work before going live.');
        return false;
    }
}

// ============================================================================
// EXAMPLE 2: Pre-Trade Validation and Position Sizing
// ============================================================================

async function preTradeValidation() {
    console.log('\n' + '='.repeat(70));
    console.log('EXAMPLE 2: PRE-TRADE VALIDATION AND POSITION SIZING');
    console.log('='.repeat(70) + '\n');

    const mathAdvantage = new MathAdvantageIntegration();
    mathAdvantage.start();

    // Simulate having some trade history
    const pastTrades = generateMockTrades(40);
    for (const trade of pastTrades) {
        await mathAdvantage.recordTrade({
            symbol: 'AAPL',
            strategy: 'trendFollowing',
            ...trade
        });
    }

    // New trading signal
    const signal = {
        symbol: 'AAPL',
        strategy: 'trendFollowing',
        direction: 'long',
        entry: 150.00,
        stopLoss: 147.00,
        takeProfit: 156.00,
        confidence: 0.85
    };

    console.log('Testing trade signal:', signal);
    console.log('');

    // Validate signal
    const validation = await mathAdvantage.validateTradeSignal(signal);

    if (validation.approved) {
        console.log('✅ TRADE APPROVED');
        console.log('');
        console.log('Edge Metrics:');
        console.log(`  Expected Value: ${validation.edge.expectedValue}`);
        console.log(`  Win Probability: ${(parseFloat(validation.edge.probabilityOfProfit) * 100).toFixed(1)}%`);
        console.log(`  R:R Ratio: ${validation.edge.rewardRiskRatio}`);
        console.log(`  Kelly Fraction: ${(parseFloat(validation.edge.kellyFraction) * 100).toFixed(1)}%`);
        console.log('');
        console.log('Recommended Position:');
        console.log(`  Position Size: ${(validation.recommendation.positionSize * 100).toFixed(1)}% of capital`);
        console.log(`  Risk Amount: $${validation.recommendation.riskAmount.toFixed(2)}`);
        console.log(`  Expected Profit: $${validation.recommendation.expectedProfit.toFixed(2)}`);
        console.log('');

        // Simulate entering the trade
        const accountBalance = 100000;
        const shares = Math.floor((accountBalance * validation.recommendation.positionSize) / signal.entry);
        console.log(`Executing: BUY ${shares} shares of ${signal.symbol} at $${signal.entry}`);

    } else {
        console.log('❌ TRADE REJECTED');
        console.log('Reasons:', validation.reasons);
    }

    mathAdvantage.stop();
}

// ============================================================================
// EXAMPLE 3: Monte Carlo Risk Analysis
// ============================================================================

async function monteCarloRiskAnalysis() {
    console.log('\n' + '='.repeat(70));
    console.log('EXAMPLE 3: MONTE CARLO RISK ANALYSIS');
    console.log('='.repeat(70) + '\n');

    const simulator = new MonteCarloSimulator({
        simulations: 5000,
        trades: 100,
        initialCapital: 100000
    });

    // Generate mock trade history
    const trades = generateMockTrades(60);

    // Run simulation
    const analysis = await simulator.runSimulation(trades, 100);

    console.log('\nKey Findings:');
    console.log(`  Risk of Ruin: ${analysis.summary.riskOfRuin}`);
    console.log(`  Probability of Profit: ${analysis.summary.probProfit}`);
    console.log(`  Expected Return: ${analysis.expected.return}`);
    console.log(`  Expected Max Drawdown: ${analysis.expected.drawdown}`);

    // Optimize position sizing
    console.log('\nOptimizing Position Size...');
    const optimal = await simulator.optimizePositionSize(trades, [0.02, 0.05, 0.10, 0.15]);

    console.log(`\nRecommended Position Size: ${(optimal.optimalSize * 100).toFixed(0)}%`);
}

// ============================================================================
// EXAMPLE 4: Real-Time Edge Monitoring
// ============================================================================

async function realTimeMonitoring() {
    console.log('\n' + '='.repeat(70));
    console.log('EXAMPLE 4: REAL-TIME EDGE MONITORING');
    console.log('='.repeat(70) + '\n');

    const mathAdvantage = new MathAdvantageIntegration({
        enableRealTimeMonitoring: true,
        minWinRate: 0.45,
        minSharpe: 1.0,
        consecutiveLossesAlert: 5
    });

    mathAdvantage.start();

    // Set up alert listeners
    mathAdvantage.on('criticalAlert', (alerts) => {
        console.log('\n🚨 CRITICAL ALERT RECEIVED:');
        for (const alert of alerts) {
            console.log(`   ${alert.message}`);
        }
        console.log('\nAction Required: Consider reducing position sizes or stopping trading temporarily.\n');
    });

    mathAdvantage.on('edgeDegradation', (degradations) => {
        console.log('\n⚠️  EDGE DEGRADATION DETECTED:');
        for (const deg of degradations) {
            console.log(`   ${deg.metric}: ${deg.rolling} (was ${deg.current}) - ${deg.decline} decline`);
        }
        console.log('\nAction: Monitor closely and consider parameter adjustment.\n');
    });

    // Simulate trading activity
    console.log('Simulating 30 trades...\n');
    const trades = generateMockTrades(30);

    for (let i = 0; i < trades.length; i++) {
        await mathAdvantage.recordTrade({
            symbol: 'AAPL',
            strategy: 'trendFollowing',
            ...trades[i]
        });

        if ((i + 1) % 10 === 0) {
            console.log(`\nAfter ${i + 1} trades:`);
            mathAdvantage.printDashboard();
        }
    }

    mathAdvantage.stop();
}

// ============================================================================
// EXAMPLE 5: Walk-Forward Backtest
// ============================================================================

async function walkForwardBacktest() {
    console.log('\n' + '='.repeat(70));
    console.log('EXAMPLE 5: WALK-FORWARD BACKTEST');
    console.log('='.repeat(70) + '\n');

    const backtester = new EnhancedBacktester({
        inSampleRatio: 0.70,
        walkForwardSteps: 5,
        minSharpe: 1.0,
        minWinRate: 0.45
    });

    // Generate 2 years of data
    const historicalData = backtester.generateMockData(504, 0.001); // 2 years

    const strategy = {
        name: 'Trend Following'
    };

    // Run walk-forward optimization
    const results = await backtester.runWalkForward(historicalData, strategy);

    if (results.valid) {
        console.log('\n✅ Strategy passed walk-forward validation');
        console.log('   This means the strategy is robust across different time periods');
        console.log('   and is less likely to be overfit to historical data.');
    } else {
        console.log('\n❌ Strategy failed walk-forward validation');
        console.log('   The strategy may be overfit to historical data.');
        console.log('   Consider simplifying the strategy or using different parameters.');
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate mock trades for testing
 */
function generateMockTrades(count, winRate = 0.55) {
    const trades = [];

    for (let i = 0; i < count; i++) {
        const isWin = Math.random() < winRate;

        if (isWin) {
            // Winning trade
            const profit = 50 + Math.random() * 150; // $50-$200 profit
            const returnPct = 1.5 + Math.random() * 2.5; // 1.5%-4% return

            trades.push({
                profit,
                returnPct,
                entry: 150,
                exit: 150 * (1 + returnPct / 100),
                timestamp: Date.now() - (count - i) * 86400000 // Days ago
            });
        } else {
            // Losing trade
            const profit = -(25 + Math.random() * 75); // -$25 to -$100 loss
            const returnPct = -(0.5 + Math.random() * 1.5); // -0.5% to -2% loss

            trades.push({
                profit,
                returnPct,
                entry: 150,
                exit: 150 * (1 + returnPct / 100),
                timestamp: Date.now() - (count - i) * 86400000
            });
        }
    }

    return trades;
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
    console.log('\n' + '█'.repeat(70));
    console.log('MATH ADVANTAGE SYSTEM - USAGE EXAMPLES');
    console.log('█'.repeat(70));

    try {
        // Example 1: Strategy Validation
        await validateStrategyBeforeDeployment();
        await sleep(1000);

        // Example 2: Pre-Trade Validation
        await preTradeValidation();
        await sleep(1000);

        // Example 3: Monte Carlo
        await monteCarloRiskAnalysis();
        await sleep(1000);

        // Example 4: Real-Time Monitoring
        await realTimeMonitoring();
        await sleep(1000);

        // Example 5: Walk-Forward Backtest
        await walkForwardBacktest();

        console.log('\n' + '█'.repeat(70));
        console.log('ALL EXAMPLES COMPLETED SUCCESSFULLY');
        console.log('█'.repeat(70) + '\n');

    } catch (error) {
        console.error('\nError running examples:', error);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run examples if this file is executed directly
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    validateStrategyBeforeDeployment,
    preTradeValidation,
    monteCarloRiskAnalysis,
    realTimeMonitoring,
    walkForwardBacktest
};
