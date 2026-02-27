# 🌐 Multi-Broker Setup Guide
## MetaTrader, IBKR & Kraken Integration

This guide will help you connect NexusTradeAI to **MetaTrader 4/5**, **Interactive Brokers (IBKR)**, and **Kraken**.

---

## 📋 Quick Summary

| Platform | Best For | Difficulty | Setup Time |
|----------|----------|------------|------------|
| **MetaTrader** | Forex, CFDs | Easy (with MetaApi) | 10 min |
| **IBKR** | Stocks, Options | Medium | 15 min |
| **Kraken** | Cryptocurrency | Easy | 5 min |

---

## 1️⃣ MetaTrader 4/5 Setup

### Best For:
- Forex trading (EUR/USD, GBP/USD, etc.)
- CFDs (Gold, Oil, Indices)
- Commodities

### Setup Steps:

#### Option A: MetaApi Cloud (Recommended - Easiest)

**Step 1: Create MetaApi Account**
1. Go to https://metaapi.cloud
2. Sign up for a free account
3. You get $10 free credit (enough for testing)

**Step 2: Add Your MT4/MT5 Account**
1. In MetaApi dashboard, click "Add Account"
2. Choose your broker from the list
3. Enter your MT4/MT5 login credentials
4. Deploy the account (takes ~2 minutes)

**Step 3: Get API Credentials**
1. Copy your **API Token** from dashboard
2. Copy your **Account ID** from the account page

**Step 4: Configure NexusTradeAI**

Add to `services/trading/.env`:
```bash
# MetaTrader via MetaApi
BROKER_TYPE=metatrader
MT_USE_METAAPI=true
METAAPI_TOKEN=your_token_here
MT_ACCOUNT_ID=your_account_id_here
MT_PLATFORM=MT5
```

**Step 5: Install Dependencies**
```bash
cd services/trading
npm install metaapi.cloud-sdk
```

**Step 6: Test Connection**
```bash
node test-broker-connection.js metatrader
```

#### Option B: Direct ZeroMQ (Advanced Users)

Only use this if you have experience with MetaTrader EAs.

1. Download ZMQ Expert Advisor: https://github.com/dingmaotu/mql-zmq
2. Install EA in MT4/MT5
3. Configure ports (default: 5555, 5556)
4. Add to `.env`:
```bash
BROKER_TYPE=metatrader
MT_USE_METAAPI=false
MT_ZMQ_HOST=localhost
MT_ZMQ_REQ_PORT=5555
MT_ZMQ_PUSH_PORT=5556
MT_PLATFORM=MT5
```
5. Install: `npm install zeromq`

### MetaTrader Symbol Examples:
```
EURUSD      # Euro/US Dollar
GBPUSD      # British Pound/US Dollar
USDJPY      # US Dollar/Japanese Yen
XAUUSD      # Gold
BTCUSD      # Bitcoin
```

---

## 2️⃣ Interactive Brokers (IBKR) Setup

### Best For:
- US Stocks (AAPL, TSLA, NVDA)
- Options trading
- Futures & Bonds
- International markets

### Setup Steps:

**Step 1: Download Software**
1. Go to https://www.interactivebrokers.com
2. Download **Trader Workstation (TWS)** OR **IB Gateway**
3. Choose Paper Trading account for testing

**Step 2: Enable API Access**
1. Open TWS/Gateway
2. Go to **Configure → Global Configuration → API → Settings**
3. Enable **"Enable ActiveX and Socket Clients"**
4. Set **Socket Port**:
   - Paper Trading: `7497`
   - Live Trading: `7496`
5. Check **"Allow connections from localhost only"**
6. Click **OK** and restart TWS

**Step 3: Get Account ID**
1. In TWS, go to **Account → Account Window**
2. Note your account ID (starts with 'D' for paper, 'U' for live)

**Step 4: Configure NexusTradeAI**

