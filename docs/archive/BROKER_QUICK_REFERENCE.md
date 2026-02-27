# 🚀 Quick Reference: Multi-Broker Trading

## 📝 Environment Variables Cheat Sheet

### MetaTrader (via MetaApi)
```bash
BROKER_TYPE=metatrader
MT_USE_METAAPI=true
METAAPI_TOKEN=your_token_here
MT_ACCOUNT_ID=your_account_id
MT_PLATFORM=MT5
```

### Interactive Brokers
```bash
BROKER_TYPE=ibkr
IBKR_HOST=127.0.0.1
IBKR_PORT=7497
IBKR_CLIENT_ID=0
IBKR_ACCOUNT_ID=your_account_id
IBKR_IS_PAPER=true
```

### Kraken
```bash
BROKER_TYPE=kraken
KRAKEN_API_KEY=your_api_key
KRAKEN_API_SECRET=your_secret
```

---

## 🧪 Testing Commands

```bash
cd services/trading

# Test individual broker
node test-broker-connection.js metatrader
node test-broker-connection.js ibkr
node test-broker-connection.js kraken

# Test all brokers
node test-broker-connection.js all
```

---

## 📦 Required NPM Packages

```bash
# MetaTrader
npm install metaapi.cloud-sdk

# Interactive Brokers
npm install @stoqey/ib

# Kraken
npm install kraken-api
```

---

## 🔗 Sign Up Links

- **MetaApi**: https://metaapi.cloud (for MetaTrader)
- **IBKR**: https://www.interactivebrokers.com
- **Kraken**: https://www.kraken.com

---

## 💰 Best Platforms By Asset

| Asset Class | Recommended Platform |
|-------------|---------------------|
| **Forex (EUR/USD, etc.)** | MetaTrader |
| **US Stocks (AAPL, TSLA)** | IBKR |
| **Crypto (BTC, ETH)** | Kraken |
| **Options** | IBKR |
| **CFDs** | MetaTrader |

---

## ⚡ Quick Start (5 Minutes)

### For Kraken (Easiest):

1. **Sign up**: https://www.kraken.com
2. **Create API key**: Settings → API → Generate New Key
3. **Add to `.env`**:
   ```bash
   BROKER_TYPE=kraken
   KRAKEN_API_KEY=your_key
   KRAKEN_API_SECRET=your_secret
   ```
4. **Install**: `npm install kraken-api`
5. **Test**: `node test-broker-connection.js kraken`
6. **Start**: `npm start`

---

## 🛠️ Common Issues & Fixes

### MetaTrader
- **Error**: "Invalid token"
  - **Fix**: Check token from https://metaapi.cloud

### IBKR
- **Error**: "Connection timeout"
  - **Fix**: Start TWS/Gateway first, enable API in settings

### Kraken
- **Error**: "Invalid nonce"
  - **Fix**: Sync system time: `sudo ntpdate -s time.nist.gov`

---

## 🔐 Security Checklist

- [ ] Never commit `.env` file
- [ ] Start with paper trading
- [ ] Enable 2FA on all accounts
- [ ] Use read + trade permissions only
- [ ] Set IP whitelisting
- [ ] Start with small amounts

---

## 📞 Support

- **Full Guide**: [MULTI_BROKER_SETUP_GUIDE.md](MULTI_BROKER_SETUP_GUIDE.md)
- **Dashboard**: http://localhost:3000
- **GitHub Issues**: [Report bugs here]

---

**Happy Trading! 📈**
