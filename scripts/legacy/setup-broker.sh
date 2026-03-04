#!/bin/bash

# Broker Integration Setup Script
# This script helps you set up broker connections

echo "🤖 NexusTradeAI - Broker Integration Setup"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Copying from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file"
else
    echo "✅ .env file exists"
fi

echo ""
echo "📦 Installing Broker Dependencies..."
echo ""

# Navigate to services/trading
cd services/trading

# Install dependencies
echo "Installing MetaTrader dependencies..."
npm install metaapi.cloud-sdk --save 2>/dev/null

echo "Installing Interactive Brokers dependencies..."
npm install @stoqey/ib --save 2>/dev/null

echo "Installing Binance dependencies..."
npm install binance-api-node --save 2>/dev/null

echo "Installing Kraken dependencies..."
npm install kraken-api --save 2>/dev/null

echo "Installing ZeroMQ (optional - for direct MT4/MT5)..."
npm install zeromq --save 2>/dev/null || echo "⚠️  ZeroMQ installation failed (optional)"

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Choose your broker and edit .env file:"
echo "   nano .env  (or use your favorite editor)"
echo ""
echo "2. Set BROKER_TYPE to one of:"
echo "   - paper (Alpaca paper trading - no setup needed)"
echo "   - metatrader (Forex/CFDs)"
echo "   - ibkr (Interactive Brokers)"
echo "   - binance (Cryptocurrency)"
echo "   - kraken (Crypto/Forex)"
echo ""
echo "3. Add your API credentials for chosen broker"
echo ""
echo "4. Read the integration guide:"
echo "   cat BROKER_INTEGRATION_GUIDE.md"
echo ""
echo "5. Start the trading bot:"
echo "   cd services/trading"
echo "   node profitable-trading-server.js"
echo ""
echo "Happy Trading! 🚀"
