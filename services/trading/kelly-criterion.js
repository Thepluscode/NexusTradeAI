/**
 * Kelly Criterion Position Sizing Calculator
 * 
 * 20X ENGINEER QUALITY - Production-Grade Implementation
 * 
 * The Kelly Criterion calculates the optimal bet size to maximize
 * long-term wealth growth while avoiding ruin.
 * 
 * Formula: Kelly% = W - [(1-W) / R]
 * Where:
 *   W = Win Rate (probability of winning)
 *   R = Win/Loss Ratio (avg win / avg loss)
 * 
 * We use HALF-KELLY for safety (50% of optimal to reduce volatility)
 * 
 * Usage:
 *   const kelly = new KellyCalculator();
 *   kelly.recordTrade({ pnl: 150, isWinner: true });
 *   const optimalSize = kelly.getOptimalPositionSize(equity);
 */

const fs = require('fs');
const path = require('path');

class KellyCalculator {
    constructor(config = {}) {
        // Configuration
        this.config = {
            // Kelly fraction (0.5 = Half-Kelly, 1.0 = Full Kelly)
            kellyFraction: config.kellyFraction || 0.5,

            // Minimum trades needed before using Kelly
            minTrades: config.minTrades || 20,

            // Absolute position size limits (as % of equity)
            minPositionPct: config.minPositionPct || 0.01,  // 1% minimum
            maxPositionPct: config.maxPositionPct || 0.15,  // 15% maximum

            // Default position size when insufficient data
            defaultPositionPct: config.defaultPositionPct || 0.05, // 5% default

            // Rolling window for calculations (recent trades matter more)
            rollingWindow: config.rollingWindow || 50,

            // Data persistence
            dataFile: config.dataFile || null
        };

        // Trade history
        this.trades = [];

        // Cached calculations
        this.cachedStats = null;
        this.cacheExpiry = null;

        // Load historical data if available
        if (this.config.dataFile) {
            this.loadData();
        }
    }

    // ========================================
    // TRADE RECORDING
    // ========================================

    /**
     * Record a completed trade
     * @param {Object} trade - Trade details
     * @param {number} trade.pnl - Profit/loss amount
     * @param {boolean} trade.isWinner - Whether trade was profitable
     * @param {number} trade.entryPrice - Entry price (optional)
     * @param {number} trade.exitPrice - Exit price (optional)
     * @param {string} trade.symbol - Symbol traded (optional)
     */
    recordTrade(trade) {
        const tradeRecord = {
            timestamp: new Date().toISOString(),
            pnl: trade.pnl,
            isWinner: trade.pnl > 0,
            pnlPercent: trade.pnlPercent || null,
            symbol: trade.symbol || null,
            entryPrice: trade.entryPrice || null,
            exitPrice: trade.exitPrice || null
        };

        this.trades.push(tradeRecord);

        // Keep only rolling window
        if (this.trades.length > this.config.rollingWindow) {
            this.trades = this.trades.slice(-this.config.rollingWindow);
        }

        // Invalidate cache
        this.cachedStats = null;

        // Persist data
        this.saveData();

        return tradeRecord;
    }

    // ========================================
    // KELLY CALCULATION
    // ========================================

    /**
     * Calculate Kelly Criterion percentage
     * @returns {Object} Kelly stats including optimal bet size
     */
    calculateKelly() {
        // Check cache
        const now = Date.now();
        if (this.cachedStats && this.cacheExpiry && now < this.cacheExpiry) {
            return this.cachedStats;
        }

        const stats = this.getTradeStats();

        if (stats.totalTrades < this.config.minTrades) {
            // Not enough data - return default
            return {
                insufficientData: true,
                totalTrades: stats.totalTrades,
                requiredTrades: this.config.minTrades,
                recommendedPct: this.config.defaultPositionPct,
                message: `Need ${this.config.minTrades - stats.totalTrades} more trades for Kelly calculation`
            };
        }

        const W = stats.winRate;
        const R = stats.winLossRatio;

        // Kelly Formula: K = W - [(1-W) / R]
        let kellyPct = W - ((1 - W) / R);

        // Handle edge cases
        if (!isFinite(kellyPct) || isNaN(kellyPct) || kellyPct < 0) {
            kellyPct = 0;
        }

        // Apply Kelly fraction (Half-Kelly for safety)
        const fractionalKelly = kellyPct * this.config.kellyFraction;

        // Apply absolute limits
        let finalPct = Math.max(
            this.config.minPositionPct,
            Math.min(this.config.maxPositionPct, fractionalKelly)
        );

        const result = {
            insufficientData: false,
            totalTrades: stats.totalTrades,

            // Win/Loss Stats
            winRate: W,
            winLossRatio: R,
            avgWin: stats.avgWin,
            avgLoss: stats.avgLoss,

            // Kelly Calculation
            fullKellyPct: kellyPct,
            kellyFraction: this.config.kellyFraction,
            fractionalKellyPct: fractionalKelly,

            // Final Recommendation
            recommendedPct: finalPct,
            minPct: this.config.minPositionPct,
            maxPct: this.config.maxPositionPct,

            // Interpretation
            edgeStrength: this.interpretEdge(kellyPct),
            message: this.getKellyMessage(kellyPct, finalPct)
        };

        // Cache for 5 minutes
        this.cachedStats = result;
        this.cacheExpiry = now + (5 * 60 * 1000);

        return result;
    }

    /**
     * Get optimal position size in dollars
     * @param {number} equity - Current account equity
     * @returns {Object} Position sizing recommendation
     */
    getOptimalPositionSize(equity) {
        const kelly = this.calculateKelly();

        return {
            ...kelly,
            equity,
            optimalDollarSize: equity * kelly.recommendedPct,
            minDollarSize: equity * this.config.minPositionPct,
            maxDollarSize: equity * this.config.maxPositionPct
        };
    }

