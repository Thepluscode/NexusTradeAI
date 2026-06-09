const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config({ path: '../../.env' });

/**
 * IMPROVED UNIFIED TRADING BOT
 *
 * NEW EXIT MECHANISMS:
 * 1. Time-Based Exits - Close positions after 5-7 days
 * 2. Momentum Reversal Detection - Exit when trend breaks
 * 3. Aggressive Trailing Stops - Lock 80-90% of gains
 * 4. Dynamic Profit Targets - Reduce targets over time
 * 5. Volume Confirmation - Exit when volume dies
 */

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const alpacaConfig = {
    baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    apiKey: process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY,
    dataURL: 'https://data.alpaca.markets'
};

const popularStocks = require('../../services/trading/popular-stocks-list');

const positions = new Map();
let scanCount = 0;
let lastScanTime = null;

// Anti-churning protection
const recentTrades = new Map();
const stoppedOutSymbols = new Map();
const tradesPerSymbol = new Map();
let totalTradesToday = 0;

const MAX_TRADES_PER_DAY = 15;
const MAX_TRADES_PER_SYMBOL = 3;
const MIN_TIME_BETWEEN_TRADES = 10 * 60 * 1000;
const MIN_TIME_AFTER_STOP = 60 * 60 * 1000;

// ===== NEW: TIME-BASED EXIT CONFIGURATION =====
const EXIT_CONFIG = {
    maxHoldDays: 7,           // Max 7 days per position
    idealHoldDays: 3,         // Ideal 3-day momentum trades
    stalePositionDays: 10,    // Force close after 10 days

    // Dynamic profit targets based on hold time
    profitTargetByDay: {
        0: 0.08,  // Day 0-1: 8% target
        1: 0.08,  // Day 1-2: 8% target
        2: 0.08,  // Day 2-3: 8% target
        3: 0.05,  // Day 3-4: 5% target (reduce)
        4: 0.04,  // Day 4-5: 4% target
        5: 0.03,  // Day 5-6: 3% target
        6: 0.02,  // Day 6-7: 2% target
        7: 0.01   // Day 7+: ANY profit
    },

    // Aggressive trailing stops (lock more profit)
    trailingStopLevels: [
        { gainThreshold: 0.03, lockPercent: 0.60 },  // +3%: lock 60%
        { gainThreshold: 0.05, lockPercent: 0.75 },  // +5%: lock 75%
        { gainThreshold: 0.07, lockPercent: 0.85 },  // +7%: lock 85%
        { gainThreshold: 0.10, lockPercent: 0.92 }   // +10%: lock 92%
    ],

    // Momentum reversal thresholds
    momentumReversal: {
        rsiOverbought: 72,        // RSI > 72 = overbought
        volumeDropPercent: 0.50,  // 50% volume drop = fading
        dailyHighDropPercent: 0.02, // 2% from daily high = reversal
        supportBreakPercent: 0.015  // Break 1.5% below entry low
    }
};

const MOMENTUM_CONFIG = {
    tier1: {
        threshold: 2.5,
        minVolume: 500000,
        volumeRatio: 1.5,
        rsiMax: 70,
        rsiMin: 30,
        positionSize: 0.005,
        stopLoss: 0.04,
        profitTarget: 0.08,
        maxPositions: 6
    },
    tier2: {
        threshold: 5.0,
        minVolume: 750000,
        volumeRatio: 2.0,
        rsiMax: 70,
        rsiMin: 30,
        positionSize: 0.0075,
        stopLoss: 0.05,
        profitTarget: 0.10,
        maxPositions: 3
    },
    tier3: {
        threshold: 10.0,
        minVolume: 1000000,
        volumeRatio: 2.5,
        rsiMax: 75,
        rsiMin: 25,
        positionSize: 0.01,
        stopLoss: 0.06,
        profitTarget: 0.15,
        maxPositions: 2
    }
};

const TRADING_HOURS = {
    marketOpen: { hour: 9, minute: 30 },
    marketClose: { hour: 16, minute: 0 },
    avoidFirstMinutes: 30,
    avoidLastMinutes: 30
};

