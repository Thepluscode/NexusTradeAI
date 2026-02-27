const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ===== INFRASTRUCTURE =====
const { getTelegramAlertService } = require('../../infrastructure/notifications/telegram-alerts');

/**
 * GAP FADE (MEAN REVERSION) TRADING BOT
 *
 * THE EDGE: "Stocks that gap up 3-5% at open often fade back down as early buyers
 *            take profits and no new buyers step in"
 *
 * ENTRY RULES:
 * 1. Stock gaps up 3-5% at market open (compare today's open to yesterday's close)
 * 2. Wait for first 5-minute candle to close red (bearish)
 * 3. Enter SHORT when price breaks below first 5-min low
 * 4. Volume must be below average (sign of exhaustion)
 *
 * EXIT RULES:
 * 1. Profit target: -2% from gap (back toward previous close)
 * 2. Stop loss: +1.5% above entry
 * 3. Time exit: 11:00 AM (close all positions)
 *
 * POSITION SIZING:
 * - Risk 1% of portfolio per trade
 * - Max 3 positions at once
 */

const app = express();
const PORT = process.env.GAP_FADE_PORT || 3007;

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

// ===== GAP FADE CONFIGURATION =====
const GAP_FADE_CONFIG = {
    minGapPercent: 0.03,           // 3% minimum gap
    maxGapPercent: 0.05,           // 5% maximum gap
    volumeThreshold: 1.0,          // Below average volume (exhaustion)
    profitTarget: 0.02,            // 2% profit target (gap fill)
    stopLoss: 0.015,               // 1.5% stop loss
    timeExitHour: 11,              // 11:00 AM exit
    timeExitMinute: 0,
    maxPositions: 3,               // Max 3 positions at once
    riskPerTrade: 0.01,            // 1% risk per trade
    scanIntervalSeconds: 60,       // Check every 60 seconds
    firstCandleDuration: 5,        // First 5-minute candle
};

// ===== TRADING UNIVERSE (20 LIQUID STOCKS FOR GAPS) =====
const SYMBOLS = [
    // Tech (common gap candidates)
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META',
    'AMD', 'NFLX', 'PYPL', 'SQ', 'SHOP', 'COIN',

    // Other sectors
    'SPY', 'QQQ',
    'BA', 'DIS', 'NKE', 'SBUX', 'UBER'
];

// ===== STATE MANAGEMENT =====
const gapData = new Map();         // symbol -> { yesterdayClose, todayOpen, gapPercent, firstCandleLow }
const positions = new Map();       // symbol -> { entry, shares, stopLoss, target, entryTime }
const dailyVolumes = new Map();    // symbol -> average volume (20-day)
let totalTradesToday = 0;
let scanCount = 0;
let lastScanTime = null;

// Anti-churning protection
const MAX_TRADES_PER_DAY = 10;
const recentTrades = new Map();

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     📉 GAP FADE (MEAN REVERSION) TRADING BOT             ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║  STRATEGY: Gap Fade (Short)                               ║');
console.log('║  SYMBOLS: 20 liquid stocks                                 ║');
console.log('║  ENTRY: 3-5% gap + first 5-min red + break below low      ║');
console.log('║  EXIT: -2% gap fill OR +1.5% stop OR 11:00 AM             ║');
console.log('║  MAX POSITIONS: 3                                          ║');
console.log('║  MAX TRADES/DAY: 10                                        ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ===== MARKET HOURS AND TIME CHECKS =====
function getMarketTimes() {
    const now = new Date();
    const marketOpen = new Date(now);
    marketOpen.setHours(9, 30, 0, 0);

    const firstCandleEnd = new Date(now);
    firstCandleEnd.setHours(9, 35, 0, 0); // First 5 minutes

    const timeExit = new Date(now);
    timeExit.setHours(GAP_FADE_CONFIG.timeExitHour, GAP_FADE_CONFIG.timeExitMinute, 0, 0);

    const marketClose = new Date(now);
    marketClose.setHours(16, 0, 0, 0);

    return { marketOpen, firstCandleEnd, timeExit, marketClose, now };
}

function isMarketOpen() {
    const { marketOpen, marketClose, now } = getMarketTimes();
    const day = now.getDay();
    return day >= 1 && day <= 5 && now >= marketOpen && now < marketClose;
}

function isFirstCandlePeriod() {
    const { marketOpen, firstCandleEnd, now } = getMarketTimes();
    return now >= marketOpen && now < firstCandleEnd;
}

function isTradingTime() {
    const { firstCandleEnd, timeExit, now } = getMarketTimes();
    return now >= firstCandleEnd && now < timeExit;
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

async function getYesterdayClose(symbol) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 5); // Go back 5 days to account for weekends

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
                limit: 5
            }
        });

        const bars = response.data?.bars || [];
        if (bars.length < 2) return null;

        // Get second-to-last bar (yesterday's close)
        return bars[bars.length - 2].c;
    } catch (error) {
        return null;
    }
}

