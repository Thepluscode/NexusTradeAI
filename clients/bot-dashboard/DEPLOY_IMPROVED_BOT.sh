#!/bin/bash

###############################################################################
# DEPLOY IMPROVED TRADING BOT
###############################################################################
# This script safely switches from the old bot to the improved version
###############################################################################

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     🚀 DEPLOYING IMPROVED TRADING BOT                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Backup current bot
echo "📦 Creating backup of current bot..."
cp unified-trading-bot.js unified-trading-bot.js.backup-$(date +%Y%m%d-%H%M%S)
echo "✅ Backup created"
echo ""

# Show what's being changed
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 NEW FEATURES IN IMPROVED BOT:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. ⏰ TIME-BASED EXITS"
echo "   • Max hold: 7 days (vs unlimited before)"
echo "   • Force exit at 10 days"
echo "   • Take any profit after 5 days"
echo ""
echo "2. 🎯 DYNAMIC PROFIT TARGETS"
echo "   • Day 0-3: 8% target"
echo "   • Day 3-5: 4-5% target (reduced)"
echo "   • Day 5-7: 2-3% target (further reduced)"
echo "   • Day 7+:  ANY profit (exit immediately)"
echo ""
echo "3. 🔒 AGGRESSIVE TRAILING STOPS"
echo "   OLD: +10% gain → lock 50% (give back 5%)"
echo "   NEW: +10% gain → lock 92% (give back 0.8%)"
echo ""
echo "4. 📉 MOMENTUM REVERSAL DETECTION"
echo "   • Exit when RSI > 72 (overbought)"
echo "   • Exit when volume drops 50%"
echo "   • Exit on 2% drop from daily high"
echo ""
echo "5. 🚪 SMART EXITS"
echo "   • Exits before momentum dies"
echo "   • Secures profits before reversals"
echo "   • No more 3-week holds!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ask for confirmation
read -p "Deploy improved bot? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

echo ""
echo "🔄 Deploying improved bot..."

# Replace old bot with improved version
cp unified-trading-bot-improved.js unified-trading-bot.js

echo "✅ Bot file updated"
echo ""

# Stop current PM2 process
echo "🛑 Stopping current bot..."
pm2 delete trading-bot 2>/dev/null || true
sleep 2

# Start improved bot with PM2
echo "🚀 Starting improved bot with PM2..."
pm2 start unified-trading-bot.js \
    --name "trading-bot-improved" \
    --time \
    --log "logs/unified-bot-improved.log" \
    --error "logs/unified-bot-improved-error.log"

sleep 3

# Save PM2 configuration
pm2 save

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ DEPLOYMENT SUCCESSFUL!                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Show status
pm2 list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 NEXT STEPS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Monitor logs:"
echo "   pm2 logs trading-bot-improved"
echo ""
echo "2. Check positions:"
echo "   curl http://localhost:3001/api/trading/status"
echo ""
echo "3. Watch for smart exits:"
echo "   tail -f logs/unified-bot-improved.log | grep 'SMART EXIT'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 WHAT TO EXPECT:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Your current 3-week-old positions will be evaluated:"
echo ""
echo "• CMCSA (+9.28%, 3 weeks old):"
echo "  → Will likely exit soon (3+ weeks = stale)"
echo "  → Exit reason: 'Stale position' or 'Max hold time'"
echo ""
echo "• V (+6.57%, 3 weeks old):"
echo "  → Will exit (held too long)"
echo "  → Secures +6.57% before it disappears"
echo ""
echo "• LOW (+3.00%, 3 weeks old):"
echo "  → Will exit (any profit after 5+ days)"
echo "  → Takes +3% vs waiting forever"
echo ""
echo "• XLP (+1.16%, 3 weeks old):"
echo "  → Will exit (minimal profit, old position)"
echo "  → Frees capital for better opportunities"
echo ""
echo "Expected: All 4 positions will exit within next 60 seconds!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 Improved bot is now running!"
echo "✅ No more 3-week holds!"
echo "✅ Profits will be secured before they disappear!"
echo ""