function isGoodTradingTime() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeInMinutes = hour * 60 + minute;

    const marketOpenTime = TRADING_HOURS.marketOpen.hour * 60 + TRADING_HOURS.marketOpen.minute;
    const marketCloseTime = TRADING_HOURS.marketClose.hour * 60 + TRADING_HOURS.marketClose.minute;

    const tradingStart = marketOpenTime + TRADING_HOURS.avoidFirstMinutes;
    const tradingEnd = marketCloseTime - TRADING_HOURS.avoidLastMinutes;

    const isMarketDay = now.getDay() >= 1 && now.getDay() <= 5;
    const isGoodTime = timeInMinutes >= tradingStart && timeInMinutes <= tradingEnd;

    return isMarketDay && isGoodTime;
}

function calculateRSI(bars, period = 14) {
    try {
        if (bars.length < period + 1) return 50;

        const closes = bars.slice(-period - 1).map(bar => bar.c);
        let gains = 0;
        let losses = 0;

        for (let i = 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));

        return rsi;
    } catch (error) {
        return 50;
    }
}

function canTrade(symbol, side = 'buy') {
    const stopTime = stoppedOutSymbols.get(symbol);
    if (stopTime) {
        const timeSinceStop = Date.now() - stopTime;
        if (timeSinceStop < MIN_TIME_AFTER_STOP) {
            return false;
        } else {
            stoppedOutSymbols.delete(symbol);
        }
    }

    if (totalTradesToday >= MAX_TRADES_PER_DAY) return false;

    const symbolTrades = tradesPerSymbol.get(symbol) || 0;
    if (symbolTrades >= MAX_TRADES_PER_SYMBOL) return false;

    const recent = recentTrades.get(symbol) || [];
    if (recent.length > 0) {
        const lastTrade = recent[recent.length - 1];
        const timeSince = Date.now() - lastTrade.time;

        if (timeSince < MIN_TIME_BETWEEN_TRADES) return false;
        if (lastTrade.side !== side && timeSince < MIN_TIME_BETWEEN_TRADES * 1.5) return false;
    }

    return true;
}

// ===== NEW: GET CURRENT MARKET DATA FOR POSITION =====
async function getCurrentMarketData(symbol) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;

        const barResponse = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: today,
                timeframe: '1Min',
                feed: 'sip',
                limit: 1000
            }
        });

        if (!barResponse.data?.bars || barResponse.data.bars.length === 0) {
            return null;
        }

        const bars = barResponse.data.bars;
        const rsi = calculateRSI(bars);

        // Calculate today's volume and daily high
        const volumeToday = bars.reduce((sum, bar) => sum + bar.v, 0);
        const dailyHigh = Math.max(...bars.map(bar => bar.h));
        const dailyLow = Math.min(...bars.map(bar => bar.l));

        return {
            rsi,
            volumeToday,
            dailyHigh,
            dailyLow,
            bars
        };
    } catch (error) {
        return null;
    }
}

// ===== NEW: CHECK IF SHOULD EXIT POSITION =====
async function shouldExitPosition(position, currentPrice, alpacaPos) {
    const entryTime = position.entryTime || new Date();
    const holdDays = (Date.now() - entryTime.getTime()) / (1000 * 60 * 60 * 24);
    const holdHours = (Date.now() - entryTime.getTime()) / (1000 * 60 * 60);
    const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;

    // Get current market data
    const marketData = await getCurrentMarketData(position.symbol);

    let exitReason = null;

    // 1. TIME-BASED EXITS (CRITICAL)
    if (holdDays >= EXIT_CONFIG.stalePositionDays) {
        exitReason = `Stale position (${holdDays.toFixed(1)} days old - max ${EXIT_CONFIG.stalePositionDays})`;
    } else if (holdDays >= EXIT_CONFIG.maxHoldDays && unrealizedPL > 0) {
        exitReason = `Max hold time reached (${holdDays.toFixed(1)} days) - taking ${unrealizedPL.toFixed(2)}% profit`;
    } else if (holdDays >= 5 && unrealizedPL > 1) {
        // After 5 days, take ANY profit > 1%
        exitReason = `5+ days old - taking ${unrealizedPL.toFixed(2)}% profit before it disappears`;
    }

    // 2. DYNAMIC PROFIT TARGET (based on hold time)
    const dayIndex = Math.min(Math.floor(holdDays), 7);
    const currentTarget = EXIT_CONFIG.profitTargetByDay[dayIndex];
    if (unrealizedPL >= currentTarget * 100) {
        exitReason = `Hit day-${dayIndex} profit target (${(currentTarget * 100).toFixed(1)}%) with ${unrealizedPL.toFixed(2)}%`;
    }

    if (marketData) {
        // 3. MOMENTUM REVERSAL DETECTION
        if (marketData.rsi > EXIT_CONFIG.momentumReversal.rsiOverbought && unrealizedPL > 2) {
            // RSI overbought + have profit = exit before reversal
            exitReason = `Overbought reversal (RSI ${marketData.rsi.toFixed(0)} > ${EXIT_CONFIG.momentumReversal.rsiOverbought}) - securing ${unrealizedPL.toFixed(2)}% profit`;
        }

        // 4. VOLUME FADE (momentum dying)
        if (position.entryVolume && marketData.volumeToday < position.entryVolume * EXIT_CONFIG.momentumReversal.volumeDropPercent) {
            if (unrealizedPL > 2 || holdDays > 3) {
                exitReason = `Volume fading (${((marketData.volumeToday / position.entryVolume) * 100).toFixed(0)}% of entry) - momentum dying`;
            }
        }

        // 5. DAILY HIGH REVERSAL (2% drop from high)
        const dropFromHigh = ((marketData.dailyHigh - currentPrice) / marketData.dailyHigh) * 100;
        if (dropFromHigh >= EXIT_CONFIG.momentumReversal.dailyHighDropPercent * 100 && unrealizedPL > 1) {
            exitReason = `Reversal from daily high (-${dropFromHigh.toFixed(2)}% from high) - securing ${unrealizedPL.toFixed(2)}% profit`;
        }
    }

    return exitReason;
}

