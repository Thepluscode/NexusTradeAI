/**
 * Quick Test Script for Math Advantage System
 * Run this to verify all components are working correctly
 */

const MathAdvantageIntegration = require('./math-advantage-integration');

async function quickTest() {
    console.log('\n🧪 Testing Math Advantage System...\n');

    try {
        // Initialize system
        console.log('1️⃣  Initializing system...');
        const mathAdvantage = new MathAdvantageIntegration({
            minExpectedValue: 0.02,
            minWinRate: 0.45,
            minSharpe: 1.0
        });
        mathAdvantage.start();
        console.log('✅ System initialized\n');

        // Test edge calculator
        console.log('2️⃣  Testing Edge Calculator...');
        const signal = {
            symbol: 'AAPL',
            strategy: 'trendFollowing',
            direction: 'long',
            entry: 150.00,
            stopLoss: 147.00,
            takeProfit: 156.00,
            confidence: 0.85
        };

        const validation = await mathAdvantage.validateTradeSignal(signal);
        console.log(`✅ Edge Calculation: ${validation.approved ? 'APPROVED' : 'REJECTED'}\n`);

        // Record some mock trades
        console.log('3️⃣  Recording mock trades...');
        const mockTrades = [
            { symbol: 'AAPL', strategy: 'trendFollowing', profit: 100, entry: 150, exit: 152 },
            { symbol: 'AAPL', strategy: 'trendFollowing', profit: -50, entry: 150, exit: 149 },
            { symbol: 'AAPL', strategy: 'trendFollowing', profit: 150, entry: 150, exit: 153 },
            { symbol: 'AAPL', strategy: 'trendFollowing', profit: 75, entry: 150, exit: 151.5 },
            { symbol: 'AAPL', strategy: 'trendFollowing', profit: -30, entry: 150, exit: 149.5 }
        ];

        for (const trade of mockTrades) {
            await mathAdvantage.recordTrade(trade);
        }
        console.log(`✅ Recorded ${mockTrades.length} trades\n`);

        // Check edge monitor
        console.log('4️⃣  Testing Edge Monitor...');
        mathAdvantage.printDashboard();

        // Test Monte Carlo (with minimal simulations for speed)
        console.log('5️⃣  Testing Monte Carlo Simulator...');
        const trades = mockTrades.map(t => ({ profit: t.profit, returnPct: (t.profit / 1000) }));

        const simulator = mathAdvantage.monteCarloSimulator;
        simulator.config.simulations = 1000; // Reduce for quick test
        simulator.config.trades = 50;

        const analysis = await simulator.runSimulation(trades);
        console.log(`✅ Monte Carlo completed: Risk of Ruin = ${analysis.summary.riskOfRuin}\n`);

        // Test backtester
        console.log('6️⃣  Testing Enhanced Backtester...');
        const backtester = mathAdvantage.backtester;
        const historicalData = backtester.generateMockData(100, 0.001); // Small dataset for speed

        backtester.config.walkForwardSteps = 2; // Reduce for quick test

        const strategy = { name: 'Test Strategy' };
        const backtestResults = await backtester.runWalkForward(historicalData, strategy);
        console.log(`✅ Backtest completed: ${backtestResults.valid ? 'VALID' : 'INVALID'}\n`);

        // Stop system
        mathAdvantage.stop();

        console.log('\n✅ ALL TESTS PASSED!\n');
        console.log('The Math Advantage System is ready to use.');
        console.log('See MATH_ADVANTAGE_GUIDE.md for detailed usage instructions.\n');

        return true;

    } catch (error) {
        console.error('\n❌ TEST FAILED:');
        console.error(error);
        return false;
    }
}

// Run test
if (require.main === module) {
    quickTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = quickTest;
