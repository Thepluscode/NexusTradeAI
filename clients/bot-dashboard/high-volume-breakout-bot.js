const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ===== INFRASTRUCTURE =====
const { getTelegramAlertService } = require('../../infrastructure/notifications/telegram-alerts');

/**
 * HIGH-VOLUME BREAKOUT TRADING BOT
 *
 * THE EDGE: "When a stock breaks above resistance on 5x+ volume, it often continues
 *            as late buyers FOMO in"
 *
 * ENTRY RULES:
 * 1. Stock must be up 5-10% intraday
 * 2. Volume must be 5x+ average (not just 1.5x)
 * 3. Must break above 20-day high
 * 4. RSI must be between 50-70 (not overbought)
 * 5. Enter immediately at market price
 *
 * EXIT RULES:
 * 1. Profit target: +8% from entry
 * 2. Stop loss: -4% from entry
 * 3. Trailing stop: Lock 50% of gains when up 5%+
 * 4. Time exit: 3:55 PM (close all positions)
 *
 * POSITION SIZING:
 * - Risk 1% of portfolio per trade
 * - Max 5 positions at once
 */

const app = express();
const PORT = process.env.HVB_PORT || 3008;

app.use(cors());
app.use(express.json());

const alpacaConfig = {
    baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    apiKey: process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY,
    dataURL: 'https://data.alpaca.markets'
};

// Initialize Telegram Alerts
const telegramAlerts = getTelegramAlertService();

// ===== HIGH-VOLUME BREAKOUT CONFIGURATION =====
const HVB_CONFIG = {
    minMomentum: 0.05,             // 5% minimum intraday move
    maxMomentum: 0.10,             // 10% maximum (avoid exhaustion)
    volumeMultiplier: 5.0,         // 5x average volume required
    rsiMin: 50,                    // RSI minimum (not oversold)
    rsiMax: 70,                    // RSI maximum (not overbought)
    profitTarget: 0.08,            // 8% profit target
    stopLoss: 0.04,                // 4% stop loss
    trailingStopActivation: 0.05,  // Activate trailing at +5%
    trailingStopDistance: 0.025,   // Trail by 2.5%
    timeExitHour: 15,              // 3:55 PM exit
    timeExitMinute: 55,
    maxPositions: 5,               // Max 5 positions at once
    riskPerTrade: 0.01,            // 1% risk per trade
    scanIntervalSeconds: 60,       // Check every 60 seconds
};

// ===== TRADING UNIVERSE (50 LIQUID STOCKS) =====
const SYMBOLS = [
    // Mega-cap tech
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'NFLX',

    // Large-cap tech
    'CRM', 'ORCL', 'ADBE', 'INTC', 'QCOM', 'AVGO', 'TXN', 'AMAT', 'LRCX',

    // Finance
    'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS',

    // Healthcare
    'UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'LLY',

    // Consumer
    'WMT', 'HD', 'NKE', 'COST', 'MCD', 'SBUX', 'DIS',

    // Industrial
    'BA', 'CAT', 'GE', 'MMM',

    // Energy
    'XOM', 'CVX', 'COP',

    // ETFs
    'SPY', 'QQQ', 'IWM'
];

// ===== STATE MANAGEMENT =====
const positions = new Map();       // symbol -> { entry, shares, stopLoss, target, trailingStop, entryTime }
const dailyVolumes = new Map();    // symbol -> average volume (20-day)
const highestPrices = new Map();   // symbol -> 20-day high
let totalTradesToday = 0;
let scanCount = 0;
let lastScanTime = null;

