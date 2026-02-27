#!/bin/bash

###############################################################################
# NEXUSTRADEAI - SERVICE STATUS CHECKER
###############################################################################
# Diagnose what's running and what's not
###############################################################################

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          🔍 NexusTradeAI Service Status Check             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Function to check port
check_port() {
    local port=$1
    local service=$2

    if lsof -i :$port 2>/dev/null | grep LISTEN > /dev/null; then
        echo "   ✅ Port $port ($service): RUNNING"
        lsof -i :$port | grep LISTEN | awk '{print "      PID:", $2, "Command:", $1}'
    else
        echo "   ❌ Port $port ($service): NOT RUNNING"
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 PORT STATUS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_port 3000 "Dashboard Frontend"
check_port 3001 "Trading Bot API / Market Data"
check_port 3002 "Trading Server"
check_port 3003 "Broker API"
check_port 3011 "Performance API"
check_port 3012 "Banking Service"
check_port 8080 "Dashboard API"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 PM2 MANAGED PROCESSES:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v pm2 &> /dev/null; then
    pm2 list
else
    echo "   ⚠️  PM2 not installed (services not managed)"
    echo "   💡 Run: npm install -g pm2"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 ALL NODE.JS PROCESSES:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ps aux | grep -E "node.*trading|node.*bot|node.*unified|node.*server" | grep -v grep | awk '{print "   PID:", $2, "CPU:", $3"%", "MEM:", $4"%", "Command:", $11, $12, $13}'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗂️  STALE PID FILE CHECK:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f /tmp/nexustradeai_pids.txt ]; then
    echo "   Found PID file: /tmp/nexustradeai_pids.txt"
    echo "   PIDs in file:"
    cat /tmp/nexustradeai_pids.txt | while read pid; do
        if ps -p $pid > /dev/null 2>&1; then
            echo "      $pid - ✅ RUNNING"
        else
            echo "      $pid - ❌ DEAD (stale)"
        fi
    done
    echo ""
    echo "   💡 Clean up stale PIDs: rm /tmp/nexustradeai_pids.txt"
else
    echo "   ✅ No stale PID file found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RECENT LOG FILES:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Bot logs:"
find ~/Desktop/NexusTradeAI/clients/bot-dashboard/logs -name "*.log" -type f -mtime -1 2>/dev/null | while read log; do
    size=$(ls -lh "$log" | awk '{print $5}')
    mtime=$(stat -f "%Sm" "$log")
    echo "      $(basename $log) - $size - Modified: $mtime"
done || echo "      No recent bot logs found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 RECOMMENDATIONS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Count running services
running_services=$(lsof -i :3000,:3001,:3002,:3003,:3011,:3012,:8080 2>/dev/null | grep LISTEN | wc -l | tr -d ' ')

if [ "$running_services" -eq 0 ]; then
    echo "   ⚠️  NO SERVICES RUNNING!"
    echo ""
    echo "   To start services:"
    echo "      Using PM2 (recommended):  ./START_BOT_MANAGED.sh"
    echo "      Or all services:          ./START_ALL_SERVICES_MANAGED.sh"
    echo "      Old method (not recommended): ./START_ALL_SERVICES.sh"
elif [ "$running_services" -lt 3 ]; then
    echo "   ⚠️  Only $running_services service(s) running (expected 2-6)"
    echo ""
    echo "   Some services may have crashed. Check logs:"
    echo "      tail -f ~/Desktop/NexusTradeAI/clients/bot-dashboard/logs/*.log"
else
    echo "   ✅ $running_services service(s) running - looks good!"
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "   💡 Install PM2 for auto-restart on crash:"
    echo "      npm install -g pm2"
    echo "      Then run: ./START_BOT_MANAGED.sh"
fi

echo ""