async function getTodayBars(symbol, timeframe = '1Min') {
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
                timeframe: timeframe,
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

        const bars = response.data?.bars || [];
        if (bars.length === 0) return null;

        const totalVolume = bars.reduce((sum, bar) => sum + bar.v, 0);
        return totalVolume / bars.length;
    } catch (error) {
        return null;
    }
}

// ===== STEP 1: DETECT GAPS (9:30-9:35 AM) =====
async function detectGaps() {
    console.log(`\n🌅 FIRST 5 MINUTES (9:30-9:35 AM)`);
    console.log(`📊 Detecting gaps for ${SYMBOLS.length} symbols...`);

    for (const symbol of SYMBOLS) {
        try {
            // Get yesterday's close
            const yesterdayClose = await getYesterdayClose(symbol);
            if (!yesterdayClose) {
                console.log(`   ⚠️  ${symbol}: No historical data`);
                continue;
            }

            // Get today's bars
            const bars = await getTodayBars(symbol);
            if (bars.length === 0) {
                console.log(`   ⚠️  ${symbol}: No data yet`);
                continue;
            }

            // Get today's open (first bar)
            const todayOpen = bars[0].o;
            const gapPercent = (todayOpen - yesterdayClose) / yesterdayClose;

            // Check if gap is in our range (3-5% UP)
            if (gapPercent >= GAP_FADE_CONFIG.minGapPercent && gapPercent <= GAP_FADE_CONFIG.maxGapPercent) {

                // Calculate first 5-minute candle stats
                const firstFiveMinBars = bars.slice(0, 5);
                const firstCandleHigh = Math.max(...firstFiveMinBars.map(b => b.h));
                const firstCandleLow = Math.min(...firstFiveMinBars.map(b => b.l));
                const firstCandleClose = firstFiveMinBars[firstFiveMinBars.length - 1]?.c || todayOpen;
                const isRedCandle = firstCandleClose < todayOpen;

                gapData.set(symbol, {
                    yesterdayClose,
                    todayOpen,
                    gapPercent,
                    firstCandleHigh,
                    firstCandleLow,
                    isRedCandle
                });

                console.log(`   ✅ ${symbol}: Gap +${(gapPercent * 100).toFixed(2)}% (${yesterdayClose.toFixed(2)} -> ${todayOpen.toFixed(2)}) | First 5-min: ${isRedCandle ? '🔴 RED' : '🟢 GREEN'}`);
            }

        } catch (error) {
            console.log(`   ❌ ${symbol}: Error - ${error.message}`);
        }
    }

    console.log(`✅ Gaps detected: ${gapData.size} candidates\n`);
}

