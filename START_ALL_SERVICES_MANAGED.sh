#!/bin/bash

###############################################################################
# NEXUSTRADEAI - COMPLETE SYSTEM WITH PM2 PROCESS MANAGEMENT
###############################################################################
# Starts all services with auto-restart on crash
###############################################################################

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🚀 Starting NexusTradeAI Complete System (Managed)       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 (Process Manager)..."
    npm install -g pm2
    echo "✅ PM2 installed!"
    echo ""
fi

# Stop any old instances
echo "🛑 Stopping old instances..."
pm2 delete all 2>/dev/null || true
sleep 2

# Navigate to project root
PROJECT_ROOT=~/Desktop/NexusTradeAI
cd "$PROJECT_ROOT"

# Create logs directories
mkdir -p logs
mkdir -p services/trading/logs
mkdir -p services/api/logs
mkdir -p clients/bot-dashboard/logs

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 STARTING BACKEND SERVICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Trading Server (Port 3002)
if [ -f "services/trading/profitable-trading-server.js" ]; then
    echo "📡 Starting Trading Server (Port 3002)..."
    cd "$PROJECT_ROOT/services/trading"
    pm2 start profitable-trading-server.js \
        --name "trading-server" \
        --time \
        --log "logs/trading-server-pm2.log" \
        --error "logs/trading-server-error.log" \
        --restart-delay 5000
    sleep 2
fi

# 2. Market Data API (Port 3001)
if [ -f "services/api/live-data-server.js" ]; then
    echo "📊 Starting Market Data API (Port 3001)..."
    cd "$PROJECT_ROOT/services/api"
    pm2 start live-data-server.js \
        --name "market-data" \
        --time \
        --log "logs/market-data-pm2.log" \
        --error "logs/market-data-error.log" \
        --restart-delay 5000
    sleep 2
fi

# 3. Unified Trading Bot (Port 3001 - Alternative)
if [ -f "clients/bot-dashboard/unified-trading-bot.js" ]; then
    echo "🤖 Starting Unified Trading Bot..."
    cd "$PROJECT_ROOT/clients/bot-dashboard"
    pm2 start unified-trading-bot.js \
        --name "unified-bot" \
        --time \
        --log "logs/unified-bot-pm2.log" \
        --error "logs/unified-bot-error.log" \
        --restart-delay 5000 \
        --max-restarts 10 \
        --min-uptime 10000
    sleep 2
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 STARTING FRONTEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Dashboard (Port 3000)
cd "$PROJECT_ROOT/clients/bot-dashboard"
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dashboard dependencies..."
    npm install
fi

pm2 start npm \
    --name "dashboard" \
    -- run dev \
    --time \
    --log "logs/dashboard-pm2.log" \
    --error "logs/dashboard-error.log"

sleep 3

# Save PM2 process list
pm2 save

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ ALL SERVICES STARTED SUCCESSFULLY          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 RUNNING SERVICES:"
echo ""
pm2 list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 ACCESS POINTS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🎨 Dashboard:             http://localhost:3000"
echo "   🤖 Trading Bot API:       http://localhost:3001/api/trading/status"
echo "   💹 Trading Server:        http://localhost:3002"
echo "   💚 Health Check:          http://localhost:3001/health"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 PM2 COMMANDS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Status:              pm2 list"
echo "   Logs (all):          pm2 logs"
echo "   Logs (specific):     pm2 logs unified-bot"
echo "   Monitor:             pm2 monit"
echo "   Restart service:     pm2 restart unified-bot"
echo "   Stop all:            pm2 stop all"
echo "   Delete all:          pm2 delete all"
echo ""
echo "✨ Services will auto-restart on crash - no more switching off!"
echo ""
