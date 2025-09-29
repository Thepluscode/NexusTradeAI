#!/bin/bash

# NexusTradeAI - FCT Automation Stop Script
# This script safely stops all automation services

echo "🛑 Stopping NexusTradeAI FCT Automation System..."
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to stop a service by PID file
stop_service_by_pid() {
    local service_name=$1
    local pid_file="${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        echo -e "${BLUE}Stopping $service_name (PID: $pid)...${NC}"
        
        if kill -0 $pid 2>/dev/null; then
            # Try graceful shutdown first
            kill -TERM $pid
            
            # Wait up to 10 seconds for graceful shutdown
            local count=0
            while [ $count -lt 10 ] && kill -0 $pid 2>/dev/null; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if kill -0 $pid 2>/dev/null; then
                echo -e "${YELLOW}⚠️  Forcing shutdown of $service_name...${NC}"
                kill -KILL $pid
            fi
            
            echo -e "${GREEN}✅ $service_name stopped${NC}"
        else
            echo -e "${YELLOW}⚠️  $service_name was not running${NC}"
        fi
        
        rm -f "$pid_file"
    else
        echo -e "${YELLOW}⚠️  No PID file found for $service_name${NC}"
    fi
}

# Function to stop services by port
stop_service_by_port() {
    local service_name=$1
    local port=$2
    
    echo -e "${BLUE}Checking for $service_name on port $port...${NC}"
    
    local pids=$(lsof -ti:$port)
    if [ -n "$pids" ]; then
        echo -e "${BLUE}Stopping $service_name processes: $pids${NC}"
        for pid in $pids; do
            # Try graceful shutdown first
            kill -TERM $pid 2>/dev/null
            
            # Wait a moment
            sleep 2
            
            # Force kill if still running
            if kill -0 $pid 2>/dev/null; then
                echo -e "${YELLOW}⚠️  Forcing shutdown of PID $pid...${NC}"
                kill -KILL $pid 2>/dev/null
            fi
        done
        echo -e "${GREEN}✅ $service_name stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  No $service_name processes found on port $port${NC}"
    fi
}

# Stop services gracefully
echo -e "${BLUE}🔄 Stopping services...${NC}"

# Stop by PID files first (more graceful)
stop_service_by_pid "Automation Server"
stop_service_by_pid "Trading Server"
stop_service_by_pid "Trading Service"

# Fallback: Stop by port (in case PID files are missing)
stop_service_by_port "Automation Server" 3004
stop_service_by_port "Trading Server" 3003
stop_service_by_port "Trading Service" 3002

# Clean up any remaining PID files
echo -e "${BLUE}🧹 Cleaning up...${NC}"
rm -f *.pid

# Stop any remaining Node.js processes that might be related
echo -e "${BLUE}🔍 Checking for remaining NexusTradeAI processes...${NC}"
remaining_pids=$(ps aux | grep -E "(trading-service|trading-server|automation-server)" | grep -v grep | awk '{print $2}')

if [ -n "$remaining_pids" ]; then
    echo -e "${YELLOW}⚠️  Found remaining processes: $remaining_pids${NC}"
    echo -e "${BLUE}Stopping remaining processes...${NC}"
    for pid in $remaining_pids; do
        kill -TERM $pid 2>/dev/null
        sleep 1
        if kill -0 $pid 2>/dev/null; then
            kill -KILL $pid 2>/dev/null
        fi
    done
    echo -e "${GREEN}✅ Remaining processes stopped${NC}"
else
    echo -e "${GREEN}✅ No remaining processes found${NC}"
fi

echo ""
echo -e "${GREEN}🎉 All NexusTradeAI services stopped successfully!${NC}"
echo "================================================="
echo -e "${BLUE}📊 Final Status:${NC}"

# Check final status
check_service() {
    local name=$1
    local port=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo -e "   • ${RED}❌ $name (Port $port): Still Running${NC}"
    else
        echo -e "   • ${GREEN}✅ $name (Port $port): Stopped${NC}"
    fi
}

check_service "Trading Service" 3002
check_service "Trading Server" 3003
check_service "Automation Server" 3004

echo ""
echo -e "${BLUE}💡 To restart the system, run: ./start-automation.sh${NC}"
echo -e "${BLUE}📝 Log files are preserved in the logs/ directory${NC}"
