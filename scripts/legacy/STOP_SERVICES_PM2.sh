#!/bin/bash

###############################################################################
# STOP ALL PM2-MANAGED SERVICES
###############################################################################

echo "🛑 Stopping all NexusTradeAI services..."
echo ""

# Stop all PM2 processes
pm2 stop all

echo ""
echo "✅ All services stopped!"
echo ""
echo "📋 Service status:"
pm2 list

echo ""
echo "💡 To completely remove services: pm2 delete all"
echo "💡 To restart services: pm2 restart all"
echo ""
