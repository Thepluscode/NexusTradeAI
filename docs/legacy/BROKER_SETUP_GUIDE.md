# 🏦 NexusTradeAI Broker Connection Guide

This guide will help you connect real brokers to your NexusTradeAI trading platform for live trading.

## 🚀 Quick Start

1. **Choose Your Broker**: Select from our supported brokers
2. **Get API Credentials**: Sign up and obtain API keys
3. **Configure Environment**: Add credentials to your `.env` file
4. **Test Connection**: Verify everything works
5. **Start Trading**: Deploy strategies with real money

## 📋 Supported Brokers

### 🇺🇸 Alpaca Markets (Recommended for Beginners)
- **Assets**: US Stocks, ETFs, Crypto
- **Fees**: Commission-free
- **Paper Trading**: ✅ Yes
- **Minimum**: $0
- **API Quality**: Excellent

**Setup Steps:**
1. Go to [alpaca.markets](https://alpaca.markets)
2. Sign up for free account
3. Navigate to "API Keys" in dashboard
4. Generate new API key pair
5. Add to `.env` file:
```bash
ALPACA_API_KEY=your_key_here
ALPACA_SECRET_KEY=your_secret_here
ALPACA_PAPER=true  # Start with paper trading
```

### 🌍 Interactive Brokers (Professional)
- **Assets**: Global stocks, options, futures, forex, crypto
- **Fees**: Low commissions
- **Paper Trading**: ✅ Yes
- **Minimum**: $0 (paper), $10,000 (live)
- **API Quality**: Professional grade

**Setup Steps:**
1. Open account at [interactivebrokers.com](https://interactivebrokers.com)
2. Download TWS (Trader Workstation) or IB Gateway
3. Enable API connections in TWS settings
4. Configure socket port (7497 for TWS, 4001 for Gateway)
5. Add to `.env` file:
```bash
IB_HOST=127.0.0.1
IB_PORT=7497
IB_CLIENT_ID=1
```

### 🪙 Binance (Crypto)
- **Assets**: 600+ cryptocurrencies
- **Fees**: Low trading fees
- **Paper Trading**: ❌ No (use testnet)
- **Minimum**: $10
- **API Quality**: Excellent

**Setup Steps:**
1. Create account at [binance.com](https://binance.com)
2. Complete identity verification
3. Go to "API Management" in account settings
4. Create new API key with trading permissions
5. Add to `.env` file:
```bash
BINANCE_API_KEY=your_key_here
BINANCE_SECRET_KEY=your_secret_here
BINANCE_TESTNET=true  # Start with testnet
```

### 🇺🇸 TD Ameritrade (Full Service)
- **Assets**: US stocks, options, ETFs, mutual funds
- **Fees**: $0 stocks, $0.65 options
- **Paper Trading**: ✅ Yes
- **Minimum**: $0
- **API Quality**: Good

**Setup Steps:**
1. Create developer account at [developer.tdameritrade.com](https://developer.tdameritrade.com)
2. Create new app to get API key
3. Complete OAuth flow for refresh token
4. Add to `.env` file:
```bash
TDA_API_KEY=your_key_here
TDA_REFRESH_TOKEN=your_refresh_token_here
```

## 🛠️ Setup Methods

### Method 1: Interactive Setup Wizard (Recommended)
Run our interactive wizard that guides you through the entire process:

```bash
cd NexusTradeAI
node services/broker-setup/BrokerSetupWizard.js
```

The wizard will:
- Show you all supported brokers
- Guide you through credential setup
- Test connections automatically
- Generate configuration files

### Method 2: Manual Configuration
1. Create `.env` file in your project root
2. Add broker credentials (see examples above)
3. Test connections manually

### Method 3: Dashboard Interface
1. Open your dashboard at `http://localhost:3000`
2. Click "Connect Broker" in the Broker Connections panel
3. Follow the setup instructions for your chosen broker

## 🔒 Security Best Practices

### API Key Security
- **Never commit API keys to version control**
- **Use environment variables** (`.env` file)
- **Enable IP restrictions** when possible
- **Use read-only keys** for testing
- **Rotate keys regularly**

### Trading Permissions
- **Start with paper trading** to test strategies
- **Use minimal permissions** (trading only, no withdrawals)
- **Set position limits** in broker settings
- **Enable two-factor authentication**

### Risk Management
- **Start small** with real money
- **Set stop losses** on all positions
- **Monitor positions** regularly
- **Have emergency stop procedures**

## 🧪 Testing Your Setup

### 1. Connection Test
```bash
# Test all configured brokers
node services/broker-setup/BrokerSetupWizard.js
# Choose option 3: "Test existing connections"
```

### 2. Paper Trading Test
1. Enable paper trading mode
2. Deploy a simple strategy
3. Monitor for 24 hours
4. Verify trades execute correctly

### 3. Live Trading Test
1. Start with small position sizes
2. Use conservative strategies
3. Monitor closely for first week
4. Gradually increase position sizes

## 📊 Monitoring Broker Connections

### Dashboard Monitoring
- **Connection Status**: Green = connected, Red = disconnected
- **Account Balance**: Real-time balance updates
- **Position Tracking**: All open positions across brokers
- **Trade History**: Complete trade log

### Health Checks
The platform automatically:
- **Pings brokers** every 30 seconds
- **Reconnects** on connection loss
- **Logs all errors** for debugging
- **Sends alerts** on critical issues

## 🚨 Troubleshooting

### Common Issues

**"Connection Failed"**
- Check API credentials
- Verify broker service status
- Check firewall settings
- Ensure sufficient permissions

**"Invalid API Key"**
- Regenerate API keys
- Check for typos in `.env` file
- Verify key hasn't expired
- Check IP restrictions

**"Insufficient Permissions"**
- Enable trading permissions
- Check account status
- Verify margin requirements
- Contact broker support

**"Order Rejected"**
- Check buying power
- Verify market hours
- Check position limits
- Review order parameters

### Getting Help

1. **Check Logs**: Look at system logs in dashboard
2. **Test Connection**: Use the setup wizard test function
3. **Broker Support**: Contact your broker's API support
4. **Documentation**: Check broker API documentation

## 🎯 Next Steps

Once you have brokers connected:

1. **Deploy Strategies**: Use the strategy deployment interface
2. **Monitor Performance**: Watch real-time metrics
3. **Optimize Settings**: Adjust based on performance
4. **Scale Up**: Increase position sizes gradually

## 📚 Additional Resources

- [Alpaca API Documentation](https://alpaca.markets/docs/)
- [Interactive Brokers API Guide](https://interactivebrokers.github.io/tws-api/)
- [Binance API Documentation](https://binance-docs.github.io/apidocs/)
- [TD Ameritrade API Docs](https://developer.tdameritrade.com/apis)

## ⚠️ Important Disclaimers

- **Trading involves risk** of financial loss
- **Start with paper trading** to test strategies
- **Never invest more** than you can afford to lose
- **Past performance** does not guarantee future results
- **Consult financial advisors** for investment advice

---

**Ready to connect your first broker?** Run the setup wizard:

```bash
node services/broker-setup/BrokerSetupWizard.js
```

Or click "Connect Broker" in your dashboard at `http://localhost:3000`