// ===== IMPROVED: AGGRESSIVE TRAILING STOPS =====
function updateTrailingStop(position, currentPrice, unrealizedPL) {
    let stopUpdated = false;
    const gainDecimal = unrealizedPL / 100;

    // Find the highest applicable trailing stop level
    for (let i = EXIT_CONFIG.trailingStopLevels.length - 1; i >= 0; i--) {
        const level = EXIT_CONFIG.trailingStopLevels[i];

        if (gainDecimal >= level.gainThreshold) {
            // Calculate new stop (lock in X% of gains)
            const totalGain = currentPrice - position.entry;
            const lockedGain = totalGain * level.lockPercent;
            const newStop = position.entry + lockedGain;

            if (newStop > position.stopLoss) {
                console.log(`🔒 ${position.symbol}: AGGRESSIVE trailing stop raised to $${newStop.toFixed(2)} (locking in ${(level.lockPercent * 100).toFixed(0)}% of +${unrealizedPL.toFixed(2)}% gain)`);
                position.stopLoss = newStop;
                stopUpdated = true;
            }
            break; // Only apply highest level
        }
    }

    return stopUpdated;
}

async function managePositions() {
    try {
        const positionsUrl = `${alpacaConfig.baseURL}/v2/positions`;
        const response = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        if (response.data.length === 0) return;

        console.log(`\n📊 Managing ${response.data.length} positions...`);

        for (const alpacaPos of response.data) {
            const symbol = alpacaPos.symbol;
            const currentPrice = parseFloat(alpacaPos.current_price);
            const avgEntry = parseFloat(alpacaPos.avg_entry_price);
            const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;

            let position = positions.get(symbol);
            if (!position) {
                position = {
                    symbol,
                    entry: avgEntry,
                    shares: parseFloat(alpacaPos.qty),
                    stopLoss: avgEntry * 0.93,
                    target: avgEntry * 1.20,
                    strategy: 'existing',
                    entryTime: new Date()
                };
                positions.set(symbol, position);
            }

            // Calculate hold time
            const holdDays = (Date.now() - position.entryTime.getTime()) / (1000 * 60 * 60 * 24);

            // Update trailing stops (aggressive)
            updateTrailingStop(position, currentPrice, unrealizedPL);

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)} | Hold: ${holdDays.toFixed(1)}d`);

            // NEW: Check multiple exit conditions
            const exitReason = await shouldExitPosition(position, currentPrice, alpacaPos);

            if (exitReason) {
                console.log(`\n🚪 SMART EXIT: ${symbol} - ${exitReason}`);
                await closePosition(symbol, alpacaPos.qty, exitReason);
                continue;
            }

            // Traditional exits
            if (currentPrice <= position.stopLoss) {
                console.log(`\n🛑 STOP LOSS HIT: ${symbol}`);
                await closePosition(symbol, alpacaPos.qty, 'Stop Loss');
            } else if (currentPrice >= position.target) {
                console.log(`\n💰 PROFIT TARGET HIT: ${symbol}`);
                await closePosition(symbol, alpacaPos.qty, 'Profit Target');
            }
        }

    } catch (error) {
        console.error('❌ Position management error:', error.message);
    }
}

async function scanMomentumBreakouts() {
    try {
        const symbols = popularStocks.getAllSymbols();
        console.log(`\n🔍 Momentum Scan: Checking ${symbols.length} stocks...`);

        const movers = [];
        const batchSize = 20;

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const promises = batch.map(symbol => analyzeMomentum(symbol));
            const results = await Promise.allSettled(promises);

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    movers.push(result.value);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        movers.sort((a, b) => parseFloat(b.percentChange) - parseFloat(a.percentChange));

        if (movers.length > 0) {
            console.log(`🚀 Found ${movers.length} momentum breakouts!`);
            for (const mover of movers.slice(0, 5)) {
                console.log(`   📈 ${mover.symbol}: +${mover.percentChange}% (Vol: ${mover.volumeRatio}x)`);
            }

            const maxPositions = 10;
            if (positions.size < maxPositions) {
                const available = maxPositions - positions.size;
                for (const mover of movers.slice(0, available)) {
                    if (!positions.has(mover.symbol) && canTrade(mover.symbol, 'buy')) {
                        await executeTrade(mover, 'momentum');
                    }
                }
            }
        }

        return movers;

    } catch (error) {
        console.error('❌ Momentum scan error:', error.message);
        return [];
    }
}

async function analyzeMomentum(symbol) {
    try {
        if (!isGoodTradingTime()) return null;

        const today = new Date().toISOString().split('T')[0];
        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;

        const barResponse = await axios.get(barUrl, {
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

        if (!barResponse.data?.bars || barResponse.data.bars.length === 0) return null;

        const bars = barResponse.data.bars;
        const firstBar = bars[0];
        const lastBar = bars[bars.length - 1];

        const todayOpen = firstBar.o;
        const current = lastBar.c;
        const volumeToday = bars.reduce((sum, bar) => sum + bar.v, 0);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const prevDate = yesterday.toISOString().split('T')[0];

        const prevBarResponse = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: prevDate,
                end: prevDate,
                timeframe: '1Day',
                feed: 'sip',
                limit: 1
            }
        });

        const prevVolume = prevBarResponse.data?.bars?.[0]?.v || volumeToday;
        const percentChange = ((current - todayOpen) / todayOpen) * 100;
        const volumeRatio = volumeToday / (prevVolume || 1);

        const rsi = calculateRSI(bars);

        if (current < 1.0 || current > 1000) return null;
        if (volumeToday < 500000) return null;

        let tier = null;
        let config = null;

        if (percentChange >= MOMENTUM_CONFIG.tier3.threshold) {
            if (volumeRatio >= MOMENTUM_CONFIG.tier3.volumeRatio &&
                volumeToday >= MOMENTUM_CONFIG.tier3.minVolume &&
                rsi >= MOMENTUM_CONFIG.tier3.rsiMin &&
                rsi <= MOMENTUM_CONFIG.tier3.rsiMax) {
                tier = 'tier3';
                config = MOMENTUM_CONFIG.tier3;
            }
        } else if (percentChange >= MOMENTUM_CONFIG.tier2.threshold) {
            if (volumeRatio >= MOMENTUM_CONFIG.tier2.volumeRatio &&
                volumeToday >= MOMENTUM_CONFIG.tier2.minVolume &&
                rsi >= MOMENTUM_CONFIG.tier2.rsiMin &&
                rsi <= MOMENTUM_CONFIG.tier2.rsiMax) {
                tier = 'tier2';
                config = MOMENTUM_CONFIG.tier2;
            }
        } else if (percentChange >= MOMENTUM_CONFIG.tier1.threshold) {
            if (volumeRatio >= MOMENTUM_CONFIG.tier1.volumeRatio &&
                volumeToday >= MOMENTUM_CONFIG.tier1.minVolume &&
                rsi >= MOMENTUM_CONFIG.tier1.rsiMin &&
                rsi <= MOMENTUM_CONFIG.tier1.rsiMax) {
                tier = 'tier1';
                config = MOMENTUM_CONFIG.tier1;
            }
        }

        if (!tier || !config) return null;

        const tierPositions = Array.from(positions.values())
            .filter(p => p.tier === tier).length;

        if (tierPositions >= config.maxPositions) return null;

        return {
            symbol,
            price: current,
            percentChange: percentChange.toFixed(2),
            volumeRatio: volumeRatio.toFixed(2),
            volume: volumeToday,
            rsi: rsi.toFixed(2),
            tier,
            strategy: 'momentum',
            config,
            entryVolume: volumeToday  // Store entry volume for comparison
        };

    } catch (error) {
        return null;
    }
}

async function executeTrade(signal, strategy) {
    try {
        const tier = signal.tier || 'tier1';
        const config = signal.config || MOMENTUM_CONFIG.tier1;

        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const equity = parseFloat(accountResponse.data.equity);
        const positionSize = equity * config.positionSize;
        const shares = Math.floor(positionSize / signal.price);

        if (shares < 1) return null;

        const stopPrice = (signal.price * (1 - config.stopLoss)).toFixed(2);
        const targetPrice = (signal.price * (1 + config.profitTarget)).toFixed(2);

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

        positions.set(signal.symbol, {
            symbol: signal.symbol,
            shares,
            entry: signal.price,
            stopLoss: parseFloat(stopPrice),
            target: parseFloat(targetPrice),
            strategy,
            tier,
            config,
            entryTime: new Date(),
            entryVolume: signal.entryVolume,  // Store for volume comparison
            rsi: signal.rsi,
            volumeRatio: signal.volumeRatio,
            percentChange: signal.percentChange
        });

        const tradeRecord = {
            time: Date.now(),
            side: 'buy',
            price: signal.price,
            shares,
            tier
        };
        const recent = recentTrades.get(signal.symbol) || [];
        recent.push(tradeRecord);
        if (recent.length > 10) recent.shift();
        recentTrades.set(signal.symbol, recent);

        tradesPerSymbol.set(signal.symbol, (tradesPerSymbol.get(signal.symbol) || 0) + 1);
        totalTradesToday++;

        console.log(`✅ Order placed for ${shares} shares of ${signal.symbol}`);

        return orderResponse.data;

    } catch (error) {
        console.error(`❌ Trade execution failed for ${signal.symbol}:`, error.message);
        return null;
    }
}

async function closePosition(symbol, qty, reason = 'Manual') {
    try {
        const orderUrl = `${alpacaConfig.baseURL}/v2/orders`;
        const order = {
            symbol,
            qty,
            side: 'sell',
            type: 'market',
            time_in_force: 'day'
        };

        await axios.post(orderUrl, order, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        console.log(`✅ Position closed: ${symbol} (${reason})`);

        const tradeRecord = {
            time: Date.now(),
            side: 'sell',
            reason
        };
        const recent = recentTrades.get(symbol) || [];
        recent.push(tradeRecord);
        if (recent.length > 10) recent.shift();
        recentTrades.set(symbol, recent);

        if (reason && reason.includes('Stop')) {
            stoppedOutSymbols.set(symbol, Date.now());
        }

        positions.delete(symbol);

    } catch (error) {
        console.error(`❌ Error closing ${symbol}:`, error.message);
    }
}

// API Routes (same as before)
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
            side: pos.side || 'long',
            quantity: parseFloat(pos.qty),
            entryPrice: parseFloat(pos.avg_entry_price),
            currentPrice: parseFloat(pos.current_price),
            unrealizedPnL: parseFloat(pos.unrealized_pl),
            pnl: parseFloat(pos.unrealized_pl),
            strategy: 'improved-unified',
            openTime: Date.now(),
            confidence: 0.85
        }));

        res.json({
            success: true,
            data: {
                isRunning: true,
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
                    canReset: true
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', bot: 'unified-trading-bot-improved' });
});

async function tradingLoop() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏰ Trading Loop - ${new Date().toLocaleTimeString()}`);

    scanCount++;
    lastScanTime = new Date();

    await managePositions();
    await scanMomentumBreakouts();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

app.listen(PORT, async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     🚀 IMPROVED UNIFIED TRADING BOT - STARTED             ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  NEW FEATURES:                                             ║');
    console.log('║  ✅ Time-Based Exits (max 7 days)                          ║');
    console.log('║  ✅ Momentum Reversal Detection                            ║');
    console.log('║  ✅ Aggressive Trailing Stops (lock 85-92%)                ║');
    console.log('║  ✅ Dynamic Profit Targets                                 ║');
    console.log('║  ✅ Volume Confirmation                                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    await tradingLoop();
    setInterval(tradingLoop, 60000);
});

process.on('SIGINT', () => {
    console.log('\n👋 Shutting down improved trading bot...');
    process.exit(0);
});
