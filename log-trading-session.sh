#!/bin/bash

# Log Trading Session - Records position snapshots
# Saves to CSV for analysis

LOG_DIR="/Users/theophilusogieva/Desktop/NexusTradeAI/services/trading/logs"
SESSION_LOG="$LOG_DIR/trading_session_$(date +%Y%m%d_%H%M%S).csv"

echo "Starting trading session logger..."
echo "Logging to: $SESSION_LOG"
echo ""

# Create CSV header
echo "timestamp,symbol,side,quantity,entry,current,pnl,pnl_pct,total_pnl,win_rate,active_positions" > "$SESSION_LOG"

echo "Logging every 5 minutes. Press Ctrl+C to stop."
echo ""

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Get trading status
    STATUS=$(curl -s http://localhost:3002/api/trading/status 2>/dev/null)

    if [ ! -z "$STATUS" ]; then
        # Parse and log using Python
        echo "$STATUS" | python3 << EOF >> "$SESSION_LOG"
import sys
import json
from datetime import datetime

try:
    data = json.load(sys.stdin)
    positions = data['data']['positions']
    perf = data['data']['performance']

    timestamp = "$TIMESTAMP"
    total_pnl = sum(p['pnl'] for p in positions)
    win_rate = perf.get('winRate', 0) * 100
    active_pos = len(positions)

    for p in positions:
        pnl_pct = (p['pnl'] / (p['entry'] * p['quantity'])) * 100
        print(f"{timestamp},{p['symbol']},{p['side']},{p['quantity']},{p['entry']:.2f},{p['current']:.2f},{p['pnl']:.2f},{pnl_pct:.2f},{total_pnl:.2f},{win_rate:.1f},{active_pos}")

except Exception as e:
    pass
EOF

        echo "$(date '+%H:%M:%S') - Logged snapshot ($(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['positions']))" 2>/dev/null) positions)"
    else
        echo "$(date '+%H:%M:%S') - Bot not responding, skipping..."
    fi

    sleep 300  # 5 minutes
done
