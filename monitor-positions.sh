#!/bin/bash

# Monitor Trading Positions - Continuous Updates
# Shows position changes every 30 seconds

echo "═══════════════════════════════════════════════════════════════"
echo "  NexusTradeAI - Position Monitor"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Monitoring 10 active positions..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    clear
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Position Monitor - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # Get trading status
    STATUS=$(curl -s http://localhost:3002/api/trading/status 2>/dev/null)

    if [ -z "$STATUS" ]; then
        echo "❌ Trading bot not responding"
        sleep 30
        continue
    fi

    # Parse and display using Python
    echo "$STATUS" | python3 << 'EOF'
import sys
import json

try:
    data = json.load(sys.stdin)
    perf = data['data']['performance']
    positions = data['data']['positions']
    daily_pnl = data['data']['dailyPnL']

    # Summary
    print(f"Status: {'✅ Running' if data['data']['isRunning'] else '❌ Stopped'}")
    print(f"Active Positions: {perf['activePositions']}/10")
    print(f"Daily P&L: ${daily_pnl:.2f}")
    print(f"Total Trades: {perf['totalTrades']}")
    print(f"Win Rate: {perf['winRate']*100:.1f}%")
    print("")
    print("─────────────────────────────────────────────────────────────")
    print("ACTIVE POSITIONS:")
    print("─────────────────────────────────────────────────────────────")
    print(f"{'Symbol':<8} {'Side':<6} {'Qty':>4} {'Entry':>9} {'Current':>9} {'P&L':>10} {'%':>8}")
    print("─────────────────────────────────────────────────────────────")

    # Sort by P&L (winners first)
    positions_sorted = sorted(positions, key=lambda x: x['pnl'], reverse=True)

    total_pnl = 0
    winners = 0
    losers = 0

    for p in positions_sorted:
        pnl = p['pnl']
        pnl_pct = (pnl / (p['entry'] * p['quantity'])) * 100
        pnl_sign = '+' if pnl > 0 else ''
        icon = '✅' if pnl > 0 else '❌'

        if pnl > 0:
            winners += 1
        else:
            losers += 1

        total_pnl += pnl

        print(f"{p['symbol']:<8} {p['side']:<6} {p['quantity']:>4} ${p['entry']:>8.2f} ${p['current']:>8.2f} {icon} {pnl_sign}${pnl:>7.2f} {pnl_sign}{pnl_pct:>6.2f}%")

    print("─────────────────────────────────────────────────────────────")
    print(f"Winners: {winners} | Losers: {losers} | Win Rate: {(winners/(winners+losers)*100):.1f}%")
    print(f"Total Unrealized P&L: ${total_pnl:+.2f}")
    print("═════════════════════════════════════════════════════════════")

except Exception as e:
    print(f"Error parsing data: {e}")
EOF

    echo ""
    echo "Next update in 30 seconds..."
    sleep 30
done
