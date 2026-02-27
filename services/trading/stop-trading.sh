#!/bin/bash

# NexusTradeAI - Stop Trading Server Script

echo "🛑 Stopping NexusTradeAI Trading Server..."

# Find and kill the process
pkill -f "node.*profitable-trading-server.js"

# Wait a moment
sleep 1

# Check if stopped
if pgrep -f "node.*profitable-trading-server.js" > /dev/null; then
    echo "⚠️  Server still running, forcing shutdown..."
    pkill -9 -f "node.*profitable-trading-server.js"
    sleep 1
fi

# Verify
if pgrep -f "node.*profitable-trading-server.js" > /dev/null; then
    echo "❌ Failed to stop server"
    exit 1
else
    echo "✅ Trading server stopped"
fi
