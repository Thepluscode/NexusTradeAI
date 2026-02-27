#!/bin/bash
echo "🛑 Stopping all NexusTradeAI services..."

# Kill by saved PIDs
if [ -f /tmp/nexustradeai_pids.txt ]; then
    while read -r pid; do
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null
        fi
    done < /tmp/nexustradeai_pids.txt
    rm -f /tmp/nexustradeai_pids.txt
fi

# Also kill by port in case PIDs drifted
for port in 3001 3002 3003 3004 3005 3006 5001 8080 3012 3000 3020; do
    pid=$(lsof -ti :"$port" 2>/dev/null)
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null
done

echo "✅ All services stopped."
