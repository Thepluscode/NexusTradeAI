# Broker Integration Guide

NexusTradeAI now supports multiple trading platforms! Connect your bot to MetaTrader 4/5, Interactive Brokers, Binance, Kraken, and more.

## 🚀 Quick Start

### 1. Choose Your Broker

Set `BROKER_TYPE` in your `.env` file:

```bash
# Options: paper, metatrader, ibkr, binance, kraken
BROKER_TYPE=paper
```

### 2. Configure API Credentials

Copy `.env.example` to `.env` and add your broker's API credentials.

---

## 📋 Supported Brokers

### 🔷 Paper Trading (Default)
**Best for:** Testing strategies risk-free

**Setup:**
```bash
BROKER_TYPE=paper
```

No API keys required! Uses simulated prices.

---

### 🟦 MetaTrader 4/5
**Best for:** Forex, CFDs, commodities

**Two Options:**

#### Option 1: MetaApi Cloud (Recommended - Easiest)

1. Sign up at https://metaapi.cloud
2. Add your MT4/MT5 account to MetaApi
3. Get your API token and account ID
4. Configure:

```bash
BROKER_TYPE=metatrader
MT_USE_METAAPI=true
METAAPI_TOKEN=your_token_here
MT_ACCOUNT_ID=your_account_id_here
MT_PLATFORM=MT5
```

#### Option 2: Direct ZeroMQ (Advanced)

1. Install ZMQ Expert Advisor from https://github.com/dingmaotu/mql-zmq
2. Load EA in MT4/MT5
3. Configure:

```bash
BROKER_TYPE=metatrader
MT_USE_METAAPI=false
MT_ZMQ_HOST=localhost
MT_ZMQ_REQ_PORT=5555
MT_ZMQ_PUSH_PORT=5556
MT_PLATFORM=MT5
```

**Required Package:**
```bash
npm install metaapi.cloud-sdk zeromq
```

---

### 🟩 Interactive Brokers (IBKR)
**Best for:** Stocks, options, futures, forex, bonds

**Setup:**

1. Download Trader Workstation (TWS) or IB Gateway
2. Enable API in TWS: Configure → API → Settings
   - Enable ActiveX and Socket Clients
   - Add socket port (7497 for paper, 7496 for live)
3. Configure:

```bash
BROKER_TYPE=ibkr
IBKR_HOST=127.0.0.1
IBKR_PORT=7497              # 7497 for paper, 7496 for live
IBKR_CLIENT_ID=0
IBKR_ACCOUNT_ID=your_account_id
IBKR_IS_PAPER=true
```

**Required Package:**
```bash
npm install @stoqey/ib
```

**Note:** TWS/Gateway must be running for the bot to connect.

---

### 🟨 Binance
**Best for:** Cryptocurrency spot and futures

**Setup:**

1. Create account at https://www.binance.com
2. Go to Account → API Management
3. Create new API key
4. Configure:

```bash
BROKER_TYPE=binance
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
BINANCE_USE_TESTNET=true    # Start with testnet!
```

**Required Package:**
```bash
npm install binance-api-node
```

**Testnet Setup:**
- Get testnet keys from https://testnet.binance.vision
- Use testnet for risk-free testing
- Switch to live by setting `BINANCE_USE_TESTNET=false`

---

### 🟪 Kraken
**Best for:** Cryptocurrency and some forex pairs

**Setup:**

1. Create account at https://www.kraken.com
2. Go to Settings → API
3. Create API key with trading permissions
4. Configure:

```bash
BROKER_TYPE=kraken
KRAKEN_API_KEY=your_api_key_here
KRAKEN_API_SECRET=your_api_secret_here
KRAKEN_OTP=                 # If 2FA enabled
```

**Required Package:**
```bash
npm install kraken-api
```

---

## 🔧 Usage in Code

### Basic Usage

The bot automatically uses the broker specified in `BROKER_TYPE`:

```javascript
// In profitable-trading-server.js
const BrokerFactory = require('./brokers/broker-factory');

// Connect to broker from environment
const factory = await BrokerFactory.createFromEnv();

// Open position
const position = await factory.openPosition('BTCUSD', 'long', {
    quantity: 0.01,
    stopLoss: 60000,
    takeProfit: 65000
});

// Close position
await factory.closePosition(position.id);

// Get current price
const price = await factory.getCurrentPrice('EURUSD');

// Get account info
const account = await factory.getAccountInfo();
```

### Multi-Broker Support

Trade on multiple platforms simultaneously:

