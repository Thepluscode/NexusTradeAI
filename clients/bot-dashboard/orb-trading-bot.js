const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ===== INFRASTRUCTURE =====
const { getTelegramAlertService } = require('../../infrastructure/notifications/telegram-alerts');

/**
 * OPENING RANGE BREAKOUT (ORB) TRADING BOT
 *
 * THE EDGE: "Buy stocks that break above their first 15-minute high on strong volume,
 *            sell at end of day or 2% profit, stop at 1.5% loss"
 *
 * ENTRY RULES:
 * 1. Wait 15 minutes after market open (9:30-9:45 AM)
 * 2. Record high of first 15 minutes
 * 3. When price breaks above opening range high + $0.10
 * 4. AND volume is 2x average
 * 5. Enter immediately at market price
 *
 * EXIT RULES:
 * 1. Profit target: +2% from entry
 * 2. Stop loss: -1.5% from entry
 * 3. Time exit: 3:55 PM (close before market close)
 *
 * POSITION SIZING:
 * - Risk 1% of portfolio per trade
 * - Max 5 positions at once
 */

const app = express();
const PORT = process.env.TRADING_PORT || 3002;

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

// ===== OPENING RANGE BREAKOUT CONFIGURATION =====
const ORB_CONFIG = {
    openingRangeMinutes: 15,        // First 15 minutes (9:30-9:45 AM)
    breakoutConfirmation: 0.10,     // $0.10 above opening range high
    volumeMultiplier: 2.0,          // 2x average volume required
    profitTarget: 0.02,             // 2% profit target
    stopLoss: 0.015,                // 1.5% stop loss
    timeExitHour: 15,               // 3:55 PM exit
    timeExitMinute: 55,
    maxPositions: 5,                // Max 5 positions at once
    riskPerTrade: 0.01,             // 1% risk per trade
    scanIntervalSeconds: 30,        // Check every 30 seconds after 9:45 AM
};

// ===== TRADING UNIVERSE (10-15 LIQUID STOCKS) =====
const SYMBOLS = [
    // ETFs (most liquid)
    'SPY',    // S&P 500
    'QQQ',    // Nasdaq

    // Mega-cap tech (high volume)
    'AAPL',   // Apple
    'MSFT',   // Microsoft
    'NVDA',   // Nvidia
    'TSLA',   // Tesla
    'AMZN',   // Amazon
    'GOOGL',  // Google
    'META',   // Meta

    // Large-cap liquid stocks
    'COST',   // Costco
    'WMT',    // Walmart
    'JPM',    // JPMorgan
    'BAC',    // Bank of America
];

// ===== STATE MANAGEMENT =====
const openingRanges = new Map();  // symbol -> { high, low, volume, timestamp }
const positions = new Map();       // symbol -> { entry, shares, stopLoss, target, entryTime }
const dailyVolumes = new Map();    // symbol -> average volume (20-day)
let totalTradesToday = 0;
let scanCount = 0;
let lastScanTime = null;

// Anti-churning protection
const MAX_TRADES_PER_DAY = 15;
const recentTrades = new Map();

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     📊 OPENING RANGE BREAKOUT (ORB) TRADING BOT           ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║  STRATEGY: Opening Range Breakout                          ║');
console.log('║  SYMBOLS: 13 liquid stocks                                 ║');
console.log('║  ENTRY: Break above first 15-min high + volume             ║');
console.log('║  EXIT: +2% profit OR -1.5% stop OR 3:55 PM                 ║');
console.log('║  MAX POSITIONS: 5                                          ║');
console.log('║  MAX TRADES/DAY: 15                                        ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ===== MARKET HOURS AND TIME CHECKS =====
function getMarketTimes() {
    const now = new Date();
    const marketOpen = new Date(now);
    marketOpen.setHours(9, 30, 0, 0);

    const openingRangeEnd = new Date(now);
    openingRangeEnd.setHours(9, 45, 0, 0);

    const timeExit = new Date(now);
    timeExit.setHours(ORB_CONFIG.timeExitHour, ORB_CONFIG.timeExitMinute, 0, 0);

    const marketClose = new Date(now);
    marketClose.setHours(16, 0, 0, 0);

    return { marketOpen, openingRangeEnd, timeExit, marketClose, now };
}

function isMarketOpen() {
    const { marketOpen, marketClose, now } = getMarketTimes();
    const day = now.getDay();
    return day >= 1 && day <= 5 && now >= marketOpen && now < marketClose;
}

function isOpeningRangePeriod() {
    const { marketOpen, openingRangeEnd, now } = getMarketTimes();
    return now >= marketOpen && now < openingRangeEnd;
}

function isTradingTime() {
    const { openingRangeEnd, timeExit, now } = getMarketTimes();
    return now >= openingRangeEnd && now < timeExit;
}

function isTimeToExit() {
    const { timeExit, now } = getMarketTimes();
    return now >= timeExit;
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

async function getAverageVolume(symbol, days = 20) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days - 5); // Extra days for holidays

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

        const bars = response.data?.bars || [];
        if (bars.length === 0) return null;

        const totalVolume = bars.reduce((sum, bar) => sum + bar.v, 0);
        return totalVolume / bars.length;
    } catch (error) {
        return null;
    }
}

