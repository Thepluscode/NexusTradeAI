#!/bin/bash
# ================================================================
# PAPER TRADING BOT - BACKTESTED STRATEGY
# ================================================================
# Strategy: SMA10/SMA20 Crossover
# Proven: 69.3% return, 65.7% win rate, Sharpe 1.17
# ================================================================

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     NEXUSTRADEAI - PAPER TRADING (BACKTESTED STRATEGY)        ║"
echo "╟────────────────────────────────────────────────────────────────╢"
echo "║  Strategy: SMA10/SMA20 Crossover                              ║"
echo "║  Profit Target: 15%  |  Stop Loss: 10%                        ║"
echo "║  Win Rate: 65.7%     |  Sharpe: 1.17                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# Create logs directory for trade tracking
mkdir -p logs/paper_trading
TRADE_LOG="logs/paper_trading/trades_$(date +%Y%m%d).log"
DAILY_LOG="logs/paper_trading/daily_summary_$(date +%Y%m%d).log"

echo "📊 Trade log: $TRADE_LOG"
echo ""

# Set environment to PAPER trading mode
export TRADING_MODE=paper
export PAPER_TRADING=true
export REAL_TRADING_ENABLED=false

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
lsof -ti:3002 | xargs kill -9 2>/dev/null || true
sleep 1

# Start the profitable trading server (uses winning-strategy.js with backtested params)
echo "🚀 Starting Paper Trading Bot on port 3002..."

# Log startup
echo "=== PAPER TRADING SESSION STARTED ===" >> "$TRADE_LOG"
echo "Date: $(date)" >> "$TRADE_LOG"
echo "Strategy: SMA10/SMA20 Crossover" >> "$TRADE_LOG"
echo "Parameters: 15% PT, 10% SL" >> "$TRADE_LOG"
echo "======================================" >> "$TRADE_LOG"

# Start the trading server
cd services/trading
node profitable-trading-server.js 2>&1 | tee -a "../../$TRADE_LOG" &
TRADING_PID=$!
cd ../..

sleep 3

# Check if it started
if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Paper Trading Bot is RUNNING"
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  PAPER TRADING ACTIVE                                         ║"
    echo "╟────────────────────────────────────────────────────────────────╢"
    echo "║  API:       http://localhost:3002                             ║"
    echo "║  Status:    http://localhost:3002/api/trading/status          ║"
    echo "║  Positions: http://localhost:3002/api/trading/debug-positions ║"
    echo "║  Trade Log: $TRADE_LOG               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📌 Commands:"
    echo "   Start trading:  curl -X POST http://localhost:3002/api/trading/start"
    echo "   Stop trading:   curl -X POST http://localhost:3002/api/trading/stop"
    echo "   Check status:   curl http://localhost:3002/api/trading/status"
    echo ""
    echo "🌐 To start Dashboard: cd clients/bot-dashboard && npm run dev"
    echo ""
    echo "Press Ctrl+C to stop"
else
    echo "❌ Failed to start Paper Trading Bot"
    echo "Check logs for errors"
    exit 1
fi

# Wait for trading server
wait $TRADING_PID
