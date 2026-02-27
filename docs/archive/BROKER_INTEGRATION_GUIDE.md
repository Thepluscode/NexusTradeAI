# Multi-Broker Integration Guide

This guide explains how to connect NexusTradeAI to different trading platforms.

## Supported Brokers

1. **MetaTrader 4/5** - Forex, CFDs, Indices
2. **Interactive Brokers (IBKR)** - Stocks, Options, Futures, Forex
3. **Binance** - Cryptocurrency Spot & Futures
4. **Kraken** - Cryptocurrency & Some Forex
5. **Alpaca** - US Stocks (Paper & Live)

---

## Quick Start

### 1. Choose Your Broker

Edit `.env` file and set:
```bash
BROKER_TYPE=paper  # Options: paper, metatrader, ibkr, binance, kraken
```

### 2. Configure Broker Credentials

Follow the setup instructions below for your chosen broker.

---

## MetaTrader 4/5 Setup

### Option 1: MetaApi Cloud (Recommended - Easiest)

**Advantages:**
- No EA installation required
- Works from anywhere
- Cloud-based reliability
- Free tier available

**Steps:**

1. **Create MetaApi Account**
   - Go to https://metaapi.cloud
   - Sign up for free account
   - Get your API token from dashboard

2. **Connect Your MT4/MT5 Account**
   - Add your broker account in MetaApi dashboard
   - Get your Account ID

3. **Update .env File**
   ```bash
   BROKER_TYPE=metatrader
   MT_USE_METAAPI=true
   METAAPI_TOKEN=your_token_from_metaapi_dashboard
   MT_ACCOUNT_ID=your_account_id_from_dashboard
   MT_PLATFORM=MT5  # or MT4
   ```

### Option 2: Direct ZeroMQ Connection (Advanced)

**Requirements:**
- MetaTrader installed on your computer
- ZeroMQ Expert Advisor (EA) installed

**Steps:**

1. **Install ZeroMQ EA**
   - Download: https://github.com/dingmaotu/mql-zmq
   - Copy EA to `MetaTrader/MQL4/Experts/` or `MQL5/Experts/`
   - Compile in MetaEditor

2. **Configure EA**
   - Attach EA to any chart in MT4/MT5
   - Set ports: REQ=5555, PUSH=5556
   - Enable AutoTrading

3. **Update .env File**
   ```bash
   BROKER_TYPE=metatrader
   MT_USE_METAAPI=false
   MT_ZMQ_HOST=localhost
   MT_ZMQ_REQ_PORT=5555
   MT_ZMQ_PUSH_PORT=5556
   ```

4. **Install Dependencies**
   ```bash
   npm install zeromq
   ```

---

## Interactive Brokers (IBKR) Setup

**Best For:** Stocks, Options, Futures, Forex, Professional Trading

**Steps:**

1. **Download TWS or IB Gateway**
   - TWS: https://www.interactivebrokers.com/en/trading/tws.php
   - IB Gateway (lightweight): Recommended for automated trading

2. **Enable API Access**
   - Open TWS/Gateway
   - Go to: Configure → API → Settings
   - Check "Enable ActiveX and Socket Clients"
   - Add 127.0.0.1 to trusted IPs
   - Note the port number:
     - Paper Trading TWS: 7497
     - Paper Trading Gateway: 4002
     - Live Trading TWS: 7496
     - Live Trading Gateway: 4001

3. **Get Account ID**
   - Find in TWS: Account → Account Window

4. **Update .env File**
   ```bash
   BROKER_TYPE=ibkr
   IBKR_HOST=127.0.0.1
   IBKR_PORT=4002              # Paper trading IB Gateway
   IBKR_CLIENT_ID=0            # Increment if running multiple bots
   IBKR_ACCOUNT_ID=DU12345     # Your paper/live account ID
   IBKR_IS_PAPER=true          # false for live trading
   ```

5. **Install Dependencies**
   ```bash
   npm install @stoqey/ib
   ```

6. **Start IB Gateway**
   - Must be running before starting the bot
   - Keep it running while bot trades

---

## Binance (Crypto) Setup

**Best For:** Cryptocurrency spot and futures trading

**Steps:**

1. **Create Binance Account**
   - Go to https://www.binance.com
   - Complete KYC verification (for live trading)

2. **Generate API Keys**
   - Go to: Account → API Management
   - Create New Key
   - Save API Key and Secret Key (shown once!)
   - Set permissions:
     - ✅ Enable Reading
     - ✅ Enable Spot & Margin Trading
     - ✅ Enable Futures (if needed)
   - Restrict access to your IP (recommended)

3. **Update .env File**

   **For Testnet (Recommended for testing):**
   ```bash
   BROKER_TYPE=binance
   BINANCE_API_KEY=your_testnet_api_key
   BINANCE_API_SECRET=your_testnet_secret_key
   BINANCE_USE_TESTNET=true
   ```

   **For Live Trading:**
   ```bash
   BROKER_TYPE=binance
   BINANCE_API_KEY=your_live_api_key
   BINANCE_API_SECRET=your_live_secret_key
   BINANCE_USE_TESTNET=false
   ```

4. **Get Testnet Keys (For Practice)**
   - Spot Testnet: https://testnet.binance.vision
   - Futures Testnet: https://testnet.binancefuture.com

5. **Install Dependencies**
   ```bash
   npm install binance-api-node
   ```

---

## Kraken Setup

**Best For:** Cryptocurrency and some Forex pairs

**Steps:**

1. **Create Kraken Account**
   - Go to https://www.kraken.com
   - Complete verification