// Anti-churning protection
const MAX_TRADES_PER_DAY = 15;
const recentTrades = new Map();

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     🚀 HIGH-VOLUME BREAKOUT TRADING BOT                   ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║  STRATEGY: High-Volume Breakout                            ║');
console.log('║  SYMBOLS: 50 liquid stocks                                 ║');
console.log('║  ENTRY: 5-10% move + 5x volume + 20-day high break        ║');
console.log('║  EXIT: +8% profit OR -4% stop OR trailing OR 3:55 PM      ║');
console.log('║  MAX POSITIONS: 5                                          ║');
console.log('║  MAX TRADES/DAY: 15                                        ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ===== MARKET HOURS AND TIME CHECKS =====
function getMarketTimes() {
    const now = new Date();
    const marketOpen = new Date(now);
    marketOpen.setHours(9, 30, 0, 0);

    const timeExit = new Date(now);
    timeExit.setHours(HVB_CONFIG.timeExitHour, HVB_CONFIG.timeExitMinute, 0, 0);

    const marketClose = new Date(now);
    marketClose.setHours(16, 0, 0, 0);

    return { marketOpen, timeExit, marketClose, now };
}

function isMarketOpen() {
    const { marketOpen, marketClose, now } = getMarketTimes();
    const day = now.getDay();
    return day >= 1 && day <= 5 && now >= marketOpen && now < marketClose;
}

function isTradingTime() {
    const { marketOpen, timeExit, now } = getMarketTimes();
    return now >= marketOpen && now < timeExit;
}

function isTimeToExit() {
    const { timeExit, now } = getMarketTimes();
    return now >= timeExit;
}

// ===== HELPER FUNCTIONS =====
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50; // Default neutral RSI

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
}

