#!/bin/bash
# NexusTradeAI Service Manager
# Monitors and auto-restarts critical services if they crash

PROJECT_DIR="/Users/theophilusogieva/Desktop/NexusTradeAI"
LOG_DIR="$PROJECT_DIR/services/logs"
mkdir -p "$LOG_DIR"

# Service definitions: "name|port|directory|script"
SERVICES=(
    "Trading Bot|3002|$PROJECT_DIR/services/trading|profitable-trading-server.js"
    "Data Server|3001|$PROJECT_DIR/services/api|live-data-server.js"
    "AI Service|5001|$PROJECT_DIR/services/ai-service|lightweight-ai-server.js"
    "Dashboard|3000|$PROJECT_DIR/clients/bot-dashboard|npm run dev"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/service-manager.log"
}

check_port() {
    local port=$1
    lsof -i :$port -sTCP:LISTEN >/dev/null 2>&1
    return $?
}

start_service() {
    local name=$1
    local port=$2
    local dir=$3
    local script=$4

    log "${YELLOW}Starting $name on port $port...${NC}"

    if [[ "$script" == "npm run dev" ]]; then
        cd "$dir" && npm run dev > "$LOG_DIR/${name// /-}-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
    else
        cd "$dir" && node "$script" > "$LOG_DIR/${name// /-}-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
    fi

    sleep 3

    if check_port $port; then
        log "${GREEN}✅ $name started successfully${NC}"
        return 0
    else
        log "${RED}❌ $name failed to start${NC}"
        return 1
    fi
}

stop_service() {
    local port=$1
    local name=$2

    if check_port $port; then
        local pid=$(lsof -ti :$port)
        log "${YELLOW}Stopping $name (PID: $pid)...${NC}"
        kill $pid 2>/dev/null
        sleep 2
        log "${GREEN}✅ $name stopped${NC}"
    fi
}

check_and_restart() {
    local name=$1
    local port=$2
    local dir=$3
    local script=$4

    if ! check_port $port; then
        log "${RED}⚠️  $name is DOWN! Auto-restarting...${NC}"
        start_service "$name" "$port" "$dir" "$script"
    fi
}

case "$1" in
    start)
        log "=== Starting All Services ==="
        for service in "${SERVICES[@]}"; do
            IFS='|' read -r name port dir script <<< "$service"
            if check_port $port; then
                log "${GREEN}✅ $name already running${NC}"
            else
                start_service "$name" "$port" "$dir" "$script"
            fi
        done
        ;;

    stop)
        log "=== Stopping All Services ==="
        for service in "${SERVICES[@]}"; do
            IFS='|' read -r name port dir script <<< "$service"
            stop_service "$port" "$name"
        done
        ;;

    restart)
        $0 stop
        sleep 3
        $0 start
        ;;

    status)
        echo "=== Service Status ==="
        for service in "${SERVICES[@]}"; do
            IFS='|' read -r name port dir script <<< "$service"
            if check_port $port; then
                echo -e "${GREEN}✅ $name (port $port): Running${NC}"
            else
                echo -e "${RED}❌ $name (port $port): Stopped${NC}"
            fi
        done
        ;;

    monitor)
        log "=== Starting Service Monitor (Ctrl+C to stop) ==="
        while true; do
            for service in "${SERVICES[@]}"; do
                IFS='|' read -r name port dir script <<< "$service"
                check_and_restart "$name" "$port" "$dir" "$script"
            done
            sleep 30  # Check every 30 seconds
        done
        ;;

    *)
        echo "Usage: $0 {start|stop|restart|status|monitor}"
        echo ""
        echo "Commands:"
        echo "  start   - Start all services"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        echo "  status  - Show service status"
        echo "  monitor - Auto-restart crashed services (runs continuously)"
        exit 1
        ;;
esac