Add to `services/trading/.env`:
```bash
# Interactive Brokers
BROKER_TYPE=ibkr
IBKR_HOST=127.0.0.1
IBKR_PORT=7497              # 7497 for paper, 7496 for live
IBKR_CLIENT_ID=0
IBKR_ACCOUNT_ID=DU123456    # Your paper account ID
IBKR_IS_PAPER=true
```

**Step 5: Install Dependencies**
```bash
cd services/trading
npm install @stoqey/ib
```

**Step 6: Test Connection**
```bash
# Start TWS/Gateway FIRST, then:
node test-broker-connection.js ibkr
```

### IBKR Symbol Examples:
```
AAPL        # Apple Inc.
TSLA        # Tesla
NVDA        # NVIDIA
SPY         # S&P 500 ETF
QQQ         # Nasdaq ETF
EUR.USD     # Euro/Dollar Forex
```

### Important Notes:
- ⚠️ **TWS/Gateway must be running** before starting the bot
- Use paper trading first (port 7497)
- API disconnects if TWS is inactive for too long
- You may need to restart TWS daily

---

## 3️⃣ Kraken Setup

### Best For:
- Cryptocurrency (BTC, ETH, etc.)
- Crypto-to-Crypto pairs
- Some forex pairs

### Setup Steps:

**Step 1: Create API Key**
1. Sign up at https://www.kraken.com
2. Complete verification (may take time)
3. Go to **Settings → API**
4. Click **"Generate New Key"**

**Step 2: Set Permissions**
Enable only these permissions:
- ✅ Query Funds
- ✅ Query Open Orders & Trades
- ✅ Query Closed Orders & Trades
- ✅ Create & Modify Orders
- ❌ **DO NOT enable withdrawals**

**Step 3: Configure NexusTradeAI**

Add to `services/trading/.env`:
```bash
# Kraken
BROKER_TYPE=kraken
KRAKEN_API_KEY=your_api_key_here
KRAKEN_API_SECRET=your_secret_here
```

**Step 4: Install Dependencies**
```bash
cd services/trading
npm install kraken-api
```

**Step 5: Test Connection**
```bash
node test-broker-connection.js kraken
```

### Kraken Symbol Examples:
Kraken uses unique symbol formats:
```
XXBTZUSD    # Bitcoin/USD
XETHZUSD    # Ethereum/USD
XLTCZUSD    # Litecoin/USD
ADAUSD      # Cardano/USD
SOLUSD      # Solana/USD
ZEURZUSD    # Euro/USD
```

The bot automatically converts common symbols like `BTCUSD` → `XXBTZUSD`

### Important Notes:
- Start with small amounts
- Enable 2FA for extra security
- Check rate limits (15-20 req/sec)
- Sync your system clock (Kraken is strict about timestamps)

---

## 🚀 Starting the Bot

### Single Broker Mode

1. **Edit `.env` file**:
```bash
cd services/trading
nano .env  # or use any text editor
```

2. **Set your broker**:
```bash
BROKER_TYPE=metatrader   # or ibkr, or kraken
```

3. **Restart the trading service**:
```bash
npm start
```

### Multi-Broker Mode

Trade on multiple platforms simultaneously! Create a custom script:

```javascript
// multi-broker-trading.js
const BrokerFactory = require('./brokers/broker-factory');

(async () => {
    const factory = new BrokerFactory();

    // Connect to all brokers
    await factory.connectMultiple([
        {
            type: 'metatrader',
            config: {
                metaApiToken: process.env.METAAPI_TOKEN,
                accountId: process.env.MT_ACCOUNT_ID
            }
        },
        {
            type: 'kraken',
            config: {
                apiKey: process.env.KRAKEN_API_KEY,
                apiSecret: process.env.KRAKEN_API_SECRET
            }
        }
    ]);

    // Trade on MetaTrader
    factory.setActiveBroker('metatrader');
    await factory.openPosition('EURUSD', 'long', { lotSize: 0.01 });

    // Trade on Kraken
    factory.setActiveBroker('kraken');
    await factory.openPosition('BTCUSD', 'long', { volume: 0.001 });
})();
```

---

## 🧪 Testing Your Setup

### Test Connection Script

