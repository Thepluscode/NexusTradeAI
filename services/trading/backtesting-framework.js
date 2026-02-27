/**
 * WEEK 4+ IMPROVEMENT: Backtesting Framework
 *
 * Allows testing strategies on historical data to validate profitability
 * before risking real capital.
 */

class BacktestingFramework {
    constructor(config = {}) {
        this.config = {
            startDate: config.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
            endDate: config.endDate || new Date(),
            initialCapital: config.initialCapital || 100000,
            symbols: config.symbols || ['AAPL', 'MSFT', 'GOOGL'],
            strategies: config.strategies || ['trendFollowing'],
            commission: config.commission || 0.001, // 0.1% per trade
            slippage: config.slippage || 0.0005 // 0.05% slippage
        };

        this.trades = [];
        this.equity = [{ date: this.config.startDate, value: this.config.initialCapital }];
        this.positions = new Map();
    }

    /**
     * Run backtest on historical data
     */
    async run(historicalData) {
        console.log('\n📊 Starting Backtest...');
        console.log(`   Period: ${this.config.startDate.toISOString()} to ${this.config.endDate.toISOString()}`);
        console.log(`   Initial Capital: $${this.config.initialCapital.toLocaleString()}`);
        console.log(`   Symbols: ${this.config.symbols.join(', ')}`);

        let currentCapital = this.config.initialCapital;
        const dates = this.generateDateRange(this.config.startDate, this.config.endDate);

        for (const date of dates) {
            // Simulate market data for this date
            const marketData = this.getMarketDataForDate(historicalData, date);

            // Run strategy logic
            for (const strategy of this.config.strategies) {
                await this.executeStrategy(strategy, marketData, date);
            }

            // Update positions and calculate equity
            currentCapital = this.updatePositions(marketData, date);
            this.equity.push({ date, value: currentCapital });
        }

        // Generate backtest report
        return this.generateReport();
    }

    /**
     * Execute a strategy for a given date
     */
    async executeStrategy(strategyName, marketData, date) {
        // This would call your actual strategy logic
        // For now, simplified example
        for (const symbol of this.config.symbols) {
            const data = marketData[symbol];
            if (!data) continue;

            // Simple trend-following logic for backtest
            const signal = this.calculateSignal(data);

            if (signal === 'BUY' && !this.positions.has(symbol)) {
                this.enterPosition(symbol, data.price, date, 'long');
            } else if (signal === 'SELL' && this.positions.has(symbol)) {
                this.exitPosition(symbol, data.price, date);
            }
        }
    }

    /**
     * Calculate trading signal
     */
    calculateSignal(data) {
        // Simplified: Buy if price > SMA, sell if price < SMA
        if (data.price > data.sma20) return 'BUY';
        if (data.price < data.sma20) return 'SELL';
        return 'HOLD';
    }

    /**
     * Enter a position
     */
    enterPosition(symbol, price, date, direction) {
        const positionSize = this.config.initialCapital * 0.1; // 10% per position
        const shares = Math.floor(positionSize / price);
        const cost = shares * price * (1 + this.config.commission + this.config.slippage);

        this.positions.set(symbol, {
            symbol,
            shares,
            entryPrice: price,
            entryDate: date,
            direction,
            cost
        });

        console.log(`   📈 ENTER ${symbol}: ${shares} shares @ $${price.toFixed(2)} on ${date.toISOString().split('T')[0]}`);
    }

    /**
     * Exit a position
     */
    exitPosition(symbol, price, date) {
        const position = this.positions.get(symbol);
        if (!position) return;

        const proceeds = position.shares * price * (1 - this.config.commission - this.config.slippage);
        const profit = proceeds - position.cost;
        const profitPercent = (profit / position.cost) * 100;

        this.trades.push({
            symbol,
            entryDate: position.entryDate,
            exitDate: date,
            entryPrice: position.entryPrice,
            exitPrice: price,
            shares: position.shares,
            profit,
            profitPercent
        });

        this.positions.delete(symbol);

        console.log(`   📉 EXIT ${symbol}: ${position.shares} shares @ $${price.toFixed(2)} | P/L: $${profit.toFixed(2)} (${profitPercent.toFixed(2)}%)`);
    }

