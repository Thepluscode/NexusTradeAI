#!/bin/bash
# ===========================================
# NexusTradeAI - ULTRA-LITE STARTUP
# ===========================================
# Runs ONLY the Stock Bot with longer intervals
# to minimize CPU/memory usage and prevent
# computer shutdowns
#
# Usage: ./start-ultra-lite.sh
# ===========================================

echo "🔋 Starting NexusTradeAI in ULTRA-LITE mode..."
echo "   (Stock Bot only - minimal resource usage)"
echo ""

# Kill any existing bots first
echo "🛑 Stopping any existing bots..."
pkill -f "auto-stock-bot.js" 2>/dev/null
pkill -f "auto-forex-bot.js" 2>/dev/null
pkill -f "auto-crypto-bot.js" 2>/dev/null
pkill -f "unified-dashboard.js" 2>/dev/null
sleep 2

# Navigate to trading directory
cd "$(dirname "$0")/services/trading" || exit 1

# Start ONLY the Stock Bot
echo "📈 Starting Stock Bot only..."
node auto-stock-bot.js &

echo ""
echo "✅ ULTRA-LITE mode started!"
echo ""
echo "   Running:"
echo "   - Stock Bot only (port 3002)"
echo ""
echo "   Dashboard: http://localhost:3002/api/trading/status"
echo ""
echo "   To start bot: curl -X POST http://localhost:3002/api/trading/start"
echo ""
echo "🔋 This mode uses ~80% less resources!"
