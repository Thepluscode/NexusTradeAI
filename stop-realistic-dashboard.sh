#!/bin/bash

# Stop Realistic Dashboard Services
# This script stops all services for the realistic performance dashboard

echo "🛑 Stopping Nexus Trade AI - Realistic Performance Dashboard"
echo "============================================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to stop service by PID file
stop_service() {
    local name=$1
    local pid_file="/tmp/nexus-$name.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "${BLUE}Stopping $name (PID: $pid)...${NC}"
            kill $pid
            sleep 2
            if ps -p $pid > /dev/null 2>&1; then
                echo -e "${YELLOW}Force killing $name...${NC}"
                kill -9 $pid
            fi
            echo -e "${GREEN}✅ $name stopped${NC}"
        else
            echo -e "${YELLOW}⚠️  $name was not running${NC}"
        fi
        rm -f "$pid_file"
    else
        echo -e "${YELLOW}⚠️  No PID file found for $name${NC}"
    fi
}

# Function to stop service by port
stop_by_port() {
    local name=$1
    local port=$2
    
    local pid=$(lsof -ti:$port)
    if [ ! -z "$pid" ]; then
        echo -e "${BLUE}Stopping $name on port $port (PID: $pid)...${NC}"
        kill $pid
        sleep 1
        if lsof -ti:$port > /dev/null; then
            echo -e "${YELLOW}Force killing $name...${NC}"
            kill -9 $pid
        fi
        echo -e "${GREEN}✅ $name stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  No process found on port $port for $name${NC}"
    fi
}

echo -e "${BLUE}🛑 Stopping Realistic Performance Services...${NC}"

# Stop services by PID files first
stop_service "realistic-performance-api"
stop_service "dashboard"
stop_service "trading-engine"
stop_service "market-data"

echo ""
echo -e "${BLUE}🔍 Checking for remaining processes on known ports...${NC}"

# Stop any remaining processes on known ports
stop_by_port "Realistic Performance API" 3010
stop_by_port "Dashboard" 8080
stop_by_port "Trading Engine" 3002
stop_by_port "Market Data" 3001

# Clean up any remaining Node.js processes related to our services
echo ""
echo -e "${BLUE}🧹 Cleaning up remaining processes...${NC}"

# Kill any remaining processes that might be related to our services
pkill -f "realistic-performance-api.js" 2>/dev/null && echo -e "${GREEN}✅ Cleaned up realistic-performance-api processes${NC}"
pkill -f "profitable-trading-server.js" 2>/dev/null && echo -e "${GREEN}✅ Cleaned up trading server processes${NC}"
pkill -f "http.server 8080" 2>/dev/null && echo -e "${GREEN}✅ Cleaned up dashboard server processes${NC}"

# Clean up PID files
echo ""
echo -e "${BLUE}🗑️  Cleaning up PID files...${NC}"
rm -f /tmp/nexus-*.pid
echo -e "${GREEN}✅ PID files cleaned up${NC}"

echo ""
echo -e "${GREEN}🎯 All Realistic Dashboard Services Stopped!${NC}"
echo "=============================================="
echo ""
echo -e "${BLUE}📊 Services that were stopped:${NC}"
echo "• Realistic Performance API (port 3010)"
echo "• Main Dashboard (port 8080)"
echo "• Trading Engine (port 3002)"
echo "• Market Data Service (port 3001)"
echo ""
echo -e "${BLUE}📝 Log files preserved in ./logs/${NC}"
echo "• realistic-performance.log"
echo "• dashboard.log"
echo "• trading-engine.log"
echo "• market-data.log"
echo ""
echo -e "${GREEN}✅ All services successfully stopped!${NC}"
echo ""
echo "To restart services, run: ./start-realistic-dashboard.sh"
echo "To view logs: tail -f logs/realistic-performance.log"
