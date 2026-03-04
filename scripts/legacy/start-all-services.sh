#!/bin/bash
# NexusTradeAI - Start All Services
# Run this script to start all backend services

echo "🚀 Starting NexusTradeAI Services..."

cd "$(dirname "$0")"

# Kill any existing processes on our ports
echo "Cleaning up existing processes..."
lsof -ti:3001,3002,3003,3004,3005,5001,8080 | xargs kill -9 2>/dev/null || true
sleep 1

# Start Trading Engine (Stock Bot) - Port 3002
echo "Starting Trading Engine on port 3002..."
node clients/bot-dashboard/unified-trading-bot.js &
sleep 2

# Start Forex Bot - Port 3005
echo "Starting Forex Bot on port 3005..."
node clients/bot-dashboard/unified-forex-bot.js &
sleep 2

# Start Market Data Server - Port 3001
echo "Starting Market Data Server on port 3001..."
node services/api/live-data-server.js &
sleep 1

# Start Risk Manager - Port 3004
echo "Starting Risk Manager on port 3004..."
node services/risk-management-service/mock-risk-server.js &
sleep 1

# Start AI Service - Port 5001
echo "Starting AI Service on port 5001..."
node services/ai-service/lightweight-ai-server.js &
sleep 1

# Start Dashboard API - Port 8080
echo "Starting Dashboard API on port 8080..."
node services/dashboard/dashboard-api-server.js &
sleep 1

# Start Broker API - Port 3003
echo "Starting Broker API on port 3003..."
node services/broker-api/server.js &
sleep 1

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          ALL SERVICES STARTED                                  ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║  Trading Engine (Stock Bot)  - http://localhost:3002          ║"
echo "║  Forex Bot                   - http://localhost:3005          ║"
echo "║  Market Data Server          - http://localhost:3001          ║"
echo "║  Risk Manager                - http://localhost:3004          ║"
echo "║  AI Service                  - http://localhost:5001          ║"
echo "║  Dashboard API               - http://localhost:8080          ║"
echo "║  Broker API                  - http://localhost:3003          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Dashboard: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for all background processes
wait