// ===== STEP 2: SCAN FOR FADE SETUPS (9:35 AM - 11:00 AM) =====
async function scanForFadeSetups() {
    console.log(`\n🔍 FADE SCAN - ${new Date().toLocaleTimeString()}`);
    console.log(`📊 Scanning ${gapData.size} gap candidates for fade setups...`);

    const signals = [];

    for (const [symbol, gap] of gapData.entries()) {
        try {
            // Skip if already have position
            if (positions.has(symbol)) {
                continue;
            }

            // Skip if hit max positions
            if (positions.size >= GAP_FADE_CONFIG.maxPositions) {
                console.log(`⚠️  Max positions (${GAP_FADE_CONFIG.maxPositions}) reached`);
                break;
            }

            // Skip if hit daily trade limit
            if (totalTradesToday >= MAX_TRADES_PER_DAY) {
                console.log(`⚠️  Daily trade limit (${MAX_TRADES_PER_DAY}) reached`);
                break;
            }

            // CONDITION 1: First 5-min candle must be RED
            if (!gap.isRedCandle) {
                continue;
            }

            // Get current price
            const currentPrice = await getCurrentPrice(symbol);
            if (!currentPrice) {
                continue;
            }

            // CONDITION 2: Price must break below first 5-min low
            if (currentPrice >= gap.firstCandleLow) {
                continue; // No breakdown yet
            }

            // CONDITION 3: Volume must be below average (exhaustion)
            const bars = await getTodayBars(symbol);
            const currentVolume = bars.reduce((sum, bar) => sum + bar.v, 0);

            let averageVolume = dailyVolumes.get(symbol);
            if (!averageVolume) {
                averageVolume = await getAverageVolume(symbol);
                if (averageVolume) {
                    dailyVolumes.set(symbol, averageVolume);
                }
            }

            if (!averageVolume || currentVolume > averageVolume * GAP_FADE_CONFIG.volumeThreshold) {
                console.log(`   ⏸️  ${symbol}: Breakdown but volume too high (${(currentVolume / averageVolume).toFixed(1)}x)`);
                continue;
            }

            // FADE SETUP CONFIRMED!
            const signal = {
                symbol,
                currentPrice,
                yesterdayClose: gap.yesterdayClose,
                todayOpen: gap.todayOpen,
                gapPercent: gap.gapPercent,
                firstCandleLow: gap.firstCandleLow,
                currentVolume,
                averageVolume,
                volumeRatio: currentVolume / averageVolume
            };

            signals.push(signal);
            console.log(`\n🚨 FADE SETUP: ${symbol}`);
            console.log(`   💰 Current: $${currentPrice.toFixed(2)}`);
            console.log(`   📈 Gap: +${(gap.gapPercent * 100).toFixed(2)}% (${gap.yesterdayClose.toFixed(2)} -> ${gap.todayOpen.toFixed(2)})`);
            console.log(`   🔴 First 5-min Low: $${gap.firstCandleLow.toFixed(2)} (BROKEN)`);
            console.log(`   📊 Volume: ${(currentVolume / averageVolume).toFixed(1)}x average (WEAK)`);

            // Execute short trade immediately
            await executeShortTrade(signal);

        } catch (error) {
            console.log(`   ❌ ${symbol}: Error - ${error.message}`);
        }
    }

    if (signals.length === 0) {
        console.log(`   ⏸️  No fade setups found this scan`);
    }

    console.log(`✅ Scan complete: ${signals.length} fades executed\n`);
}

// ===== STEP 3: EXECUTE SHORT TRADE =====
async function executeShortTrade(signal) {
    try {
        console.log(`\n💼 EXECUTING SHORT TRADE: ${signal.symbol}`);

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
        const riskAmount = equity * GAP_FADE_CONFIG.riskPerTrade;
        const stopDistance = signal.currentPrice * GAP_FADE_CONFIG.stopLoss;
        const shares = Math.floor(riskAmount / stopDistance);

        if (shares < 1) {
            console.log(`   ⚠️  Position size too small (${shares} shares), skipping`);
            return null;
        }

        // Calculate stop and target
        const stopPrice = signal.currentPrice * (1 + GAP_FADE_CONFIG.stopLoss);
        const targetPrice = signal.currentPrice * (1 - GAP_FADE_CONFIG.profitTarget);

        console.log(`   💰 Entry (SHORT): $${signal.currentPrice.toFixed(2)}`);
        console.log(`   📊 Shares: ${shares}`);
        console.log(`   🔻 Stop: $${stopPrice.toFixed(2)} (+${(GAP_FADE_CONFIG.stopLoss * 100).toFixed(1)}%)`);
        console.log(`   🎯 Target: $${targetPrice.toFixed(2)} (-${(GAP_FADE_CONFIG.profitTarget * 100).toFixed(1)}%)`);
        console.log(`   💵 Position Size: $${(signal.currentPrice * shares).toFixed(2)}`);

        // Place SHORT order with Alpaca
        const orderUrl = `${alpacaConfig.baseURL}/v2/orders`;
        const orderResponse = await axios.post(orderUrl, {
            symbol: signal.symbol,
            qty: shares,
            side: 'sell',  // SHORT
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
            gapPercent: signal.gapPercent,
            volumeRatio: signal.volumeRatio
        });

        // Track trade
        totalTradesToday++;
        const tradeRecord = {
            time: Date.now(),
            side: 'short',
            price: signal.currentPrice,
            shares
        };
        const recent = recentTrades.get(signal.symbol) || [];
        recent.push(tradeRecord);
        recentTrades.set(signal.symbol, recent);

        console.log(`✅ SHORT ORDER PLACED: ${shares} shares of ${signal.symbol} @ $${signal.currentPrice.toFixed(2)}`);

        // Send Telegram alert
        await telegramAlerts.sendStockEntry(
            signal.symbol,
            signal.currentPrice,
            stopPrice,
            targetPrice,
            shares,
            'GAP_FADE'
        );

        return orderResponse.data;

    } catch (error) {
        console.error(`❌ Short trade execution failed: ${error.message}`);
        return null;
    }
}

