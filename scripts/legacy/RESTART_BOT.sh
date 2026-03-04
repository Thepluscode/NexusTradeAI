#!/bin/bash

echo "🔄 Restarting ORB Trading Bot..."

pm2 restart all
pm2 save

sleep 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ✅ BOT RESTARTED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

pm2 list

echo ""
echo "📊 Health Check:"
curl -s http://localhost:3002/health | python3 -m json.tool

