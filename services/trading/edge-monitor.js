/**
 * Real-Time Edge Monitoring System
 *
 * Continuously monitors trading edge and alerts when edge degrades.
 * Tracks key mathematical metrics in real-time to ensure continued profitability.
 *
 * Monitored Metrics:
 * 1. Win Rate - Real-time vs Historical
 * 2. Expectancy - Current vs Expected
 * 3. Sharpe Ratio - Rolling Sharpe
 * 4. Profit Factor - Win/Loss ratio
 * 5. Edge Ratio - EV/Risk
 * 6. Statistical Significance - P-values
 * 7. Kelly Criterion - Optimal sizing
 */

const EventEmitter = require('events');

class EdgeMonitor extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Monitoring intervals
            updateInterval: config.updateInterval || 60000, // 1 minute
            alertCheckInterval: config.alertCheckInterval || 300000, // 5 minutes

            // Alert thresholds
            minWinRate: config.minWinRate || 0.45, // 45%
            minSharpe: config.minSharpe || 1.0,
            minProfitFactor: config.minProfitFactor || 1.2,
            minExpectancy: config.minExpectancy || 0,
            maxDrawdown: config.maxDrawdown || 0.15, // 15%

            // Edge degradation thresholds
            winRateDeclineThreshold: config.winRateDeclineThreshold || 0.10, // 10% decline
            sharpeDeclineThreshold: config.sharpeDeclineThreshold || 0.30, // 30% decline
            consecutiveLossesAlert: config.consecutiveLossesAlert || 5,

            // Rolling window for metrics
            rollingWindow: config.rollingWindow || 30, // Last 30 trades

            ...config
        };

        this.metrics = {
            current: {},
            historical: {},
            rolling: {},
            alerts: []
        };

        this.tradeHistory = [];
        this.monitoringActive = false;
        this.intervalId = null;
        this.alertIntervalId = null;
    }

    /**
     * Start real-time monitoring
     */
    start() {
        if (this.monitoringActive) {
            console.log('⚠️  Edge monitoring already active');
            return;
        }

        console.log('🔍 Starting real-time edge monitoring...');
        this.monitoringActive = true;

        // Update metrics regularly
        this.intervalId = setInterval(() => {
            this.updateMetrics();
        }, this.config.updateInterval);

        // Check for alerts
        this.alertIntervalId = setInterval(() => {
            this.checkAlerts();
        }, this.config.alertCheckInterval);

        this.emit('monitoringStarted');
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (!this.monitoringActive) return;

        console.log('🛑 Stopping edge monitoring...');
        this.monitoringActive = false;

        if (this.intervalId) clearInterval(this.intervalId);
        if (this.alertIntervalId) clearInterval(this.alertIntervalId);

        this.emit('monitoringStopped');
    }

    /**
     * Record a completed trade
     */
    recordTrade(trade) {
        const { profit, symbol, strategy, entry, exit, timestamp } = trade;

        const tradeRecord = {
            profit,
            symbol,
            strategy,
            entry,
            exit,
            returnPct: ((exit - entry) / entry) * 100,
            isWin: profit > 0,
            timestamp: timestamp || Date.now()
        };

        this.tradeHistory.push(tradeRecord);

        // Keep only recent history (e.g., last 1000 trades)
        if (this.tradeHistory.length > 1000) {
            this.tradeHistory.shift();
        }

        // Update metrics immediately after trade
        this.updateMetrics();

        this.emit('tradeRecorded', tradeRecord);
    }

    /**
     * Update all edge metrics
     */
    updateMetrics() {
        if (this.tradeHistory.length === 0) return;

        const allTrades = this.tradeHistory;
        const recentTrades = allTrades.slice(-this.config.rollingWindow);

        // Calculate current metrics (all history)
        this.metrics.current = this.calculateMetrics(allTrades);

        // Calculate rolling metrics (recent window)
        if (recentTrades.length >= 10) {
            this.metrics.rolling = this.calculateMetrics(recentTrades);
        }

        // Detect edge degradation
        this.detectEdgeDegradation();

        this.emit('metricsUpdated', {
            current: this.metrics.current,
            rolling: this.metrics.rolling
        });
    }

    /**
     * Calculate comprehensive edge metrics
     */
    calculateMetrics(trades) {
        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                expectancy: 0,
                sharpe: 0,
                profitFactor: 0,
                edgeRatio: 0
            };
        }

        const wins = trades.filter(t => t.isWin);
        const losses = trades.filter(t => !t.isWin);

        const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
        const totalWins = wins.reduce((sum, t) => sum + t.profit, 0);
        const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));

        const winRate = wins.length / trades.length;
        const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
        const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;

        const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

        // Calculate Sharpe ratio
        const returns = trades.map(t => t.returnPct / 100);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

        // Edge ratio (expectancy relative to average loss)
        const edgeRatio = avgLoss > 0 ? expectancy / avgLoss : 0;

        // Consecutive wins/losses
        let maxConsecutiveLosses = 0;
        let currentLossStreak = 0;
        for (const trade of trades) {
            if (trade.isWin) {
                currentLossStreak = 0;
            } else {
                currentLossStreak++;
                maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
            }
        }

        // Drawdown
        let peak = 0;
        let maxDrawdown = 0;
        let runningTotal = 0;
        for (const trade of trades) {
            runningTotal += trade.profit;
            if (runningTotal > peak) peak = runningTotal;
            const drawdown = peak > 0 ? (peak - runningTotal) / peak : 0;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }

        // Kelly criterion
        const kelly = avgLoss > 0 ? (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin : 0;

        return {
            totalTrades: trades.length,
            winningTrades: wins.length,
            losingTrades: losses.length,
            winRate: winRate,
            avgWin: avgWin,
            avgLoss: avgLoss,
            expectancy: expectancy,
            profitFactor: profitFactor,
            sharpe: sharpe,
            edgeRatio: edgeRatio,
            totalProfit: totalProfit,
            maxConsecutiveLosses: maxConsecutiveLosses,
            maxDrawdown: maxDrawdown,
            kellyCriterion: Math.max(0, kelly)
        };
    }

    /**
     * Detect edge degradation by comparing rolling vs historical metrics
     */
    detectEdgeDegradation() {
        if (!this.metrics.rolling || !this.metrics.current) return;

        const current = this.metrics.current;
        const rolling = this.metrics.rolling;

        const degradations = [];

        // Check win rate decline
        if (current.winRate > 0 && rolling.winRate < current.winRate * (1 - this.config.winRateDeclineThreshold)) {
            degradations.push({
                metric: 'Win Rate',
                current: (current.winRate * 100).toFixed(1) + '%',
                rolling: (rolling.winRate * 100).toFixed(1) + '%',
                decline: (((current.winRate - rolling.winRate) / current.winRate) * 100).toFixed(1) + '%',
                severity: 'warning'
            });
        }

        // Check Sharpe ratio decline
        if (current.sharpe > 0 && rolling.sharpe < current.sharpe * (1 - this.config.sharpeDeclineThreshold)) {
            degradations.push({
                metric: 'Sharpe Ratio',
                current: current.sharpe.toFixed(2),
                rolling: rolling.sharpe.toFixed(2),
                decline: (((current.sharpe - rolling.sharpe) / current.sharpe) * 100).toFixed(1) + '%',
                severity: 'warning'
            });
        }

        // Check expectancy
        if (rolling.expectancy < this.config.minExpectancy) {
            degradations.push({
                metric: 'Expectancy',
                rolling: rolling.expectancy.toFixed(2),
                threshold: this.config.minExpectancy,
                severity: 'critical'
            });
        }

        // Check consecutive losses
        if (rolling.maxConsecutiveLosses >= this.config.consecutiveLossesAlert) {
            degradations.push({
                metric: 'Consecutive Losses',
                count: rolling.maxConsecutiveLosses,
                threshold: this.config.consecutiveLossesAlert,
                severity: 'critical'
            });
        }

        if (degradations.length > 0) {
            this.emit('edgeDegradation', degradations);
        }
    }

    /**
     * Check for critical alerts
     */
    checkAlerts() {
        if (!this.metrics.rolling || this.metrics.rolling.totalTrades < 10) return;

        const metrics = this.metrics.rolling;
        const alerts = [];

        // Win rate too low
        if (metrics.winRate < this.config.minWinRate) {
            alerts.push({
                type: 'LOW_WIN_RATE',
                severity: 'critical',
                message: `Win rate (${(metrics.winRate * 100).toFixed(1)}%) below minimum (${(this.config.minWinRate * 100).toFixed(0)}%)`,
                current: metrics.winRate,
                threshold: this.config.minWinRate,
                timestamp: Date.now()
            });
        }

        // Sharpe ratio too low
        if (metrics.sharpe < this.config.minSharpe) {
            alerts.push({
                type: 'LOW_SHARPE',
                severity: 'warning',
                message: `Sharpe ratio (${metrics.sharpe.toFixed(2)}) below minimum (${this.config.minSharpe})`,
                current: metrics.sharpe,
                threshold: this.config.minSharpe,
                timestamp: Date.now()
            });
        }

        // Profit factor too low
        if (metrics.profitFactor < this.config.minProfitFactor) {
            alerts.push({
                type: 'LOW_PROFIT_FACTOR',
                severity: 'warning',
                message: `Profit factor (${metrics.profitFactor.toFixed(2)}) below minimum (${this.config.minProfitFactor})`,
                current: metrics.profitFactor,
                threshold: this.config.minProfitFactor,
                timestamp: Date.now()
            });
        }

        // Negative expectancy
        if (metrics.expectancy < 0) {
            alerts.push({
                type: 'NEGATIVE_EXPECTANCY',
                severity: 'critical',
                message: `Negative expectancy ($${metrics.expectancy.toFixed(2)}) - strategy has no edge!`,
                current: metrics.expectancy,
                timestamp: Date.now()
            });
        }

        // Max drawdown exceeded
        if (metrics.maxDrawdown > this.config.maxDrawdown) {
            alerts.push({
                type: 'MAX_DRAWDOWN_EXCEEDED',
                severity: 'critical',
                message: `Max drawdown (${(metrics.maxDrawdown * 100).toFixed(1)}%) exceeds limit (${(this.config.maxDrawdown * 100).toFixed(0)}%)`,
                current: metrics.maxDrawdown,
                threshold: this.config.maxDrawdown,
                timestamp: Date.now()
            });
        }

        // Store and emit alerts
        if (alerts.length > 0) {
            this.metrics.alerts.push(...alerts);

            // Keep only recent alerts (last 100)
            if (this.metrics.alerts.length > 100) {
                this.metrics.alerts = this.metrics.alerts.slice(-100);
            }

            this.emit('criticalAlert', alerts);

            // Log critical alerts
            for (const alert of alerts) {
                if (alert.severity === 'critical') {
                    console.log(`\n🚨 CRITICAL ALERT: ${alert.message}\n`);
                } else {
                    console.log(`\n⚠️  WARNING: ${alert.message}\n`);
                }
            }
        }
    }

    /**
     * Get comprehensive edge report
     */
    getEdgeReport() {
        return {
            current: this.metrics.current,
            rolling: this.metrics.rolling,
            recentAlerts: this.metrics.alerts.slice(-10),
            tradeCount: this.tradeHistory.length,
            monitoringActive: this.monitoringActive,
            timestamp: Date.now()
        };
    }

    /**
     * Print edge dashboard
     */
    printDashboard() {
        const current = this.metrics.current;
        const rolling = this.metrics.rolling;

        if (!current || current.totalTrades === 0) {
            console.log('\n📊 Edge Dashboard: No trades yet\n');
            return;
        }

        console.log('\n' + '='.repeat(70));
        console.log('📊 REAL-TIME EDGE DASHBOARD');
        console.log('='.repeat(70));

        console.log(`\n📈 OVERALL PERFORMANCE (${current.totalTrades} trades):`);
        console.log(`   Win Rate:       ${(current.winRate * 100).toFixed(1)}% ${this.getIndicator(current.winRate, this.config.minWinRate)}`);
        console.log(`   Expectancy:     $${current.expectancy.toFixed(2)} ${this.getIndicator(current.expectancy, this.config.minExpectancy)}`);
        console.log(`   Profit Factor:  ${current.profitFactor.toFixed(2)} ${this.getIndicator(current.profitFactor, this.config.minProfitFactor)}`);
        console.log(`   Sharpe Ratio:   ${current.sharpe.toFixed(2)} ${this.getIndicator(current.sharpe, this.config.minSharpe)}`);
        console.log(`   Edge Ratio:     ${current.edgeRatio.toFixed(2)}`);
        console.log(`   Total Profit:   $${current.totalProfit.toFixed(2)}`);
        console.log(`   Max Drawdown:   ${(current.maxDrawdown * 100).toFixed(1)}%`);
        console.log(`   Kelly Criterion: ${(current.kellyCriterion * 100).toFixed(1)}%`);

        if (rolling && rolling.totalTrades >= 10) {
            console.log(`\n📊 ROLLING ${this.config.rollingWindow}-TRADE WINDOW:`);
            console.log(`   Win Rate:       ${(rolling.winRate * 100).toFixed(1)}% ${this.getIndicator(rolling.winRate, this.config.minWinRate)}`);
            console.log(`   Expectancy:     $${rolling.expectancy.toFixed(2)} ${this.getIndicator(rolling.expectancy, this.config.minExpectancy)}`);
            console.log(`   Profit Factor:  ${rolling.profitFactor.toFixed(2)} ${this.getIndicator(rolling.profitFactor, this.config.minProfitFactor)}`);
            console.log(`   Sharpe Ratio:   ${rolling.sharpe.toFixed(2)} ${this.getIndicator(rolling.sharpe, this.config.minSharpe)}`);
            console.log(`   Consecutive Losses: ${rolling.maxConsecutiveLosses}`);

            // Show trend
            const winRateTrend = this.getTrend(current.winRate, rolling.winRate);
            const sharpeTrend = this.getTrend(current.sharpe, rolling.sharpe);
            console.log(`\n📉 TRENDS:`);
            console.log(`   Win Rate:   ${winRateTrend}`);
            console.log(`   Sharpe:     ${sharpeTrend}`);
        }

        if (this.metrics.alerts.length > 0) {
            const recentAlerts = this.metrics.alerts.slice(-5);
            console.log(`\n🚨 RECENT ALERTS (${this.metrics.alerts.length} total):`);
            for (const alert of recentAlerts) {
                const icon = alert.severity === 'critical' ? '🔴' : '🟡';
                console.log(`   ${icon} ${alert.message}`);
            }
        }

        console.log('\n' + '='.repeat(70) + '\n');
    }

    /**
     * Get indicator (✅ or ❌) based on threshold
     */
    getIndicator(value, threshold) {
        return value >= threshold ? '✅' : '❌';
    }

    /**
     * Get trend indicator
     */
    getTrend(historical, current) {
        if (historical === 0) return '—';
        const change = ((current - historical) / historical) * 100;
        if (Math.abs(change) < 2) return '→ Stable';
        if (change > 0) return `↑ Up ${Math.abs(change).toFixed(1)}%`;
        return `↓ Down ${Math.abs(change).toFixed(1)}%`;
    }

    /**
     * Export metrics for external dashboards
     */
    exportMetrics() {
        return {
            metrics: this.metrics,
            trades: this.tradeHistory.slice(-100), // Last 100 trades
            config: this.config
        };
    }
}

module.exports = EdgeMonitor;
