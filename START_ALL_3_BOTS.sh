#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🚀 STARTING 3-STRATEGY TRADING SYSTEM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Stop existing bots first
echo "🛑 Stopping any existing bots..."
pm2 stop orb-bot gap-fade-bot hvb-bot 2>/dev/null || true
pm2 delete orb-bot gap-fade-bot hvb-bot 2>/dev/null || true

# Start all 3 bots using PM2
echo ""
echo "🟢 Starting ORB Bot (Port 3002)..."
pm2 start ecosystem.config.js --only orb-bot

echo "🟠 Starting Gap Fade Bot (Port 3007)..."
pm2 start ecosystem.config.js --only gap-fade-bot

echo "🟢 Starting High-Volume Breakout Bot (Port 3008)..."
pm2 start ecosystem.config.js --only hvb-bot

# Start dashboard
echo "📊 Starting Dashboard (Port 3000)..."
pm2 start ecosystem.config.js --only bot-dashboard

# Save PM2 configuration
pm2 save

# Wait for bots to start
echo ""
echo "⏳ Waiting for bots to initialize..."
sleep 5

# Show status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ✅ ALL BOTS STARTED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
pm2 list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   📊 HEALTH CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "ORB Bot (Port 3002):"
curl -s http://localhost:3002/health | python3 -m json.tool

echo ""
echo "Gap Fade Bot (Port 3007):"
curl -s http://localhost:3007/health | python3 -m json.tool

echo ""
echo "High-Volume Breakout Bot (Port 3008):"
curl -s http://localhost:3008/health | python3 -m json.tool

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🌐 DASHBOARD URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   Open dashboard at: http://localhost:3000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   📝 IMPORTANT NOTES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Each bot runs INDEPENDENTLY with its own edge"
echo "2. ORB: Trades 1-3 times/week (patient, high win rate)"
echo "3. Gap Fade: Trades 2-5 times/week (mean reversion shorts)"
echo "4. HVB: Trades 3-7 times/week (volume breakouts)"
echo ""
echo "5. Track all trades in: 3_STRATEGY_PERFORMANCE_TRACKER.csv"
echo "6. After 30 trades PER STRATEGY, compare which works best"
echo "7. NO COMPLAINING about \"no trades today\" - that's normal!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
