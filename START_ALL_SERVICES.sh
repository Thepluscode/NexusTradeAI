#!/bin/bash

###############################################################################
# NexusTradeAI - Master Startup Script
# Starts all 9 backend services + React frontend
###############################################################################

ROOT="$(cd "$(dirname "$0")" && pwd)"
BOT_DIR="$ROOT/clients/bot-dashboard"
LOG_DIR="$BOT_DIR/logs"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PID_FILE="/tmp/nexustradeai_pids.txt"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       NexusTradeAI - Starting All Services   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Helpers ────────────────────────────────────────────────────────────────

mkdir -p "$LOG_DIR"
rm -f "$PID_FILE"

is_port_in_use() {
    lsof -i :"$1" > /dev/null 2>&1
}

kill_port() {
    local pid
    pid=$(lsof -ti :"$1" 2>/dev/null)
    if [ -n "$pid" ]; then
        echo -e "  ${YELLOW}⚠️  Port $1 already in use — killing old process${NC}"
        kill -9 $pid 2>/dev/null
        sleep 1
    fi
}

start_node() {
    local name=$1
    local port=$2
    local file=$3      # absolute path to JS file
    local logfile=$4

    kill_port "$port"

    node "$file" >> "$logfile" 2>&1 &
    local pid=$!
    echo $pid >> "$PID_FILE"

    sleep 2

    if lsof -i :"$port" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅ $name${NC}  →  http://localhost:$port  (PID $pid)"
    else
        echo -e "  ${RED}❌ $name failed to start — check $logfile${NC}"
    fi
}

# ── Backend Services ────────────────────────────────────────────────────────

echo -e "${BLUE}🔧 Starting backend services...${NC}"
echo ""

# 1. Market Data API  (3001)
start_node "Market Data API    " 3001 \
    "$ROOT/services/api/live-data-server.js" \
    "$LOG_DIR/market-data.log"

# 2. Stock Trading Bot  (3002)
start_node "Stock Trading Bot  " 3002 \
    "$BOT_DIR/unified-trading-bot.js" \
    "$LOG_DIR/unified-bot-protected.log"

# 3. Broker API  (3003)
start_node "Broker API         " 3003 \
    "$ROOT/services/broker-api/server.js" \
    "$LOG_DIR/broker-api.log"

# 4. Risk Manager  (3004) - uses mock server (no MongoDB required)
start_node "Risk Manager       " 3004 \
    "$ROOT/services/risk-management-service/mock-risk-server.js" \
    "$LOG_DIR/risk-manager.log"

# 5. Forex Bot  (3005)
start_node "Forex Bot          " 3005 \
    "$BOT_DIR/unified-forex-bot.js" \
    "$LOG_DIR/unified-forex-bot.log"

# 6. Crypto Bot  (3006)
start_node "Crypto Bot         " 3006 \
    "$BOT_DIR/unified-crypto-bot.js" \
    "$LOG_DIR/crypto-bot.log"

# 7. AI Service  (5001)
start_node "AI Service         " 5001 \
    "$ROOT/services/ai-service/lightweight-ai-server.js" \
    "$LOG_DIR/ai-service.log"

# 8. Dashboard API  (8080)
start_node "Dashboard API      " 8080 \
    "$ROOT/services/dashboard/dashboard-api-server.js" \
    "$LOG_DIR/dashboard-api.log"

# 9. Banking Service  (3012)
start_node "Banking Service    " 3012 \
    "$ROOT/services/banking/banking-integration-service.js" \
    "$LOG_DIR/banking-service.log"

# ── Frontend ────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}🎨 Starting React dashboard...${NC}"
echo ""

kill_port 3000
kill_port 3020

cd "$BOT_DIR" || exit 1
npm run dev >> "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID >> "$PID_FILE"

sleep 4

# Vite may pick 3000 or the next free port — find it
FRONTEND_PORT=$(lsof -p $FRONTEND_PID -i 4 2>/dev/null | grep LISTEN | grep -o ':\d*' | tr -d ':' | head -1)
if [ -n "$FRONTEND_PORT" ]; then
    echo -e "  ${GREEN}✅ React Dashboard     →  http://localhost:$FRONTEND_PORT  (PID $FRONTEND_PID)${NC}"
else
    echo -e "  ${YELLOW}⚠️  Dashboard starting — check $LOG_DIR/frontend.log${NC}"
fi

cd "$ROOT" || exit 1

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║              All Services Launched           ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Stock Bot    →  :3002/api/trading/status   ║"
echo "║  Forex Bot    →  :3005/api/forex/status     ║"
echo "║  Crypto Bot   →  :3006/api/crypto/status    ║"
echo "║  Market Data  →  :3001                      ║"
echo "║  Risk Manager →  :3004                      ║"
echo "║  AI Service   →  :5001/health               ║"
echo "║  Dashboard API→  :8080                      ║"
echo "║  Banking      →  :3012                      ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  PIDs saved to: /tmp/nexustradeai_pids.txt  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Stop everything:  ./STOP_ALL_SERVICES.sh"
echo "  Watch bot logs:   tail -f $LOG_DIR/unified-bot-protected.log"
echo ""

# ── Regenerate stop script ───────────────────────────────────────────────────

cat > "$ROOT/STOP_ALL_SERVICES.sh" << 'STOP'
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
STOP

chmod +x "$ROOT/STOP_ALL_SERVICES.sh"
