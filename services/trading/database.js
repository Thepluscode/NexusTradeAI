/**
 * NexusTradeAI Persistent Database System
 * 
 * Stores all trading data, profits, and positions for continuity
 */

const fs = require('fs').promises;
const path = require('path');

// Simple file locking mechanism
const fileLocks = new Map();

class TradingDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'data');
        this.files = {
            positions: path.join(this.dbPath, 'positions.json'),
            profits: path.join(this.dbPath, 'profits.json'),
            trades: path.join(this.dbPath, 'trades.json'),
            performance: path.join(this.dbPath, 'performance.json'),
            config: path.join(this.dbPath, 'config.json')
        };
        this.initializeDatabase();
    }

    // Atomic file write with locking
    async atomicWrite(filePath, data) {
        const lockKey = filePath;

        // Wait for any existing lock
        while (fileLocks.has(lockKey)) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Acquire lock
        fileLocks.set(lockKey, true);

        try {
            const tempPath = filePath + '.tmp';
            await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
            await fs.rename(tempPath, filePath);
        } finally {
            // Release lock
            fileLocks.delete(lockKey);
        }
    }

    // Safe JSON read with error handling
    async safeRead(filePath, defaultData) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error.message);
            return defaultData;
        }
    }

    async initializeDatabase() {
        try {
            // Create data directory if it doesn't exist
            await fs.mkdir(this.dbPath, { recursive: true });
            
            // Initialize files if they don't exist
            for (const [key, filePath] of Object.entries(this.files)) {
                try {
                    await fs.access(filePath);
                } catch (error) {
                    // File doesn't exist, create it
                    const initialData = this.getInitialData(key);
                    await fs.writeFile(filePath, JSON.stringify(initialData, null, 2));
                    console.log(`📁 Created ${key}.json database file`);
                }
            }
            
            console.log('💾 Trading database initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing database:', error);
        }
    }

    getInitialData(type) {
        switch (type) {
            case 'positions':
                return {
                    active: {},
                    closed: [],
                    lastUpdate: new Date().toISOString()
                };
            case 'profits':
                return {
                    totalProfit: 0,
                    dailyProfits: {},
                    monthlyProfits: {},
                    arbitrageProfits: 0,
                    tradingProfits: 0,
                    lastUpdate: new Date().toISOString()
                };
            case 'trades':
                return {
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    tradeHistory: [],
                    lastUpdate: new Date().toISOString()
                };
            case 'performance':
                return {
                    totalProfit: 0,
                    totalTrades: 0,
                    winRate: 0,
                    sharpeRatio: 0,
                    maxDrawdown: 0,
                    activePositions: 0,
                    isRunning: false,
                    startTime: new Date().toISOString(),
                    lastUpdate: new Date().toISOString()
                };
            case 'config':
                return {
                    symbols: ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA", "AMZN", "RDDT", "META", "NFLX"],
                    strategies: ["meanReversion", "momentum", "arbitrage", "neuralNet"],
                    riskPerTrade: 0.02,
                    maxPositionSize: 10000,
                    lastUpdate: new Date().toISOString()
                };
            default:
                return {};
        }
    }

    // Position Management
    async savePosition(positionId, positionData) {
        try {
            const positions = await this.loadPositions();
            positions.active[positionId] = {
                ...positionData,
                createdAt: new Date().toISOString(),
                lastUpdate: new Date().toISOString()
            };
            positions.lastUpdate = new Date().toISOString();

            await this.atomicWrite(this.files.positions, positions);
            console.log(`💾 Saved position: ${positionId}`);
        } catch (error) {
            console.error('❌ Error saving position:', error);
        }
    }

    async closePosition(positionId, closeData) {
        try {
            const positions = await this.loadPositions();
            
            if (positions.active[positionId]) {
                const closedPosition = {
                    ...positions.active[positionId],
                    ...closeData,
                    closedAt: new Date().toISOString()
                };
                
                positions.closed.push(closedPosition);
                delete positions.active[positionId];
                positions.lastUpdate = new Date().toISOString();

                await this.atomicWrite(this.files.positions, positions);
                console.log(`💾 Closed position: ${positionId}`);
                
                return closedPosition;
            }
        } catch (error) {
            console.error('❌ Error closing position:', error);
        }
    }

    async loadPositions() {
        return await this.safeRead(this.files.positions, this.getInitialData('positions'));
    }

    // Profit Management
    async addProfit(amount, type = 'trading', details = {}) {
        try {
            const profits = await this.loadProfits();
            const today = new Date().toISOString().split('T')[0];
            const month = today.substring(0, 7);
            
            profits.totalProfit += amount;
            
            if (type === 'arbitrage') {
                profits.arbitrageProfits += amount;
            } else {
                profits.tradingProfits += amount;
            }
            
            // Daily profits
            if (!profits.dailyProfits[today]) {
                profits.dailyProfits[today] = 0;
            }
            profits.dailyProfits[today] += amount;
            
            // Monthly profits
            if (!profits.monthlyProfits[month]) {
                profits.monthlyProfits[month] = 0;
            }
            profits.monthlyProfits[month] += amount;
            
            profits.lastUpdate = new Date().toISOString();

            await this.atomicWrite(this.files.profits, profits);
            console.log(`💰 Added profit: $${amount.toFixed(2)} (${type})`);
            
            return profits;
        } catch (error) {
            console.error('❌ Error adding profit:', error);
        }
    }

    async loadProfits() {
        return await this.safeRead(this.files.profits, this.getInitialData('profits'));
    }

    // Trade Management
    async addTrade(tradeData) {
        try {
            const trades = await this.loadTrades();
            
            trades.totalTrades++;
            if (tradeData.profit > 0) {
                trades.winningTrades++;
            } else {
                trades.losingTrades++;
            }
            
            trades.tradeHistory.push({
                ...tradeData,
                timestamp: new Date().toISOString()
            });
            
            // Keep only last 1000 trades to prevent file from getting too large
            if (trades.tradeHistory.length > 1000) {
                trades.tradeHistory = trades.tradeHistory.slice(-1000);
            }
            
            trades.lastUpdate = new Date().toISOString();

            await this.atomicWrite(this.files.trades, trades);
            console.log(`📊 Added trade: ${tradeData.symbol} - $${tradeData.profit.toFixed(2)}`);
            
            return trades;
        } catch (error) {
            console.error('❌ Error adding trade:', error);
        }
    }

    async loadTrades() {
        return await this.safeRead(this.files.trades, this.getInitialData('trades'));
    }

    // Performance Management
    async updatePerformance(performanceData) {
        try {
            const performance = await this.loadPerformance();
            
            Object.assign(performance, performanceData, {
                lastUpdate: new Date().toISOString()
            });

            await this.atomicWrite(this.files.performance, performance);
            console.log(`📈 Updated performance data`);
            
            return performance;
        } catch (error) {
            console.error('❌ Error updating performance:', error);
        }
    }

    async loadPerformance() {
        return await this.safeRead(this.files.performance, this.getInitialData('performance'));
    }

    // Get comprehensive status
    async getStatus() {
        try {
            const [positions, profits, trades, performance] = await Promise.all([
                this.loadPositions(),
                this.loadProfits(),
                this.loadTrades(),
                this.loadPerformance()
            ]);

            return {
                positions: {
                    active: Object.keys(positions.active).length,
                    closed: positions.closed.length,
                    total: Object.keys(positions.active).length + positions.closed.length
                },
                profits: {
                    total: this.calculateRealisticProfits(trades), // Use realistic calculation
                    reported: profits.totalProfit, // Keep original for comparison
                    arbitrage: 0, // Remove fake arbitrage profits
                    trading: this.calculateRealisticProfits(trades),
                    today: profits.dailyProfits[new Date().toISOString().split('T')[0]] || 0,
                    isRealistic: true
                },
                trades: {
                    total: trades.totalTrades,
                    winning: trades.winningTrades,
                    losing: trades.losingTrades,
                    winRate: trades.totalTrades > 0 ? (trades.winningTrades / trades.totalTrades * 100) : 0,
                    // Calculate realistic profitability
                    isProfitable: this.calculateProfitability(trades),
                    requiredRR: trades.totalTrades > 0 ? (trades.losingTrades / trades.winningTrades) : 0,
                    actualRR: this.calculateRiskReward(trades)
                },
                performance,
                lastUpdate: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error getting status:', error);
            return null;
        }
    }

    // Profitability Analysis
    calculateProfitability(trades) {
        if (!trades.tradeHistory || trades.totalTrades === 0) return false;

        const winRate = (trades.winningTrades / trades.totalTrades) * 100;
        const requiredRR = winRate > 0 ? (100 - winRate) / winRate : Infinity;
        const actualRR = this.calculateRiskReward(trades);

        console.log(`📊 Profitability Analysis:
            Win Rate: ${winRate.toFixed(1)}%
            Required R:R: ${requiredRR.toFixed(2)}:1
            Actual R:R: ${actualRR.toFixed(2)}:1
            Is Profitable: ${actualRR > requiredRR ? '✅' : '❌'}`);

        return actualRR > requiredRR;
    }

    calculateRiskReward(trades) {
        if (!trades.tradeHistory || trades.tradeHistory.length === 0) return 0;

        let totalWins = 0;
        let totalLosses = 0;
        let winCount = 0;
        let lossCount = 0;

        trades.tradeHistory.forEach(trade => {
            if (trade.profit > 0) {
                totalWins += trade.profit;
                winCount++;
            } else if (trade.profit < 0) {
                totalLosses += Math.abs(trade.profit);
                lossCount++;
            }
        });

        const avgWin = winCount > 0 ? totalWins / winCount : 0;
        const avgLoss = lossCount > 0 ? totalLosses / lossCount : 0;

        return avgLoss > 0 ? avgWin / avgLoss : 0;
    }

    // Calculate realistic profits (remove fake arbitrage)
    calculateRealisticProfits(trades) {
        if (!trades.tradeHistory || trades.tradeHistory.length === 0) return 0;

        return trades.tradeHistory.reduce((total, trade) => total + (trade.profit || 0), 0);
    }

    // Backup and restore
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(this.dbPath, 'backups');
            await fs.mkdir(backupDir, { recursive: true });
            
            for (const [key, filePath] of Object.entries(this.files)) {
                const backupPath = path.join(backupDir, `${key}_${timestamp}.json`);
                await fs.copyFile(filePath, backupPath);
            }
            
            console.log(`💾 Created backup at ${timestamp}`);
            return timestamp;
        } catch (error) {
            console.error('❌ Error creating backup:', error);
        }
    }
}

module.exports = TradingDatabase;