// ===== STEP 1: BUILD OPENING RANGES (9:30-9:45 AM) =====
async function buildOpeningRanges() {
    console.log(`\n🌅 OPENING RANGE PERIOD (9:30-9:45 AM)`);
    console.log(`📊 Building opening ranges for ${SYMBOLS.length} symbols...`);

    for (const symbol of SYMBOLS) {
        try {
            const bars = await getTodayBars(symbol);

            if (bars.length === 0) {
                console.log(`   ⚠️  ${symbol}: No data yet`);
                continue;
            }

            // Calculate opening range (first 15 minutes)
            const high = Math.max(...bars.map(bar => bar.h));
            const low = Math.min(...bars.map(bar => bar.l));
            const volume = bars.reduce((sum, bar) => sum + bar.v, 0);

            openingRanges.set(symbol, {
                high,
                low,
                volume,
                timestamp: Date.now()
            });

            console.log(`   ✅ ${symbol}: Range $${low.toFixed(2)} - $${high.toFixed(2)} (Vol: ${(volume / 1000).toFixed(0)}K)`);

        } catch (error) {
            console.log(`   ❌ ${symbol}: Error - ${error.message}`);
        }
    }

    console.log(`✅ Opening ranges built for ${openingRanges.size} symbols\n`);
}

// ===== STEP 2: SCAN FOR BREAKOUTS (9:45 AM - 3:55 PM) =====
async function scanForBreakouts() {
    console.log(`\n🔍 BREAKOUT SCAN - ${new Date().toLocaleTimeString()}`);
    console.log(`📊 Scanning ${SYMBOLS.length} symbols for ORB breakouts...`);

    const signals = [];

    for (const symbol of SYMBOLS) {
        try {
            // Skip if already have position
            if (positions.has(symbol)) {
                continue;
            }

            // Skip if hit max positions
            if (positions.size >= ORB_CONFIG.maxPositions) {
                console.log(`⚠️  Max positions (${ORB_CONFIG.maxPositions}) reached`);
                break;
            }

            // Skip if hit daily trade limit
            if (totalTradesToday >= MAX_TRADES_PER_DAY) {
                console.log(`⚠️  Daily trade limit (${MAX_TRADES_PER_DAY}) reached`);
                break;
            }

            // Check if we have opening range for this symbol
            const openingRange = openingRanges.get(symbol);
            if (!openingRange) {
                continue;
            }

            // Get current price
            const currentPrice = await getCurrentPrice(symbol);
            if (!currentPrice) {
                continue;
            }

            // ENTRY CONDITION 1: Price must break above opening range high + confirmation
            const breakoutPrice = openingRange.high + ORB_CONFIG.breakoutConfirmation;
            if (currentPrice < breakoutPrice) {
                continue; // No breakout yet
            }

            // ENTRY CONDITION 2: Volume must be 2x average
            const bars = await getTodayBars(symbol);
            const currentVolume = bars.reduce((sum, bar) => sum + bar.v, 0);

            // Get or fetch average volume
            let averageVolume = dailyVolumes.get(symbol);
            if (!averageVolume) {
                averageVolume = await getAverageVolume(symbol);
                if (averageVolume) {
                    dailyVolumes.set(symbol, averageVolume);
                }
            }

            if (!averageVolume || currentVolume < averageVolume * ORB_CONFIG.volumeMultiplier) {
                console.log(`   ⏸️  ${symbol}: Breakout but low volume (${(currentVolume / averageVolume).toFixed(1)}x)`);
                continue;
            }

            // BREAKOUT CONFIRMED!
            const signal = {
                symbol,
                currentPrice,
                openingRangeHigh: openingRange.high,
                breakoutPrice,
                currentVolume,
                averageVolume,
                volumeRatio: currentVolume / averageVolume
            };

            signals.push(signal);
            console.log(`\n🚨 BREAKOUT: ${symbol}`);
            console.log(`   💰 Current: $${currentPrice.toFixed(2)}`);
            console.log(`   📊 OR High: $${openingRange.high.toFixed(2)}`);
            console.log(`   📈 Breakout: $${breakoutPrice.toFixed(2)}`);
            console.log(`   📊 Volume: ${(currentVolume / averageVolume).toFixed(1)}x average`);

            // Execute trade immediately
            await executeTrade(signal);

        } catch (error) {
            console.log(`   ❌ ${symbol}: Error - ${error.message}`);
        }
    }

    if (signals.length === 0) {
        console.log(`   ⏸️  No breakouts found this scan`);
    }

    console.log(`✅ Scan complete: ${signals.length} breakouts found\n`);
}