// ===== STEP 4: MANAGE POSITIONS =====
async function managePositions() {
    try {
        if (positions.size === 0) {
            return;
        }

        console.log(`\n📊 POSITION MANAGEMENT - ${positions.size} open SHORT positions`);

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

            if (!position || alpacaPos.side !== 'short') {
                continue;
            }

            const currentPrice = parseFloat(alpacaPos.current_price);
            const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)} | Target: $${position.target.toFixed(2)}`);

            let shouldClose = false;
            let closeReason = null;

            // EXIT CONDITION 1: Profit Target Hit (price fell -2%)
            if (currentPrice <= position.target) {
                shouldClose = true;
                closeReason = `Gap Fade Complete (-${(GAP_FADE_CONFIG.profitTarget * 100).toFixed(1)}%)`;
            }

            // EXIT CONDITION 2: Stop Loss Hit (price rose +1.5%)
            if (currentPrice >= position.stopLoss) {
                shouldClose = true;
                closeReason = `Stop Loss Hit (+${(GAP_FADE_CONFIG.stopLoss * 100).toFixed(1)}%)`;
            }

            // EXIT CONDITION 3: Time Exit (11:00 AM)
            if (isTimeToExit()) {
                shouldClose = true;
                closeReason = `Time Exit (11:00 AM) - ${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%`;
            }

            if (shouldClose) {
                console.log(`\n🚪 CLOSING SHORT POSITION: ${symbol} - ${closeReason}`);
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
            side: 'buy',  // BUY to close SHORT
            type: 'market',
            time_in_force: 'day'
        }, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const position = positions.get(symbol);

        console.log(`✅ SHORT POSITION CLOSED: ${symbol}`);
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
        } else if (reason.includes('Gap Fade Complete')) {
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
            side: 'cover',
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

    if (isFirstCandlePeriod()) {
        // 9:30-9:35 AM: Detect gaps and build first candle data
        await detectGaps();
    } else if (isTradingTime()) {
        // 9:35 AM - 11:00 AM: Scan for fade setups and manage positions
        await managePositions();
        await scanForFadeSetups();
    } else {
        // After 11:00 AM: Just manage positions (close only)
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

        const positionsData = positionsResponse.data
            .filter(pos => pos.side === 'short')
            .map(pos => ({
                id: pos.asset_id || pos.symbol,
                symbol: pos.symbol,
                side: 'short',
                quantity: parseFloat(pos.qty),
                entryPrice: parseFloat(pos.avg_entry_price),
                currentPrice: parseFloat(pos.current_price),
                unrealizedPnL: parseFloat(pos.unrealized_pl),
                pnl: parseFloat(pos.unrealized_pl),
                strategy: 'GAP_FADE',
                openTime: Date.now(),
                confidence: 0.85
            }));

        res.json({
            success: true,
            data: {
                isRunning: true,
                strategy: 'Gap Fade (Mean Reversion)',
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
        bot: 'gap-fade-bot',
        strategy: 'Gap Fade (Mean Reversion)',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ===== START SERVER AND TRADING LOOP =====
app.listen(PORT, async () => {
    console.log(`\n✅ Gap Fade Bot running on port ${PORT}`);
    console.log(`📊 Monitoring ${SYMBOLS.length} symbols`);
    console.log(`⏰ Scan interval: ${GAP_FADE_CONFIG.scanIntervalSeconds} seconds\n`);

    // Start trading loop
    await tradingLoop();
    setInterval(tradingLoop, GAP_FADE_CONFIG.scanIntervalSeconds * 1000);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Gap Fade Bot...');
    console.log(`📊 Final Stats: ${positions.size} positions | ${totalTradesToday} trades today`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down Gap Fade Bot...');
    process.exit(0);
});