2. **Generate API Keys**
   - Go to: Settings → API
   - Click "Generate New Key"
   - Set permissions:
     - ✅ Query Funds
     - ✅ Query Open Orders & Trades
     - ✅ Query Closed Orders & Trades
     - ✅ Create & Modify Orders
     - ✅ Cancel/Close Orders
   - Save API Key and Private Key

3. **Update .env File**
   ```bash
   BROKER_TYPE=kraken
   KRAKEN_API_KEY=your_api_key_here
   KRAKEN_API_SECRET=your_private_key_here
   KRAKEN_OTP=      # Leave empty if 2FA not enabled for API
   ```

4. **Install Dependencies**
   ```bash
   npm install kraken-api
   ```

---

## Alpaca (Already Integrated)

**Best For:** US Stocks, Free Paper Trading

**Steps:**

1. **Get API Keys**
   - Sign up at https://alpaca.markets
   - Get keys from dashboard

2. **Update .env File**
   ```bash
   BROKER_TYPE=paper  # or 'alpaca' for same behavior
   ALPACA_API_KEY=your_key_here
   ALPACA_SECRET_KEY=your_secret_here
   ALPACA_BASE_URL=https://paper-api.alpaca.markets
   REAL_TRADING_ENABLED=false
   ```

---

## Usage in Trading Bot

### Automatic Broker Selection

The bot automatically uses the broker specified in `BROKER_TYPE`:

```javascript
// services/trading/profitable-trading-server.js
const broker = BrokerFactory.createBroker(process.env.BROKER_TYPE);

// Place orders
await broker.placeOrder({
    symbol: 'EURUSD',  // or 'AAPL', 'BTCUSDT', etc.
    side: 'BUY',
    quantity: 1000,
    type: 'MARKET'
});

// Get positions
const positions = await broker.getPositions();

// Get account info
const account = await broker.getAccount();
```

### Symbol Format by Broker

Different brokers use different symbol formats:

| Broker | Forex | Stocks | Crypto |
|--------|-------|--------|--------|
| MetaTrader | EURUSD | (varies) | (varies) |
| IBKR | EUR.USD | AAPL | - |
| Binance | - | - | BTCUSDT |
| Kraken | - | - | XXBTZUSD |
| Alpaca | - | AAPL | - |

### Configuration Presets

Create preset configurations in `.env`:

**Forex Trading (MetaTrader):**
```bash
BROKER_TYPE=metatrader
TRADING_SYMBOLS=EURUSD,GBPUSD,USDJPY,AUDUSD
```

**Crypto Trading (Binance):**
```bash
BROKER_TYPE=binance
TRADING_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT
```

**Stock Trading (IBKR):**
```bash
BROKER_TYPE=ibkr
TRADING_SYMBOLS=AAPL,GOOGL,MSFT,TSLA
```

---

## Testing Your Connection

After configuration, test the connection:

```bash
# Start the trading server
cd services/trading
node profitable-trading-server.js
```

Check the logs for:
```
✅ Connected to [BROKER_NAME]
📊 Account Balance: $X,XXX.XX
📈 Active Positions: X
```

### Test API Endpoints

```bash
# Check account
curl http://localhost:3002/api/accounts/summary

# Check positions
curl http://localhost:3002/api/trading/status

# Test order (paper trading)
curl -X POST http://localhost:3002/api/trading/start
```

---

## Troubleshooting

### MetaTrader Issues

**"Connection failed"**
- For MetaApi: Check API token and account ID
- For ZeroMQ: Ensure EA is running and ports are correct
- Verify MetaTrader is logged in

**"Invalid symbol"**
- Use broker's symbol format (usually EURUSD, not EUR/USD)
- Check symbol exists in Market Watch

### IBKR Issues

**"Cannot connect to TWS"**
- Ensure TWS/Gateway is running
- Check port number matches configuration
- Verify API is enabled in TWS settings
- Try different client ID if conflict

**"No security definition"**
- Symbol format varies by asset class
- Stocks: Use ticker only (AAPL)
- Forex: Use format EUR.USD
- Futures: Include expiry (ESZ3)

### Binance Issues

**"Invalid API key"**
- Check key is correctly copied (no spaces)
- Verify key permissions include trading
- Ensure IP whitelist includes your IP

**"Insufficient balance"**
- Check account has funds
- Verify correct trading pair (BTCUSDT not BTC/USDT)

### Kraken Issues

**"Invalid signature"**
- Check API secret is correct
- Verify 2FA settings if enabled
- Try regenerating API keys

---

## Security Best Practices

1. **Never commit .env file**
   - Already in .gitignore
   - Use .env.example as template

2. **Use API key restrictions**
   - Whitelist your IP addresses
   - Enable only necessary permissions
   - Disable withdrawals for trading bots

3. **Start with paper/testnet**
   - Test thoroughly before live trading
   - Use small amounts initially

4. **Secure your keys**
   - Store in secure password manager
   - Regenerate if compromised
   - Use different keys for testing/production

5. **Monitor your trades**
   - Check bot dashboard regularly
   - Set up alerts for large losses
   - Keep stop-loss orders active

---

## Getting Help

- **Documentation**: Check broker adapter files in `services/trading/brokers/`
- **Logs**: Check `services/trading/*.log` files
- **Issues**: Report at https://github.com/anthropics/nexustradeai/issues

---

## Next Steps

1. ✅ Choose your broker and complete setup
2. ✅ Test connection with paper/demo account
3. ✅ Configure trading strategies in dashboard
4. ✅ Start bot and monitor performance
5. ✅ Gradually increase position sizes
6. ✅ Consider live trading once comfortable

**Happy Trading! 🚀**