    /**
     * Update all positions and calculate current equity
     */
    updatePositions(marketData, date) {
        let totalValue = this.config.initialCapital;

        for (const [symbol, position] of this.positions) {
            const currentPrice = marketData[symbol]?.price || position.entryPrice;
            const currentValue = position.shares * currentPrice;
            totalValue += (currentValue - position.cost);
        }

        return totalValue;
    }

    /**
     * Generate backtest report
     */
    generateReport() {
        const totalTrades = this.trades.length;
        const winningTrades = this.trades.filter(t => t.profit > 0);
        const losingTrades = this.trades.filter(t => t.profit <= 0);

        const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
        const totalWins = winningTrades.reduce((sum, t) => sum + t.profit, 0);
        const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

        const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
        const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

        const finalEquity = this.equity[this.equity.length - 1].value;
        const totalReturn = ((finalEquity - this.config.initialCapital) / this.config.initialCapital) * 100;

        // Calculate max drawdown
        let maxDrawdown = 0;
        let peak = this.config.initialCapital;

        for (const point of this.equity) {
            if (point.value > peak) peak = point.value;
            const drawdown = ((peak - point.value) / peak) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        const report = {
            summary: {
                initialCapital: this.config.initialCapital,
                finalEquity,
                totalReturn: totalReturn.toFixed(2),
                totalProfit: totalProfit.toFixed(2),
                maxDrawdown: maxDrawdown.toFixed(2)
            },
            trades: {
                total: totalTrades,
                winning: winningTrades.length,
                losing: losingTrades.length,
                winRate: winRate.toFixed(2)
            },
            performance: {
                avgWin: avgWin.toFixed(2),
                avgLoss: avgLoss.toFixed(2),
                profitFactor: profitFactor.toFixed(2),
                largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profit)).toFixed(2) : 0,
                largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profit)).toFixed(2) : 0
            },
            equity: this.equity,
            allTrades: this.trades
        };

        this.printReport(report);
        return report;
    }

    /**
     * Print backtest report
     */
    printReport(report) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 BACKTEST RESULTS');
        console.log('='.repeat(60));
        console.log('\n💰 SUMMARY:');
        console.log(`   Initial Capital:  $${Number(report.summary.initialCapital).toLocaleString()}`);
        console.log(`   Final Equity:     $${Number(report.summary.finalEquity).toLocaleString()}`);
        console.log(`   Total Return:     ${report.summary.totalReturn}%`);
        console.log(`   Total Profit:     $${report.summary.totalProfit}`);
        console.log(`   Max Drawdown:     ${report.summary.maxDrawdown}%`);

        console.log('\n📈 TRADES:');
        console.log(`   Total Trades:     ${report.trades.total}`);
        console.log(`   Winning Trades:   ${report.trades.winning}`);
        console.log(`   Losing Trades:    ${report.trades.losing}`);
        console.log(`   Win Rate:         ${report.trades.winRate}%`);

        console.log('\n💵 PERFORMANCE:');
        console.log(`   Avg Win:          $${report.performance.avgWin}`);
        console.log(`   Avg Loss:         $${report.performance.avgLoss}`);
        console.log(`   Profit Factor:    ${report.performance.profitFactor}`);
        console.log(`   Largest Win:      $${report.performance.largestWin}`);
        console.log(`   Largest Loss:     $${report.performance.largestLoss}`);
        console.log('='.repeat(60) + '\n');
    }

    /**
     * Helper: Generate date range
     */
    generateDateRange(start, end) {
        const dates = [];
        const current = new Date(start);

        while (current <= end) {
            // Only trading days (skip weekends for simplicity)
            if (current.getDay() !== 0 && current.getDay() !== 6) {
                dates.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }

        return dates;
    }

    /**
     * Helper: Get market data for specific date (mock for now)
     */
    getMarketDataForDate(historicalData, date) {
        // In production, this would fetch actual historical data
        // For now, return mock data
        const mockData = {};
        for (const symbol of this.config.symbols) {
            mockData[symbol] = {
                price: 150 + Math.random() * 50,
                sma20: 160 + Math.random() * 40,
                volume: 1000000 + Math.random() * 500000
            };
        }
        return mockData;
    }
}

module.exports = BacktestingFramework;