// ===== DATA FETCHING =====
async function getCurrentPrice(symbol) {
    try {
        const tradeUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/trades/latest`;
        const response = await axios.get(tradeUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: { feed: 'sip' }
        });

        return response.data?.trade?.p || null;
    } catch (error) {
        return null;
    }
}

async function getTodayBars(symbol) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;

        const response = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: today,
                timeframe: '1Min',
                feed: 'sip',
                limit: 10000
            }
        });

        return response.data?.bars || [];
    } catch (error) {
        return [];
    }
}

async function getHistoricalBars(symbol, days = 20) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days - 5);

        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
        const response = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0],
                timeframe: '1Day',
                feed: 'sip',
                limit: days
            }
        });

        return response.data?.bars || [];
    } catch (error) {
        return [];
    }
}

async function getAverageVolume(symbol, days = 20) {
    const bars = await getHistoricalBars(symbol, days);
    if (bars.length === 0) return null;

    const totalVolume = bars.reduce((sum, bar) => sum + bar.v, 0);
    return totalVolume / bars.length;
}

async function get20DayHigh(symbol) {
    const bars = await getHistoricalBars(symbol, 20);
    if (bars.length === 0) return null;

    return Math.max(...bars.map(bar => bar.h));
}

// ===== MAIN SCAN FOR BREAKOUTS =====
async function scanForBreakouts() {
    console.log(`\n🔍 HIGH-VOLUME BREAKOUT SCAN - ${new Date().toLocaleTimeString()}`);
    console.log(`📊 Scanning ${SYMBOLS.length} symbols...`);

    const signals = [];

    for (const symbol of SYMBOLS) {
        try {
            // Skip if already have position
            if (positions.has(symbol)) {
                continue;
            }

            // Skip if hit max positions
            if (positions.size >= HVB_CONFIG.maxPositions) {
                console.log(`⚠️  Max positions (${HVB_CONFIG.maxPositions}) reached`);
                break;
            }

            // Skip if hit daily trade limit
            if (totalTradesToday >= MAX_TRADES_PER_DAY) {
                console.log(`⚠️  Daily trade limit (${MAX_TRADES_PER_DAY}) reached`);
                break;
            }

            // Get today's bars
            const todayBars = await getTodayBars(symbol);
            if (todayBars.length === 0) continue;

            const todayOpen = todayBars[0].o;
            const currentPrice = await getCurrentPrice(symbol);
            if (!currentPrice) continue;

            // CONDITION 1: Must be up 5-10% intraday
            const momentum = (currentPrice - todayOpen) / todayOpen;
            if (momentum < HVB_CONFIG.minMomentum || momentum > HVB_CONFIG.maxMomentum) {
                continue;
            }

            // CONDITION 2: Volume must be 5x+ average
            const currentVolume = todayBars.reduce((sum, bar) => sum + bar.v, 0);
            let averageVolume = dailyVolumes.get(symbol);
            if (!averageVolume) {
                averageVolume = await getAverageVolume(symbol);
                if (averageVolume) {
                    dailyVolumes.set(symbol, averageVolume);
                }
            }

            if (!averageVolume || currentVolume < averageVolume * HVB_CONFIG.volumeMultiplier) {
                continue;
            }

            // CONDITION 3: Must break above 20-day high
            let highOf20Days = highestPrices.get(symbol);
            if (!highOf20Days) {
                highOf20Days = await get20DayHigh(symbol);
                if (highOf20Days) {
                    highestPrices.set(symbol, highOf20Days);
                }
            }

            if (!highOf20Days || currentPrice < highOf20Days) {
                continue;
            }

            // CONDITION 4: RSI must be between 50-70
            const prices = todayBars.map(bar => bar.c);
            const rsi = calculateRSI(prices);
            if (rsi < HVB_CONFIG.rsiMin || rsi > HVB_CONFIG.rsiMax) {
                console.log(`   ⏸️  ${symbol}: Breakout but RSI ${rsi.toFixed(0)} (need ${HVB_CONFIG.rsiMin}-${HVB_CONFIG.rsiMax})`);
                continue;
            }

            // BREAKOUT CONFIRMED!
            const signal = {
                symbol,
                currentPrice,
                todayOpen,
                momentum,
                currentVolume,
                averageVolume,
                volumeRatio: currentVolume / averageVolume,
                highOf20Days,
                rsi
            };

            signals.push(signal);
            console.log(`\n🚨 HIGH-VOLUME BREAKOUT: ${symbol}`);
            console.log(`   💰 Current: $${currentPrice.toFixed(2)}`);
            console.log(`   📈 Momentum: +${(momentum * 100).toFixed(2)}%`);
            console.log(`   📊 Volume: ${(currentVolume / averageVolume).toFixed(1)}x average`);
            console.log(`   🎯 20-Day High: $${highOf20Days.toFixed(2)} (BROKEN)`);
            console.log(`   📊 RSI: ${rsi.toFixed(0)}`);

            // Execute trade immediately
            await executeTrade(signal);

        } catch (error) {
            console.log(`   ❌ ${symbol}: Error - ${error.message}`);
        }
    }

    if (signals.length === 0) {
        console.log(`   ⏸️  No breakouts found this scan`);
    }

    console.log(`✅ Scan complete: ${signals.length} breakouts executed\n`);
}

// ===== EXECUTE TRADE =====
async function executeTrade(signal) {
    try {
        console.log(`\n💼 EXECUTING TRADE: ${signal.symbol}`);

        // Get account equity
        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const equity = parseFloat(accountResponse.data.equity);

        // Calculate position size (risk 1% of portfolio)
        const riskAmount = equity * HVB_CONFIG.riskPerTrade;
        const stopDistance = signal.currentPrice * HVB_CONFIG.stopLoss;
        const shares = Math.floor(riskAmount / stopDistance);

        if (shares < 1) {
            console.log(`   ⚠️  Position size too small (${shares} shares), skipping`);
            return null;
        }

        // Calculate stop and target
        const stopPrice = signal.currentPrice * (1 - HVB_CONFIG.stopLoss);
        const targetPrice = signal.currentPrice * (1 + HVB_CONFIG.profitTarget);

        console.log(`   💰 Entry: $${signal.currentPrice.toFixed(2)}`);
        console.log(`   📊 Shares: ${shares}`);
        console.log(`   🔻 Stop: $${stopPrice.toFixed(2)} (-${(HVB_CONFIG.stopLoss * 100).toFixed(1)}%)`);
        console.log(`   🎯 Target: $${targetPrice.toFixed(2)} (+${(HVB_CONFIG.profitTarget * 100).toFixed(1)}%)`);
        console.log(`   💵 Position Size: $${(signal.currentPrice * shares).toFixed(2)}`);

        // Place order with Alpaca
        const orderUrl = `${alpacaConfig.baseURL}/v2/orders`;
        const orderResponse = await axios.post(orderUrl, {
            symbol: signal.symbol,
            qty: shares,
            side: 'buy',
            type: 'market',
            time_in_force: 'day'
        }, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        // Record position
        positions.set(signal.symbol, {
            symbol: signal.symbol,
            shares,
            entry: signal.currentPrice,
            stopLoss: stopPrice,
            target: targetPrice,
            trailingStop: null, // Activated later
            entryTime: new Date(),
            momentum: signal.momentum,
            volumeRatio: signal.volumeRatio,
            rsi: signal.rsi
        });

        // Track trade
        totalTradesToday++;
        const tradeRecord = {
            time: Date.now(),
            side: 'buy',
            price: signal.currentPrice,
            shares
        };
        const recent = recentTrades.get(signal.symbol) || [];
        recent.push(tradeRecord);
        recentTrades.set(signal.symbol, recent);

        console.log(`✅ ORDER PLACED: ${shares} shares of ${signal.symbol} @ $${signal.currentPrice.toFixed(2)}`);

        // Send Telegram alert
        await telegramAlerts.sendStockEntry(
            signal.symbol,
            signal.currentPrice,
            stopPrice,
            targetPrice,
            shares,
            'HVB'
        );

        return orderResponse.data;

    } catch (error) {
        console.error(`❌ Trade execution failed: ${error.message}`);
        return null;
    }
}

// ===== MANAGE POSITIONS =====
async function managePositions() {
    try {
        if (positions.size === 0) {
            return;
        }

        console.log(`\n📊 POSITION MANAGEMENT - ${positions.size} open positions`);

        // Get current positions from Alpaca
        const positionsUrl = `${alpacaConfig.baseURL}/v2/positions`;
        const response = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const alpacaPositions = response.data;

        for (const alpacaPos of alpacaPositions) {
            const symbol = alpacaPos.symbol;
            const position = positions.get(symbol);

            if (!position) {
                continue;
            }

            const currentPrice = parseFloat(alpacaPos.current_price);
            const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;

            // Update trailing stop if position is profitable
            if (unrealizedPL >= HVB_CONFIG.trailingStopActivation * 100) {
                const trailingStopPrice = currentPrice * (1 - HVB_CONFIG.trailingStopDistance);

                if (!position.trailingStop || trailingStopPrice > position.trailingStop) {
                    const oldStop = position.trailingStop || position.stopLoss;
                    position.trailingStop = trailingStopPrice;
                    console.log(`   📈 ${symbol}: Trailing stop raised from $${oldStop.toFixed(2)} to $${trailingStopPrice.toFixed(2)}`);
                }
            }

            const activeStop = position.trailingStop || position.stopLoss;

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%) | Stop: $${activeStop.toFixed(2)} | Target: $${position.target.toFixed(2)}`);

            let shouldClose = false;
            let closeReason = null;

            // EXIT CONDITION 1: Profit Target Hit (+8%)
            if (currentPrice >= position.target) {
                shouldClose = true;
                closeReason = `Profit Target Hit (+${(HVB_CONFIG.profitTarget * 100).toFixed(1)}%)`;
            }

            // EXIT CONDITION 2: Stop Loss Hit (fixed or trailing)
            if (currentPrice <= activeStop) {
                shouldClose = true;
                if (position.trailingStop) {
                    closeReason = `Trailing Stop Hit (locked ${unrealizedPL.toFixed(2)}%)`;
                } else {
                    closeReason = `Stop Loss Hit (-${(HVB_CONFIG.stopLoss * 100).toFixed(1)}%)`;
                }
            }

            // EXIT CONDITION 3: Time Exit (3:55 PM)
            if (isTimeToExit()) {
                shouldClose = true;
                closeReason = `End of Day Exit (3:55 PM) - ${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%`;
            }

            if (shouldClose) {
                console.log(`\n🚪 CLOSING POSITION: ${symbol} - ${closeReason}`);
                await closePosition(symbol, alpacaPos.qty, closeReason, currentPrice, unrealizedPL);
            }
        }

    } catch (error) {
        console.error('❌ Position management error:', error.message);
    }
}