I've created a test script for you:

```bash
cd services/trading

# Test MetaTrader
node test-broker-connection.js metatrader

# Test IBKR
node test-broker-connection.js ibkr

# Test Kraken
node test-broker-connection.js kraken

# Test all
node test-broker-connection.js all
```

### What the test does:
1. ✅ Connects to broker
2. ✅ Fetches account info
3. ✅ Gets current price for a symbol
4. ✅ Tests order placement (paper only)
5. ✅ Displays results

---

## 🛡️ Security Best Practices

### 1. API Keys
- Never commit `.env` to git (already in .gitignore)
- Use read + trade permissions only
- Enable IP whitelisting where possible
- Rotate keys regularly

### 2. Start Safe
- Always test with **paper trading** first
- Use **testnet** for crypto exchanges
- Start with **small amounts** when going live
- Set strict **stop losses**

### 3. 2FA & Monitoring
- Enable 2FA on all accounts
- Monitor trades via dashboard
- Set up alerts for large losses
- Review trades daily

---

## 🔧 Troubleshooting

### MetaTrader Issues

**"MetaApi connection failed"**
- Check API token is correct
- Ensure account is deployed in MetaApi dashboard
- Verify you have credit remaining

**"Symbol not found"**
- Check symbol format matches your broker
- Not all brokers support all symbols

### IBKR Issues

**"Connection timeout"**
- Start TWS/Gateway before the bot
- Check port number (7497 for paper)
- Verify API is enabled in TWS settings

**"Market data not available"**
- You may need market data subscriptions
- Use symbols you have data for
- Paper trading has limited data

### Kraken Issues

**"Invalid API key"**
- Regenerate API keys
- Check for whitespace in .env file
- Ensure permissions are correct

**"Invalid nonce"**
- Sync your system clock
- Run: `sudo ntpdate -s time.nist.gov`

**"Rate limit exceeded"**
- Add delays between requests
- Reduce trading frequency

---

## 📊 Symbol Conversion Table

| Asset | Alpaca | MetaTrader | IBKR | Kraken |
|-------|--------|------------|------|--------|
| Apple Stock | AAPL | AAPL | AAPL | - |
| Tesla Stock | TSLA | TSLA | TSLA | - |
| Bitcoin | BTC-USD | BTCUSD | BTC-USD | XXBTZUSD |
| Ethereum | ETH-USD | ETHUSD | ETH-USD | XETHZUSD |
| Euro/Dollar | - | EURUSD | EUR.USD | ZEURZUSD |
| Gold | - | XAUUSD | XAUUSD | XAUUSD |

---

## 📈 Next Steps

1. **Start with paper trading** on one broker
2. **Monitor performance** for at least 1 week
3. **Adjust strategies** based on results
4. **Add more brokers** once comfortable
5. **Scale up gradually** with real money

---

## 💡 Pro Tips

### MetaTrader
- Use during major forex sessions (London, NY open)
- Check broker spread costs
- Some brokers restrict scalping

### IBKR
- Best liquidity during US market hours
- Commission: $0.0035/share (min $0.35)
- Great for options strategies

### Kraken
- Best liquidity for major crypto pairs
- Lower fees than Binance US
- Good for crypto HODLers

---

## 📚 Resources

### Official Documentation
- **MetaApi**: https://metaapi.cloud/docs
- **IBKR API**: https://interactivebrokers.github.io/tws-api/
- **Kraken API**: https://docs.kraken.com/rest/

### Community
- Discord: [Your Discord Link]
- GitHub: https://github.com/your-repo

---

## ✅ Quick Start Checklist

- [ ] Choose your platform(s)
- [ ] Create accounts (use paper/testnet)
- [ ] Generate API keys
- [ ] Configure `.env` file
- [ ] Install dependencies
- [ ] Run connection test
- [ ] Start with small amounts
- [ ] Monitor via dashboard
- [ ] Review daily performance
- [ ] Scale gradually

---

**Happy Trading! 📈**

Remember: Past performance does not guarantee future results. Always trade responsibly.
