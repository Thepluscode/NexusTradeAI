#!/bin/bash

###############################################################################
# NEXUSTRADEAI - MANAGED BOT STARTER (with PM2)
###############################################################################
# This script uses PM2 (process manager) to ensure services auto-restart
###############################################################################

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    🚀 Starting NexusTradeAI with Process Management       ║"
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
cd ~/Desktop/NexusTradeAI

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 STARTING TRADING BOT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start Unified Trading Bot with PM2
cd clients/bot-dashboard
pm2 start unified-trading-bot.js \
    --name "trading-bot" \
    --time \
    --log "logs/unified-bot-pm2.log" \
    --error "logs/unified-bot-error.log" \
    --restart-delay 5000 \
    --max-restarts 10 \
    --min-uptime 10000

sleep 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 STARTING DASHBOARD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start React Dashboard with PM2
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
echo "║                  ✅ ALL SERVICES STARTED                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 SERVICES RUNNING:"
echo ""
pm2 list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 ACCESS POINTS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🤖 Trading Bot API:  http://localhost:3001/api/trading/status"
echo "   🎨 Dashboard:        http://localhost:3000"
echo "   💚 Health Check:     http://localhost:3001/health"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 USEFUL COMMANDS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   View status:         pm2 list"
echo "   View logs:           pm2 logs"
echo "   View bot logs:       pm2 logs trading-bot"
echo "   Restart bot:         pm2 restart trading-bot"
echo "   Stop all:            pm2 stop all"
echo "   Delete all:          pm2 delete all"
echo "   Monitor live:        pm2 monit"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ BENEFITS OF PM2:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ✅ Auto-restart on crash (no more 'services switching off')"
echo "   ✅ Logs automatically saved"
echo "   ✅ Services run even after terminal closes"
echo "   ✅ Monitoring dashboard with 'pm2 monit'"
echo "   ✅ Process health tracking"
echo ""
echo "💡 TIP: Services will now auto-restart if they crash!"
echo ""