// ===== CLOSE POSITION =====
async function closePosition(symbol, qty, reason, exitPrice, pnlPercent) {
    try {
        const orderUrl = `${alpacaConfig.baseURL}/v2/orders`;
        await axios.post(orderUrl, {
            symbol,
            qty,
            side: 'sell',
            type: 'market',
            time_in_force: 'day'
        }, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const position = positions.get(symbol);

        console.log(`✅ POSITION CLOSED: ${symbol}`);
        console.log(`   Entry: $${position.entry.toFixed(2)}`);
        console.log(`   Exit: $${exitPrice.toFixed(2)}`);
        console.log(`   P/L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`);
        console.log(`   Reason: ${reason}`);

        // Send Telegram alert
        if (reason.includes('Stop Loss') || reason.includes('Trailing Stop')) {
            await telegramAlerts.sendStockStopLoss(
                symbol,
                position.entry,
                exitPrice,
                pnlPercent,
                position.trailingStop || position.stopLoss
            );
        } else if (reason.includes('Profit Target')) {
            await telegramAlerts.sendStockTakeProfit(
                symbol,
                position.entry,
                exitPrice,
                pnlPercent,
                position.target
            );
        }

        // Track trade
        const tradeRecord = {
            time: Date.now(),
            side: 'sell',
            reason,
            pnl: pnlPercent
        };
        const recent = recentTrades.get(symbol) || [];
        recent.push(tradeRecord);
        recentTrades.set(symbol, recent);

        positions.delete(symbol);

    } catch (error) {
        console.error(`❌ Error closing position ${symbol}:`, error.message);
    }
}

// ===== MAIN TRADING LOOP =====
async function tradingLoop() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏰ ${new Date().toLocaleTimeString()} - ${new Date().toLocaleDateString()}`);

    scanCount++;
    lastScanTime = new Date();

    if (!isMarketOpen()) {
        console.log('⏸️  Market is closed');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
    }

    if (isTradingTime()) {
        await managePositions();
        await scanForBreakouts();
    } else {
        // After 3:55 PM: Just manage positions (close only)
        await managePositions();
    }

    console.log(`📊 Status: ${positions.size} positions | ${totalTradesToday} trades today`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ===== API ENDPOINTS =====
app.get('/api/trading/status', async (req, res) => {
    try {
        const positionsUrl = `${alpacaConfig.baseURL}/v2/positions`;
        const positionsResponse = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const account = accountResponse.data;
        const equity = parseFloat(account.equity);
        const lastEquity = parseFloat(account.last_equity);

        const positionsData = positionsResponse.data.map(pos => ({
            id: pos.asset_id || pos.symbol,
            symbol: pos.symbol,
            side: 'long',
            quantity: parseFloat(pos.qty),
            entryPrice: parseFloat(pos.avg_entry_price),
            currentPrice: parseFloat(pos.current_price),
            unrealizedPnL: parseFloat(pos.unrealized_pl),
            pnl: parseFloat(pos.unrealized_pl),
            strategy: 'HVB',
            openTime: Date.now(),
            confidence: 0.85
        }));

        res.json({
            success: true,
            data: {
                isRunning: true,
                strategy: 'High-Volume Breakout',
                performance: {
                    totalTrades: totalTradesToday,
                    activePositions: positionsData.length,
                    totalProfit: equity - 100000,
                    winRate: 0,
                    profitFactor: 0
                },
                positions: positionsData,
                portfolioValue: equity,
                dailyPnL: equity - lastEquity,
                lastUpdate: lastScanTime
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/accounts/summary', async (req, res) => {
    try {
        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const account = accountResponse.data;
        const equity = parseFloat(account.equity);
        const cash = parseFloat(account.cash);

        res.json({
            success: true,
            data: {
                realAccount: {
                    balance: cash,
                    equity,
                    pnl: equity - 100000,
                    pnlPercent: ((equity - 100000) / 100000) * 100
                },
                demoAccount: {
                    balance: cash,
                    equity,
                    pnl: equity - 100000,
                    pnlPercent: ((equity - 100000) / 100000) * 100,
                    canReset: true
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        bot: 'high-volume-breakout-bot',
        strategy: 'High-Volume Breakout',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ===== START SERVER AND TRADING LOOP =====
app.listen(PORT, async () => {
    console.log(`\n✅ High-Volume Breakout Bot running on port ${PORT}`);
    console.log(`📊 Monitoring ${SYMBOLS.length} symbols`);
    console.log(`⏰ Scan interval: ${HVB_CONFIG.scanIntervalSeconds} seconds\n`);

    // Start trading loop
    await tradingLoop();
    setInterval(tradingLoop, HVB_CONFIG.scanIntervalSeconds * 1000);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down High-Volume Breakout Bot...');
    console.log(`📊 Final Stats: ${positions.size} positions | ${totalTradesToday} trades today`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down High-Volume Breakout Bot...');
    process.exit(0);
});
