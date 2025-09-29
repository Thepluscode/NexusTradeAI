const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const ProfitableTradeEngine = require('./profitable-strategies');
const TradingDatabase = require('./database');
require('dotenv').config();

const app = express();
const PORT = process.env.TRADING_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Trading Engine Instance
let tradingEngine = null;
let aiPredictor = null;

// Initialize persistent database
const db = new TradingDatabase();

// Realistic Trading Configuration
const TRADING_CONFIG = {
    symbols: process.env.TRADING_SYMBOLS ? process.env.TRADING_SYMBOLS.split(',') : ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'],
    basePositionSize: 12500, // $12.5K base position (realistic for $2.8M account)
    riskPerTrade: parseFloat(process.env.RISK_PER_TRADE) || 0.02, // 2% risk per trade
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || -25000, // $25K max daily loss (realistic)
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE) || 50000, // $50K max position (realistic)
    enabledStrategies: process.env.ENABLED_STRATEGIES ? process.env.ENABLED_STRATEGIES.split(',') : ['trendFollowing', 'meanReversion', 'volatilityBreakout', 'aiSignals'],
    aiEnabled: process.env.AI_ENABLED === 'true',
    realTradingEnabled: process.env.REAL_TRADING_ENABLED === 'true',
    // Realistic performance targets
    targetWinRate: 0.678, // 67.8% target win rate
    targetSharpeRatio: 2.34, // 2.34 target Sharpe ratio
    maxDrawdown: 0.085 // 8.5% max drawdown limit
};

