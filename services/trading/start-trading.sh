#!/bin/bash

# NexusTradeAI - Trading Server Startup Script
# This script starts the trading server in the background

cd "$(dirname "$0")"

# Check if already running
if pgrep -f "node.*profitable-trading-server.js" > /dev/null; then
    echo "⚠️  Trading server is already running"
    echo "To restart, run: ./stop-trading.sh && ./start-trading.sh"
    exit 1
fi

# Start the server
echo "🚀 Starting NexusTradeAI Trading Server..."
nohup node profitable-trading-server.js > trading.log 2>&1 &

# Wait for server to start
sleep 3

# Check if started successfully
if pgrep -f "node.*profitable-trading-server.js" > /dev/null; then
    echo "✅ Trading server started successfully"
    echo "   Dashboard: http://localhost:3000/"
    echo "   API: http://localhost:3002/"
    echo "   Logs: tail -f trading.log"

    # Auto-start the trading engine
    sleep 2
    echo ""
    echo "🤖 Starting trading engine..."
    curl -s -X POST http://localhost:3002/api/trading/start > /dev/null
    echo "✅ Trading engine started"
else
    echo "❌ Failed to start trading server"
    echo "Check logs: cat trading.log"
    exit 1
fi
