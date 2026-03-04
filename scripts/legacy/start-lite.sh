#!/bin/bash
# NexusTradeAI - LITE Start Script
# Runs only essential services to reduce system load

echo "🚀 Starting NexusTradeAI (LITE Mode)..."
echo "📊 Running 3 essential services only"

cd "$(dirname "$0")"

# Kill any existing processes on our ports
echo "Cleaning up..."
lsof -ti:3001,3002,3005 | xargs kill -9 2>/dev/null || true
sleep 1

# Start Stock Trading Bot - Port 3002
echo "Starting Stock Bot on port 3002..."
node clients/bot-dashboard/unified-trading-bot.js &
sleep 2

# Start Forex Trading Bot - Port 3005
echo "Starting Forex Bot on port 3005..."
node clients/bot-dashboard/unified-forex-bot.js &
sleep 2

# Start Market Data Server - Port 3001 (needed for dashboard)
echo "Starting Market Data on port 3001..."
node services/api/live-data-server.js &
sleep 1

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          LITE MODE - 3 SERVICES RUNNING                       ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║  Stock Bot     - http://localhost:3002                        ║"
echo "║  Forex Bot     - http://localhost:3005                        ║"
echo "║  Market Data   - http://localhost:3001                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 To start Dashboard: cd clients/bot-dashboard && npm run dev"
echo ""
echo "Press Ctrl+C to stop all services"

wait
