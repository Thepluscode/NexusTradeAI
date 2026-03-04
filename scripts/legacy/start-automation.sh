#!/bin/bash

# NexusTradeAI - FCT Automation Startup Script
# This script starts all required services for fully automated trading

echo "🚀 Starting NexusTradeAI FCT Automation System..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Function to start a service
start_service() {
    local service_name=$1
    local script_path=$2
    local port=$3
    local log_file=$4
    
    echo -e "${BLUE}Starting $service_name...${NC}"
    
    if check_port $port; then
        echo -e "${YELLOW}⚠️  $service_name already running on port $port${NC}"
    else
        nohup node $script_path > $log_file 2>&1 &
        local pid=$!
        echo $pid > "${service_name}.pid"
        
        # Wait a moment and check if the service started successfully
        sleep 2
        if kill -0 $pid 2>/dev/null; then
            echo -e "${GREEN}✅ $service_name started successfully (PID: $pid)${NC}"
        else
            echo -e "${RED}❌ Failed to start $service_name${NC}"
            return 1
        fi
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${BLUE}Waiting for $service_name to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if check_port $port; then
            echo -e "${GREEN}✅ $service_name is ready${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}⏳ Attempt $attempt/$max_attempts - waiting for $service_name...${NC}"
        sleep 1
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ $service_name failed to start within timeout${NC}"
    return 1
}

# Create logs directory
mkdir -p logs

echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if npm packages are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing npm packages...${NC}"
    npm install
fi

echo -e "${GREEN}✅ Prerequisites check complete${NC}"
echo ""

# Start services in order
echo -e "${BLUE}🔄 Starting services...${NC}"

# 1. Start Trading Service (Core service that others depend on)
start_service "Trading Service" "trading-service.js" 3002 "logs/trading-service.log"
wait_for_service "Trading Service" 3002 || exit 1

# 2. Start Trading Server (Web interface)
start_service "Trading Server" "trading-server.js" 3003 "logs/trading-server.log"
wait_for_service "Trading Server" 3003 || exit 1

# 3. Start Automation Server (FCT Engine)
start_service "Automation Server" "automation-server.js" 3004 "logs/automation-server.log"
wait_for_service "Automation Server" 3004 || exit 1

echo ""
echo -e "${GREEN}🎉 All services started successfully!${NC}"
echo "=================================================="
echo -e "${BLUE}📊 Service URLs:${NC}"
echo "   • Trading Interface:    http://localhost:3003"
echo "   • Trading API:          http://localhost:3002"
echo "   • Automation Dashboard: http://localhost:3004"
echo "   • FCT Dashboard:        file://$(pwd)/automation-dashboard.html"
echo ""
echo -e "${BLUE}📝 Log Files:${NC}"
echo "   • Trading Service:      logs/trading-service.log"
echo "   • Trading Server:       logs/trading-server.log"
echo "   • Automation Server:    logs/automation-server.log"
echo ""
echo -e "${BLUE}🎯 FCT Features Active:${NC}"
echo "   • ✅ 24/7 Market Monitoring"
echo "   • ✅ Automated Positioning"
echo "   • ✅ Risk Management"
echo "   • ✅ Zero Manual Input Required"
echo ""
echo -e "${YELLOW}💡 Quick Start:${NC}"
echo "   1. Open FCT Dashboard: file://$(pwd)/automation-dashboard.html"
echo "   2. Click 'Start Automation' to begin trading"
echo "   3. Monitor performance in real-time"
echo ""
echo -e "${BLUE}🛑 To stop all services, run: ./stop-automation.sh${NC}"

# Create a simple status check script
cat > check-status.sh << 'EOF'
#!/bin/bash
echo "🔍 NexusTradeAI Service Status:"
echo "================================"

check_service() {
    local name=$1
    local port=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "✅ $name (Port $port): Running"
    else
        echo "❌ $name (Port $port): Stopped"
    fi
}

check_service "Trading Service" 3002
check_service "Trading Server" 3003
check_service "Automation Server" 3004
EOF

chmod +x check-status.sh

echo -e "${GREEN}📋 Status check script created: ./check-status.sh${NC}"
