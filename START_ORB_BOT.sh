#!/bin/bash

# START_ORB_BOT.sh
# Starts the Opening Range Breakout trading bot

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🚀 STARTING OPENING RANGE BREAKOUT BOT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stop old momentum-chasing bot if running
echo ""
echo "🛑 Stopping old bot (port 3002)..."
lsof -ti :3002 | xargs kill -9 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✅ Old bot stopped"
else
    echo "   ℹ️  No bot was running on port 3002"
fi

# Wait a moment
sleep 2

# Start new ORB bot
echo ""
echo "🚀 Starting ORB bot..."
cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard

# Create logs directory if it doesn't exist
mkdir -p logs

# Start bot in background
node orb-trading-bot.js > logs/orb-bot.log 2>&1 &

# Wait for bot to start
sleep 3

# Check if bot is running
if lsof -ti :3002 > /dev/null 2>&1; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   ✅ ORB BOT STARTED SUCCESSFULLY!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📊 STRATEGY: Opening Range Breakout"
    echo "🎯 EDGE: Buy breakouts above first 15-min high"
    echo "📈 EXIT: +2% profit OR -1.5% stop OR 3:55 PM"
    echo "🔢 MAX POSITIONS: 5"
    echo "📊 MAX TRADES/DAY: 15"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 HOW TO MONITOR:"
    echo "   • View logs:  tail -f logs/orb-bot.log"
    echo "   • Check health: curl http://localhost:3002/health"
    echo "   • Dashboard: http://localhost:3000"
    echo ""
    echo "🛑 HOW TO STOP:"
    echo "   • Run: lsof -ti :3002 | xargs kill -9"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🎯 30-DAY CHALLENGE STARTED"
    echo "   Week 1 Goal: 10 trades, >40% win rate"
    echo "   Log every trade in STOCK_BOT_PERFORMANCE_TRACKER.csv"
    echo ""
    echo "🚀 BOT IS NOW LIVE! Good luck!"
    echo ""
else
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   ❌ FAILED TO START BOT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 TROUBLESHOOTING:"
    echo "   1. Check logs: cat logs/orb-bot.log"
    echo "   2. Verify .env file exists and has API keys"
    echo "   3. Check if port 3002 is available: lsof -i :3002"
    echo ""
fi
