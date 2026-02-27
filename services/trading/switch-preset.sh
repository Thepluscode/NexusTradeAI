#!/bin/bash
# Quick Preset Switcher
# Easily switch between different trading configurations

PRESETS_DIR="./presets"
ENV_FILE="./.env"
BACKUP_FILE="./.env.backup"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    NexusTradeAI - Preset Configuration Tool${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Show available presets
echo -e "${GREEN}Available Presets:${NC}\n"
echo "1. stocks-tech        - Tech stocks (AAPL, NVDA, TSLA, etc.)"
echo "2. stocks-blue-chip   - Blue chip stocks (stable companies)"
echo "3. stocks-etfs        - ETFs (SPY, QQQ, IWM, etc.)"
echo "4. forex-majors       - Forex major pairs (EUR/USD, etc.)"
echo "5. custom             - Keep current configuration"
echo ""

# Get user choice
read -p "Select preset (1-5): " choice

case $choice in
    1)
        PRESET="stocks-tech"
        ;;
    2)
        PRESET="stocks-blue-chip"
        ;;
    3)
        PRESET="stocks-etfs"
        ;;
    4)
        PRESET="forex-majors"
        ;;
    5)
        echo -e "${YELLOW}Keeping current configuration${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

PRESET_FILE="$PRESETS_DIR/$PRESET.env"

# Check if preset exists
if [ ! -f "$PRESET_FILE" ]; then
    echo -e "${RED}Error: Preset file not found: $PRESET_FILE${NC}"
    exit 1
fi

# Backup current .env
echo -e "${YELLOW}Backing up current configuration...${NC}"
cp "$ENV_FILE" "$BACKUP_FILE"

# Read current API keys and preserve them
ALPACA_KEY=$(grep "^ALPACA_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)
ALPACA_SECRET=$(grep "^ALPACA_SECRET_KEY=" "$ENV_FILE" | cut -d'=' -f2)

# Apply preset by merging with current .env
echo -e "${GREEN}Applying preset: $PRESET${NC}"

# Read preset values
BROKER_TYPE=$(grep "^BROKER_TYPE=" "$PRESET_FILE" | cut -d'=' -f2)
TRADING_SYMBOLS=$(grep "^TRADING_SYMBOLS=" "$PRESET_FILE" | cut -d'=' -f2)
ENABLED_STRATEGIES=$(grep "^ENABLED_STRATEGIES=" "$PRESET_FILE" | cut -d'=' -f2)
RISK_PER_TRADE=$(grep "^RISK_PER_TRADE=" "$PRESET_FILE" | cut -d'=' -f2)
MAX_POSITION_SIZE=$(grep "^MAX_POSITION_SIZE=" "$PRESET_FILE" | cut -d'=' -f2)
MAX_DAILY_LOSS=$(grep "^MAX_DAILY_LOSS=" "$PRESET_FILE" | cut -d'=' -f2)

# Update .env file
sed -i.tmp "s/^BROKER_TYPE=.*/BROKER_TYPE=$BROKER_TYPE/" "$ENV_FILE"
sed -i.tmp "s/^TRADING_SYMBOLS=.*/TRADING_SYMBOLS=$TRADING_SYMBOLS/" "$ENV_FILE"
sed -i.tmp "s/^ENABLED_STRATEGIES=.*/ENABLED_STRATEGIES=$ENABLED_STRATEGIES/" "$ENV_FILE"
sed -i.tmp "s/^RISK_PER_TRADE=.*/RISK_PER_TRADE=$RISK_PER_TRADE/" "$ENV_FILE"
sed -i.tmp "s/^MAX_POSITION_SIZE=.*/MAX_POSITION_SIZE=$MAX_POSITION_SIZE/" "$ENV_FILE"
sed -i.tmp "s/^MAX_DAILY_LOSS=.*/MAX_DAILY_LOSS=$MAX_DAILY_LOSS/" "$ENV_FILE"

# Remove temporary file
rm -f "$ENV_FILE.tmp"

echo ""
echo -e "${GREEN}✅ Preset applied successfully!${NC}\n"

# Show new configuration
echo -e "${BLUE}New Configuration:${NC}"
echo "  Broker: $BROKER_TYPE"
echo "  Symbols: $TRADING_SYMBOLS"
echo "  Strategies: $ENABLED_STRATEGIES"
echo "  Risk per trade: $RISK_PER_TRADE"
echo "  Max position size: $MAX_POSITION_SIZE"
echo "  Max daily loss: $MAX_DAILY_LOSS"
echo ""

# Ask to restart trading service
read -p "Restart trading service now? (y/n): " restart

if [ "$restart" = "y" ] || [ "$restart" = "Y" ]; then
    echo -e "${YELLOW}Restarting trading service...${NC}"

    # Kill existing process
    pkill -f profitable-trading-server

    # Wait a moment
    sleep 2

    # Start new process
    npm start

    echo -e "${GREEN}✅ Trading service restarted with new preset!${NC}"
else
    echo -e "${YELLOW}Please restart manually: npm start${NC}"
fi

echo ""
echo -e "${BLUE}Backup saved to: $BACKUP_FILE${NC}"
echo -e "${GREEN}Dashboard: http://localhost:3000${NC}"
echo ""