    // ========================================
    // TRADE STATISTICS
    // ========================================

    getTradeStats() {
        if (this.trades.length === 0) {
            return {
                totalTrades: 0,
                winners: 0,
                losers: 0,
                winRate: 0,
                avgWin: 0,
                avgLoss: 0,
                winLossRatio: 0,
                expectancy: 0
            };
        }

        const winners = this.trades.filter(t => t.isWinner);
        const losers = this.trades.filter(t => !t.isWinner);

        const totalTrades = this.trades.length;
        const winRate = winners.length / totalTrades;

        const avgWin = winners.length > 0
            ? winners.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / winners.length
            : 0;

        const avgLoss = losers.length > 0
            ? losers.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losers.length
            : 1; // Avoid division by zero

        const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1;

        // Expectancy = (Win% × Avg Win) - (Loss% × Avg Loss)
        const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

        return {
            totalTrades,
            winners: winners.length,
            losers: losers.length,
            winRate,
            avgWin,
            avgLoss,
            winLossRatio,
            expectancy
        };
    }

    // ========================================
    // INTERPRETATION
    // ========================================

    interpretEdge(kellyPct) {
        if (kellyPct <= 0) return 'NO_EDGE';
        if (kellyPct < 0.05) return 'MARGINAL';
        if (kellyPct < 0.10) return 'WEAK';
        if (kellyPct < 0.20) return 'MODERATE';
        if (kellyPct < 0.30) return 'STRONG';
        return 'VERY_STRONG';
    }

    getKellyMessage(fullKelly, finalPct) {
        if (fullKelly <= 0) {
            return '⚠️ No statistical edge detected - using minimum position size';
        }
        if (fullKelly < 0.05) {
            return '📊 Marginal edge - position size reduced for safety';
        }
        if (fullKelly > 0.30) {
            return '🚀 Strong edge detected but capped at maximum for safety';
        }
        return `✅ Optimal position size: ${(finalPct * 100).toFixed(1)}% of equity`;
    }

    // ========================================
    // DATA PERSISTENCE
    // ========================================

    saveData() {
        if (!this.config.dataFile) return;

        try {
            const dir = path.dirname(this.config.dataFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const data = {
                trades: this.trades,
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(this.config.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save Kelly data:', error.message);
        }
    }

    loadData() {
        if (!this.config.dataFile) return;

        try {
            if (fs.existsSync(this.config.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.config.dataFile, 'utf8'));
                this.trades = data.trades || [];
                console.log(`📊 Loaded ${this.trades.length} historical trades for Kelly calculation`);
            }
        } catch (error) {
            console.error('Failed to load Kelly data:', error.message);
            this.trades = [];
        }
    }

    // ========================================
    // REPORTING
    // ========================================

    getReport() {
        const kelly = this.calculateKelly();
        const stats = this.getTradeStats();

        return `
╔════════════════════════════════════════════════╗
║         KELLY CRITERION POSITION SIZING         ║
╠════════════════════════════════════════════════╣
║ Total Trades: ${stats.totalTrades.toString().padStart(5)}                          ║
║ Win Rate:     ${(stats.winRate * 100).toFixed(1).padStart(5)}%                         ║
║ Avg Win:      $${stats.avgWin.toFixed(2).padStart(8)}                     ║
║ Avg Loss:     $${stats.avgLoss.toFixed(2).padStart(8)}                     ║
║ Win/Loss:     ${stats.winLossRatio.toFixed(2).padStart(5)}x                          ║
╠════════════════════════════════════════════════╣
║ Full Kelly:   ${((kelly.fullKellyPct || 0) * 100).toFixed(1).padStart(5)}%                         ║
║ Half Kelly:   ${((kelly.fractionalKellyPct || 0) * 100).toFixed(1).padStart(5)}%                         ║
║ RECOMMENDED:  ${((kelly.recommendedPct || 0) * 100).toFixed(1).padStart(5)}%                         ║
║ Edge:         ${(kelly.edgeStrength || 'N/A').toString().padEnd(12)}                   ║
╚════════════════════════════════════════════════╝
`;
    }
}

// Factory function for different bot types
function createKellyCalculator(botType, baseDir) {
    const configs = {
        stock: {
            kellyFraction: 0.5,        // Half-Kelly
            minTrades: 20,
            minPositionPct: 0.02,      // 2% minimum
            maxPositionPct: 0.15,      // 15% maximum
            defaultPositionPct: 0.10,  // 10% default
            rollingWindow: 50,
            dataFile: path.join(baseDir, 'logs', 'auto-stock-bot', 'kelly_data.json')
        },
        forex: {
            kellyFraction: 0.5,
            minTrades: 20,
            minPositionPct: 0.01,      // 1% minimum (forex uses leverage)
            maxPositionPct: 0.08,      // 8% maximum
            defaultPositionPct: 0.05,  // 5% default
            rollingWindow: 50,
            dataFile: path.join(baseDir, 'logs', 'auto-forex-bot', 'kelly_data.json')
        },
        crypto: {
            kellyFraction: 0.4,        // More conservative for crypto volatility
            minTrades: 20,
            minPositionPct: 0.01,      // 1% minimum
            maxPositionPct: 0.05,      // 5% maximum (crypto is volatile!)
            defaultPositionPct: 0.03,  // 3% default
            rollingWindow: 50,
            dataFile: path.join(baseDir, 'logs', 'auto-crypto-bot', 'kelly_data.json')
        }
    };

    const config = configs[botType] || configs.stock;
    return new KellyCalculator(config);
}

module.exports = {
    KellyCalculator,
    createKellyCalculator
};