```javascript
const factory = new BrokerFactory();

// Connect to multiple brokers
await factory.connectMultiple([
    { type: 'binance', config: { apiKey: '...', apiSecret: '...' } },
    { type: 'kraken', config: { apiKey: '...', apiSecret: '...' } }
]);

// Switch active broker
factory.setActiveBroker('binance');
await factory.openPosition('BTCUSD', 'long', { quantity: 0.01 });

factory.setActiveBroker('kraken');
await factory.openPosition('ETHUSD', 'long', { volume: 0.1 });

// Get positions from all brokers
const allPositions = factory.getAllPositions();
```

---

## 🎯 Symbol Format by Broker

Different brokers use different symbol formats:

| Asset Class | MetaTrader | IBKR | Binance | Kraken |
|-------------|-----------|------|---------|--------|
| **Forex** | EURUSD | EUR.USD | - | ZEURZUSD |
| **Crypto** | BTCUSD | BTC-USD | BTCUSDT | XXBTZUSD |
| **Stocks** | AAPL | AAPL | - | - |

The adapters handle symbol conversion automatically where possible.

---

## ⚠️ Important Notes

### Security
- **Never commit** `.env` file with real API keys
- Use **paper trading** or **testnet** first
- Enable **IP whitelisting** on exchanges
- Use **read + trade permissions only** (not withdrawal)

### API Permissions

Required permissions for each broker:

**MetaTrader:**
- Trading enabled
- API connections enabled

**IBKR:**
- Enable API in TWS settings
- Read account data
- Place trades

**Binance:**
- Enable Reading
- Enable Spot & Margin Trading
- Do NOT enable withdrawals

**Kraken:**
- Query Funds
- Create & Modify Orders
- Query Open/Closed Orders

### Rate Limits

Be aware of API rate limits:
- **Binance:** 1200 requests/minute
- **Kraken:** 15-20 requests/second (tier-based)
- **IBKR:** 50 messages/second
- **MetaApi:** Varies by plan

---

## 🧪 Testing Your Integration

### 1. Test Connection

```bash
cd services/trading
node test-broker-connection.js
```

### 2. Place Test Order

Start with paper trading or testnet:

```bash
# Set in .env
BROKER_TYPE=binance
BINANCE_USE_TESTNET=true

# Run trading server
node profitable-trading-server.js
```

### 3. Monitor Positions

Watch the dashboard at http://localhost:3000/

---

## 🛠️ Troubleshooting

### MetaTrader Issues

**"Connection failed"**
- Check MetaApi token and account ID
- Ensure MT account is deployed in MetaApi dashboard
- For ZMQ: Verify EA is loaded and ports are open

**"Trading is disabled"**
- Enable AutoTrading in MT terminal (top toolbar button)
- Check EA settings allow live trading

### IBKR Issues

**"Connection timeout"**
- Start TWS or IB Gateway first
- Check port number (7497 for paper, 7496 for live)
- Enable API in TWS: Configure → API → Settings

**"No security definition found"**
- Use correct symbol format for IBKR
- Check contract specifications

### Binance Issues

**"Invalid API key"**
- Regenerate API keys
- Check IP whitelist
- Ensure testnet keys for testnet URL

**"Insufficient balance"**
- Get testnet funds from Binance testnet faucet
- Check USDT balance

### Kraken Issues

**"Invalid nonce"**
- System time must be synchronized
- Check server time vs local time

**"Unknown asset pair"**
- Use Kraken's symbol format (XXBTZUSD not BTCUSD)
- Check available pairs in Kraken API docs

---

## 📚 Additional Resources

### Documentation
- **MetaApi:** https://metaapi.cloud/docs
- **IBKR API:** https://interactivebrokers.github.io/tws-api/
- **Binance API:** https://binance-docs.github.io/apidocs/spot/en/
- **Kraken API:** https://docs.kraken.com/rest/

### Support
- GitHub Issues: https://github.com/your-repo/issues
- Discord: [Your Discord Link]

---

## 🔜 Coming Soon

- TD Ameritrade integration
- Coinbase Pro integration
- Robinhood integration
- Bybit integration
- Multi-broker portfolio management
- Cross-exchange arbitrage strategies

---

## ⚡ Quick Example: Start Trading in 5 Minutes

1. **Choose Binance Testnet** (no real money):

```bash
# In .env
BROKER_TYPE=binance
BINANCE_API_KEY=your_testnet_key
BINANCE_API_SECRET=your_testnet_secret
BINANCE_USE_TESTNET=true
```

2. **Install dependencies:**

```bash
npm install binance-api-node
```

3. **Start the bot:**

```bash
cd services/trading
node profitable-trading-server.js
```

4. **Watch it trade:**

Open http://localhost:3000/ in your browser.

That's it! Your bot is now trading crypto on Binance testnet! 🎉

---

**Happy Trading! 📈**

Remember: Always start with paper trading or testnet before using real money!
