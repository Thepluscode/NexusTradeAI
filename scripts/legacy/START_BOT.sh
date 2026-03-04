#!/bin/bash

# ====================================================================
# NEXUSTRADEAI - UNIFIED TRADING BOT STARTER
# ====================================================================
# This script starts the unified trading bot with all features:
# - Momentum Scanner (catches 10%+ moves like SMX)
# - Trailing Stops (locks in profits automatically)
# - Real Alpaca Integration (pulls actual positions)
# ====================================================================

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       🚀 Starting NexusTradeAI Unified Trading Bot        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Stop any old bots
echo "🛑 Stopping old bots..."
lsof -ti :3000,:3001,:3002,:3003,:3004,:3005 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 2

# Navigate to bot directory
cd ~/Desktop/NexusTradeAI/clients/bot-dashboard

# Start unified bot
echo "✅ Starting unified trading bot on port 3000..."
node unified-trading-bot.js > logs/unified-bot-$(date +%Y%m%d-%H%M%S).log 2>&1 &

sleep 3

# Check if running
if lsof -ti :3000 > /dev/null 2>&1; then
    echo ""
    echo "✅ SUCCESS! Bot is running"
    echo ""
    echo "📊 Dashboard: http://localhost:3000"
    echo "🔗 API: http://localhost:3000/api/trading/status"
    echo "📝 Logs: ~/Desktop/NexusTradeAI/clients/bot-dashboard/logs/"
    echo ""
    echo "View logs:"
    echo "  tail -f ~/Desktop/NexusTradeAI/clients/bot-dashboard/logs/unified-bot-*.log"
else
    echo ""
    echo "❌ ERROR: Bot failed to start"
    echo "Check logs:"
    echo "  tail ~/Desktop/NexusTradeAI/clients/bot-dashboard/logs/unified-bot-*.log"
fi