// ===== STEP 3: EXECUTE TRADE =====
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
        const riskAmount = equity * ORB_CONFIG.riskPerTrade;
        const stopDistance = signal.currentPrice * ORB_CONFIG.stopLoss;
        const shares = Math.floor(riskAmount / stopDistance);

        if (shares < 1) {
            console.log(`   ⚠️  Position size too small (${shares} shares), skipping`);
            return null;
        }

        // Calculate stop and target
        const stopPrice = signal.currentPrice * (1 - ORB_CONFIG.stopLoss);
        const targetPrice = signal.currentPrice * (1 + ORB_CONFIG.profitTarget);

        console.log(`   💰 Entry: $${signal.currentPrice.toFixed(2)}`);
        console.log(`   📊 Shares: ${shares}`);
        console.log(`   🔻 Stop: $${stopPrice.toFixed(2)} (-${(ORB_CONFIG.stopLoss * 100).toFixed(1)}%)`);
        console.log(`   🎯 Target: $${targetPrice.toFixed(2)} (+${(ORB_CONFIG.profitTarget * 100).toFixed(1)}%)`);
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
            entryTime: new Date(),
            openingRangeHigh: signal.openingRangeHigh,
            volumeRatio: signal.volumeRatio
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
            'ORB'
        );

        return orderResponse.data;

    } catch (error) {
        console.error(`❌ Trade execution failed: ${error.message}`);
        return null;
    }
}

// ===== STEP 4: MANAGE POSITIONS =====
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
                // Position not tracked (probably from before bot started)
                continue;
            }

            const currentPrice = parseFloat(alpacaPos.current_price);
            const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)} | Target: $${position.target.toFixed(2)}`);

            let shouldClose = false;
            let closeReason = null;

            // EXIT CONDITION 1: Profit Target Hit (+2%)
            if (currentPrice >= position.target) {
                shouldClose = true;
                closeReason = `Profit Target Hit (+${(ORB_CONFIG.profitTarget * 100).toFixed(1)}%)`;
            }

            // EXIT CONDITION 2: Stop Loss Hit (-1.5%)
            if (currentPrice <= position.stopLoss) {
                shouldClose = true;
                closeReason = `Stop Loss Hit (-${(ORB_CONFIG.stopLoss * 100).toFixed(1)}%)`;
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

// ===== STEP 5: CLOSE POSITION =====
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
        if (reason.includes('Stop Loss')) {
            await telegramAlerts.sendStockStopLoss(
                symbol,
                position.entry,
                exitPrice,
                pnlPercent,
                position.stopLoss
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

    if (isOpeningRangePeriod()) {
        // 9:30-9:45 AM: Build opening ranges
        await buildOpeningRanges();
    } else if (isTradingTime()) {
        // 9:45 AM - 3:55 PM: Scan for breakouts and manage positions
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
            strategy: 'ORB',
            openTime: Date.now(),
            confidence: 0.85
        }));

        res.json({
            success: true,
            data: {
                isRunning: true,
                strategy: 'Opening Range Breakout',
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
        bot: 'orb-trading-bot',
        strategy: 'Opening Range Breakout',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ===== START SERVER AND TRADING LOOP =====
app.listen(PORT, async () => {
    console.log(`\n✅ ORB Trading Bot running on port ${PORT}`);
    console.log(`📊 Monitoring ${SYMBOLS.length} symbols`);
    console.log(`⏰ Scan interval: ${ORB_CONFIG.scanIntervalSeconds} seconds\n`);

    // Start trading loop
    await tradingLoop();
    setInterval(tradingLoop, ORB_CONFIG.scanIntervalSeconds * 1000);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down ORB Trading Bot...');
    console.log(`📊 Final Stats: ${positions.size} positions | ${totalTradesToday} trades today`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down ORB Trading Bot...');
    process.exit(0);
});