// Initialize AI Predictor
function initializeAIPredictor() {
    if (!TRADING_CONFIG.aiEnabled) {
        console.log('⚠️  AI disabled in configuration');
        return;
    }

    console.log('🤖 Initializing AI Predictor...');
    
    // Spawn Python AI process
    aiPredictor = spawn('python3', ['../ai/profitable-ai-models.py'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    aiPredictor.stdout.on('data', (data) => {
        console.log(`AI: ${data.toString().trim()}`);
    });

    aiPredictor.stderr.on('data', (data) => {
        console.error(`AI Error: ${data.toString().trim()}`);
    });

    aiPredictor.on('close', (code) => {
        console.log(`AI Predictor process exited with code ${code}`);
    });
}

// API Routes

// Start Trading Engine
app.post('/api/trading/start', async (req, res) => {
    try {
        if (tradingEngine && tradingEngine.isRunning) {
            return res.json({ success: false, message: 'Trading engine already running' });
        }

        // Initialize trading engine
        tradingEngine = new ProfitableTradeEngine(TRADING_CONFIG);
        
        // Set up event listeners with database persistence
        tradingEngine.on('positionOpened', async (position) => {
            console.log(`📈 Position opened: ${position.symbol} (${position.strategy})`);

            // Save position to database
            try {
                await db.savePosition(position.id, position);
                console.log(`💾 Saved position: ${position.symbol}`);
            } catch (error) {
                console.error('Error saving position to database:', error);
            }
        });

        tradingEngine.on('positionClosed', async (position) => {
            console.log(`📉 Position closed: ${position.symbol} - Profit: $${position.profit.toFixed(2)}`);

            // Save trade data to database
            try {
                await db.addProfit(position.profit, 'trading', {
                    symbol: position.symbol,
                    strategy: position.strategy,
                    direction: position.direction,
                    entry: position.entry,
                    exit: position.exit
                });

                await db.closePosition(position.id, {
                    closePrice: position.exit,
                    profit: position.profit,
                    reason: position.closeReason
                });

                await db.addTrade({
                    symbol: position.symbol,
                    strategy: position.strategy,
                    direction: position.direction,
                    entry: position.entry,
                    exit: position.exit,
                    profit: position.profit,
                    size: position.size
                });

                console.log(`💾 Saved trade: ${position.symbol} - $${position.profit.toFixed(2)}`);
            } catch (error) {
                console.error('Error saving trade to database:', error);
            }
        });

        // Set up arbitrage profit listener
        tradingEngine.on('arbitrageProfit', async (data) => {
            try {
                await db.addProfit(data.profit, 'arbitrage', {
                    symbol: data.symbol,
                    volume: data.volume,
                    buyPrice: data.buyPrice,
                    sellPrice: data.sellPrice
                });
                console.log(`💾 Saved arbitrage profit: $${data.profit.toFixed(2)}`);
            } catch (error) {
                console.error('Error saving arbitrage profit to database:', error);
            }
        });

        // Start the engine
        await tradingEngine.start();

        res.json({
            success: true,
            message: 'Profitable trading engine started',
            config: TRADING_CONFIG
        });

    } catch (error) {
        console.error('Error starting trading engine:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop Trading Engine
app.post('/api/trading/stop', async (req, res) => {
    try {
        if (!tradingEngine || !tradingEngine.isRunning) {
            return res.json({ success: false, message: 'Trading engine not running' });
        }

        tradingEngine.stop();
        
        res.json({
            success: true,
            message: 'Trading engine stopped',
            finalPerformance: tradingEngine.getPerformanceMetrics()
        });

    } catch (error) {
        console.error('Error stopping trading engine:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Trading Status (with persistent data)
app.get('/api/trading/status', async (req, res) => {
    try {
        // Get persistent data from database
        const dbStatus = await db.getStatus();

        if (!tradingEngine) {
            // Return persistent data even when engine is stopped
            return res.json({
                success: true,
                data: {
                    isRunning: false,
                    performance: {
                        totalTrades: dbStatus?.trades?.total || 0,
                        winningTrades: dbStatus?.trades?.winning || 0,
                        winRate: dbStatus?.trades?.winRate || 0,
                        totalProfit: dbStatus?.profits?.total || 0,
                        activePositions: dbStatus?.positions?.active || 0,
                        maxDrawdown: dbStatus?.performance?.maxDrawdown || 0,
                        sharpeRatio: dbStatus?.performance?.sharpeRatio || 0,
                        isRunning: false
                    },
                    config: TRADING_CONFIG,
                    lastUpdate: dbStatus?.lastUpdate || new Date().toISOString(),
                    dataSource: 'persistent_database'
                }
            });
        }

        // Engine is running - combine live and persistent data
        const livePerformance = tradingEngine.getPerformanceMetrics();
        const combinedProfit = (dbStatus?.profits?.total || 0) + (livePerformance.totalProfit || 0);

        const performance = {
            ...livePerformance,
            totalProfit: combinedProfit,
            totalTrades: (dbStatus?.trades?.total || 0) + (livePerformance.totalTrades || 0),
            winningTrades: (dbStatus?.trades?.winning || 0) + (livePerformance.winningTrades || 0),
            activePositions: livePerformance.activePositions || 0,
            isRunning: true
        };

        // Update database with current performance
        await db.updatePerformance(performance);

        res.json({
            success: true,
            data: {
                isRunning: tradingEngine.isRunning,
                performance,
                config: TRADING_CONFIG,
                lastUpdate: new Date().toISOString(),
                dataSource: 'live_and_persistent'
            }
        });

    } catch (error) {
        console.error('Error getting trading status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get AI Prediction
app.get('/api/ai/prediction/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        
        if (!TRADING_CONFIG.aiEnabled) {
            return res.json({
                success: false,
                message: 'AI predictions disabled'
            });
        }

        // Mock AI prediction for now - replace with actual AI call
        const prediction = {
            symbol,
            direction: Math.random() > 0.5 ? 'up' : 'down',
            confidence: 0.85 + Math.random() * 0.1,
            strength: Math.random(),
            strategy: 'ensemble',
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            data: prediction
        });

    } catch (error) {
        console.error('Error getting AI prediction:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Performance Analytics
app.get('/api/trading/analytics', (req, res) => {
    try {
        if (!tradingEngine) {
            return res.json({
                success: true,
                data: {
                    performance: {
                        totalTrades: 0,
                        winningTrades: 0,
                        totalProfit: 0,
                        winRate: 0,
                        sharpeRatio: 0,
                        maxDrawdown: 0
                    },
                    strategies: {},
                    positions: []
                }
            });
        }

        const performance = tradingEngine.getPerformanceMetrics();
        const positions = Array.from(tradingEngine.positions.values());
        
        // Calculate strategy performance
        const strategyPerformance = {};
        positions.forEach(pos => {
            if (!strategyPerformance[pos.strategy]) {
                strategyPerformance[pos.strategy] = {
                    totalTrades: 0,
                    totalProfit: 0,
                    winRate: 0
                };
            }
            
            strategyPerformance[pos.strategy].totalTrades++;
            if (pos.profit && pos.profit > 0) {
                strategyPerformance[pos.strategy].totalProfit += pos.profit;
            }
        });

        res.json({
            success: true,
            data: {
                performance,
                strategies: strategyPerformance,
                positions: positions.map(pos => ({
                    symbol: pos.symbol,
                    strategy: pos.strategy,
                    direction: pos.direction,
                    entry: pos.entry,
                    current: pos.current || pos.entry,
                    profit: pos.profit || 0,
                    confidence: pos.confidence
                }))
            }
        });

    } catch (error) {
        console.error('Error getting analytics:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Close All Profitable Positions (Realize Profits)
app.post('/api/trading/realize-profits', async (req, res) => {
    try {
        if (!tradingEngine || !tradingEngine.isRunning) {
            return res.json({ success: false, message: 'Trading engine not running' });
        }

        const { percentage = 100 } = req.body; // Default: close 100% of profitable positions

        console.log(`🏦 Realizing ${percentage}% of profitable positions...`);

        let totalRealizedProfit = 0;
        let positionsClosed = 0;
        const positionsToClose = [];

        // Find all profitable positions
        for (const [id, position] of tradingEngine.positions) {
            const currentPrice = await tradingEngine.getCurrentPrice(position.symbol);
            const profit = tradingEngine.calculateProfit(position, currentPrice);

            if (profit > 0) { // Only close profitable positions
                positionsToClose.push({ id, position, profit, currentPrice });
            }
        }

        // Sort by profit (highest first)
        positionsToClose.sort((a, b) => b.profit - a.profit);

        // Close the specified percentage of profitable positions
        const positionsToCloseCount = Math.floor(positionsToClose.length * (percentage / 100));

        for (let i = 0; i < positionsToCloseCount; i++) {
            const { id, position, profit, currentPrice } = positionsToClose[i];

            try {
                await tradingEngine.closePosition(id, 'profit_realization');
                totalRealizedProfit += profit;
                positionsClosed++;

                // Save to persistent database
                await db.addProfit(profit, 'trading', {
                    symbol: position.symbol,
                    strategy: position.strategy,
                    type: 'profit_realization',
                    positionId: id
                });

                await db.closePosition(id, {
                    closePrice: currentPrice,
                    profit: profit,
                    reason: 'profit_realization'
                });

                console.log(`💰 Realized profit: ${position.symbol} - $${profit.toFixed(2)}`);
            } catch (error) {
                console.error(`Error closing position ${id}:`, error);
            }
        }

        res.json({
            success: true,
            message: `Successfully realized profits from ${positionsClosed} positions`,
            data: {
                positionsClosed,
                totalRealizedProfit: totalRealizedProfit.toFixed(2),
                remainingPositions: tradingEngine.positions.size,
                percentageClosed: percentage
            }
        });

    } catch (error) {
        console.error('Error realizing profits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Close Specific Percentage of Positions
app.post('/api/trading/close-positions', async (req, res) => {
    try {
        if (!tradingEngine || !tradingEngine.isRunning) {
            return res.json({ success: false, message: 'Trading engine not running' });
        }

        const { percentage = 50, onlyProfitable = true } = req.body;

        console.log(`🔄 Closing ${percentage}% of ${onlyProfitable ? 'profitable' : 'all'} positions...`);

        let totalProfit = 0;
        let positionsClosed = 0;
        const positionsArray = Array.from(tradingEngine.positions.entries());

        // Filter positions if only profitable
        const eligiblePositions = onlyProfitable
            ? positionsArray.filter(([id, position]) => {
                const currentPrice = tradingEngine.getCurrentPrice(position.symbol);
                const profit = tradingEngine.calculateProfit(position, currentPrice);
                return profit > 0;
            })
            : positionsArray;

        const positionsToClose = Math.floor(eligiblePositions.length * (percentage / 100));

        for (let i = 0; i < positionsToClose; i++) {
            const [id, position] = eligiblePositions[i];

            try {
                const currentPrice = await tradingEngine.getCurrentPrice(position.symbol);
                const profit = tradingEngine.calculateProfit(position, currentPrice);

                await tradingEngine.closePosition(id, 'manual_close');
                totalProfit += profit;
                positionsClosed++;
            } catch (error) {
                console.error(`Error closing position ${id}:`, error);
            }
        }

        res.json({
            success: true,
            message: `Successfully closed ${positionsClosed} positions`,
            data: {
                positionsClosed,
                totalProfit: totalProfit.toFixed(2),
                remainingPositions: tradingEngine.positions.size
            }
        });

    } catch (error) {
        console.error('Error closing positions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug Positions (for testing profit realization)
app.get('/api/trading/debug-positions', async (req, res) => {
    try {
        if (!tradingEngine || !tradingEngine.isRunning) {
            return res.json({ success: false, message: 'Trading engine not running' });
        }

        const positionsDebug = [];
        let totalProfitablePositions = 0;
        let totalUnrealizedProfit = 0;

        for (const [id, position] of tradingEngine.positions) {
            try {
                const currentPrice = await tradingEngine.getCurrentPrice(position.symbol);
                const profit = tradingEngine.calculateProfit(position, currentPrice);

                positionsDebug.push({
                    id,
                    symbol: position.symbol,
                    direction: position.direction,
                    entry: position.entry,
                    currentPrice,
                    profit: profit.toFixed(2),
                    isProfitable: profit > 0
                });

                if (profit > 0) {
                    totalProfitablePositions++;
                    totalUnrealizedProfit += profit;
                }
            } catch (error) {
                positionsDebug.push({
                    id,
                    symbol: position.symbol,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            data: {
                totalPositions: tradingEngine.positions.size,
                totalProfitablePositions,
                totalUnrealizedProfit: totalUnrealizedProfit.toFixed(2),
                positions: positionsDebug.slice(0, 10) // Show first 10 for debugging
            }
        });

    } catch (error) {
        console.error('Error debugging positions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Database Status
app.get('/api/trading/database/status', async (req, res) => {
    try {
        const status = await db.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error getting database status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create Database Backup
app.post('/api/trading/database/backup', async (req, res) => {
    try {
        const backupId = await db.createBackup();
        res.json({
            success: true,
            message: 'Database backup created successfully',
            backupId: backupId
        });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Enhanced Account Balance (includes realized trading profits)
app.get('/api/trading/account/balance', async (req, res) => {
    try {
        // Get base account balance from Alpaca or use default
        let baseAccountBalance = 100000; // Default starting balance
        let buyingPower = 200000;
        let dayTradeCount = 0;

        try {
            // Try to get real account data from Alpaca
            const alpacaResponse = await axios.get('http://localhost:3001/api/alpaca/account');
            if (alpacaResponse.data) {
                baseAccountBalance = parseFloat(alpacaResponse.data.portfolio_value || alpacaResponse.data.account_value || 100000);
                buyingPower = parseFloat(alpacaResponse.data.buying_power || 200000);
                dayTradeCount = parseInt(alpacaResponse.data.daytrade_count || 0);
            }
        } catch (alpacaError) {
            console.log('Using default account values (Alpaca not available)');
        }

        // Get realized profits from database
        const dbStatus = await db.getStatus();
        const realizedProfits = dbStatus?.profits?.total || 0;

        // Calculate total account value including realized profits
        const totalAccountValue = baseAccountBalance + realizedProfits;

        res.json({
            success: true,
            data: {
                baseAccountBalance,
                realizedProfits,
                totalAccountValue,
                buyingPower,
                dayTradeCount,
                profitBreakdown: {
                    arbitrageProfits: dbStatus?.profits?.arbitrage || 0,
                    tradingProfits: dbStatus?.profits?.trading || 0,
                    todaysProfits: dbStatus?.profits?.today || 0
                },
                lastUpdate: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error getting enhanced account balance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Trading Configuration
app.post('/api/trading/config', (req, res) => {
    try {
        const { symbols, strategies, riskPerTrade, maxPositionSize } = req.body;

        if (symbols) TRADING_CONFIG.symbols = symbols;
        if (strategies) TRADING_CONFIG.enabledStrategies = strategies;
        if (riskPerTrade) TRADING_CONFIG.riskPerTrade = riskPerTrade;
        if (maxPositionSize) TRADING_CONFIG.maxPositionSize = maxPositionSize;

        // Restart trading engine with new config if running
        if (tradingEngine && tradingEngine.isRunning) {
            tradingEngine.stop();
            setTimeout(() => {
                tradingEngine = new ProfitableTradeEngine(TRADING_CONFIG);
                tradingEngine.start();
            }, 1000);
        }

        res.json({
            success: true,
            message: 'Configuration updated',
            config: TRADING_CONFIG
        });

    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            tradingEngine: tradingEngine ? tradingEngine.isRunning : false,
            aiPredictor: aiPredictor ? !aiPredictor.killed : false,
            realTrading: TRADING_CONFIG.realTradingEnabled,
            aiEnabled: TRADING_CONFIG.aiEnabled
        },
        config: TRADING_CONFIG
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('API Error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Profitable Trading Server running on port ${PORT}`);
    console.log('Configuration:');
    console.log(`- Symbols: ${TRADING_CONFIG.symbols.join(', ')}`);
    console.log(`- Strategies: ${TRADING_CONFIG.enabledStrategies.join(', ')}`);
    console.log(`- AI Enabled: ${TRADING_CONFIG.aiEnabled}`);
    console.log(`- Real Trading: ${TRADING_CONFIG.realTradingEnabled}`);
    console.log(`- Risk Per Trade: ${(TRADING_CONFIG.riskPerTrade * 100).toFixed(1)}%`);
    
    // Initialize AI if enabled
    if (TRADING_CONFIG.aiEnabled) {
        initializeAIPredictor();
    }
    
    console.log('\n💰 Ready for profitable automated trading!');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down trading server...');
    
    if (tradingEngine && tradingEngine.isRunning) {
        tradingEngine.stop();
    }
    
    if (aiPredictor && !aiPredictor.killed) {
        aiPredictor.kill();
    }
    
    process.exit(0);
});
