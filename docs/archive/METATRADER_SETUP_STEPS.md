# 🎯 MetaTrader Setup - Step by Step Guide

## ✅ What We've Done So Far

1. ✅ Installed MetaApi SDK (`metaapi.cloud-sdk`)
2. ✅ Added MetaTrader configuration to `.env` file
3. ✅ Created test connection script

## 📋 What You Need to Do Now

### Step 1: Create MetaApi Account (5 minutes)

1. **Go to**: https://metaapi.cloud
2. **Click**: "Sign Up" (free account)
3. **You get**: $10 free credit (enough for testing!)
4. **Verify**: Your email address

### Step 2: Connect Your MT4/MT5 Account (3 minutes)

You have two options:

#### Option A: Use Your Existing MT4/MT5 Account

1. In MetaApi dashboard, click **"Add Account"**
2. Select your broker from the list (e.g., Pepperstone, IC Markets, XM)
3. Enter your MT4/MT5 credentials:
   - Login/Account number
   - Password
   - Server name (e.g., `Pepperstone-Demo01`)
4. Click **"Deploy"** (takes ~2 minutes)

#### Option B: Create a New Demo Account

If you don't have an MT4/MT5 account yet:

1. In MetaApi, click **"Create Demo Account"**
2. Choose a broker (recommended: Pepperstone, XM, or IC Markets)
3. MetaApi will create a demo account for you
4. Deploy the account

### Step 3: Get Your API Credentials (1 minute)

Once your account is deployed:

1. Copy your **API Token** from the MetaApi dashboard
2. Click on your account to see the **Account ID**
3. Save these credentials

### Step 4: Update Your .env File (1 minute)

Open `services/trading/.env` and update these lines:

```bash
# Change this line to use MetaTrader
BROKER_TYPE=metatrader

# Add your MetaApi credentials
METAAPI_TOKEN=paste_your_token_here
MT_ACCOUNT_ID=paste_your_account_id_here
MT_PLATFORM=MT5  # or MT4 if you're using MT4
```

**Example:**
```bash
BROKER_TYPE=metatrader
METAAPI_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9...
MT_ACCOUNT_ID=abc123-def456-ghi789
MT_PLATFORM=MT5
```

### Step 5: Test the Connection (1 minute)

Run the test script:

```bash
cd services/trading
node test-broker-connection.js metatrader
```

**Expected Output:**
```
============================================================
  Testing MetaTrader Connection
============================================================

ℹ️  Using MetaApi Cloud
ℹ️  Account ID: abc123-def456-ghi789
ℹ️  Connecting...
✅ Connected to MetaTrader!
ℹ️  Fetching account info...
✅ Account Balance: $10000.00
ℹ️  Equity: $10000.00
ℹ️  Leverage: 1:100
ℹ️  Testing market data for EURUSD...
✅ EURUSD Price: 1.08234
✅ MetaTrader test completed successfully!

🎉 All tests passed! You're ready to trade!
```

### Step 6: Start Trading! (30 seconds)

Restart your trading service:

```bash
# Stop the current service
# Press Ctrl+C in the terminal where it's running

# Or kill it
pkill -f profitable-trading-server

# Start with MetaTrader
cd services/trading
npm start
```

You should see:
```
✅ Connected to MT5 via MetaApi
💰 Account Balance: $10000.00
🚀 Ready for automated trading!
```

---

## 🎯 What You Can Trade on MetaTrader

### Forex Pairs (Most Popular)
```
EURUSD     # Euro/US Dollar
GBPUSD     # British Pound/US Dollar
USDJPY     # US Dollar/Japanese Yen
USDCHF     # US Dollar/Swiss Franc
AUDUSD     # Australian Dollar/US Dollar
NZDUSD     # New Zealand Dollar/US Dollar
USDCAD     # US Dollar/Canadian Dollar
```

### Commodities
```
XAUUSD     # Gold
XAGUSD     # Silver
USOIL      # US Crude Oil (WTI)
UKOIL      # UK Crude Oil (Brent)
```

### Indices
```
US30       # Dow Jones
US500      # S&P 500
NAS100     # Nasdaq 100
UK100      # FTSE 100
GER40      # DAX
```

### Cryptocurrencies (if your broker supports)
```
BTCUSD     # Bitcoin
ETHUSD     # Ethereum
```

---

## 📊 Trading Configuration for MetaTrader

Update these in your `.env` for Forex trading:

```bash
# Forex pairs to trade
TRADING_SYMBOLS=EURUSD,GBPUSD,USDJPY,XAUUSD

# Adjust position sizes for forex (lots)
# 0.01 lot = $1,000 worth (with 1:100 leverage)
# 0.1 lot = $10,000 worth
MAX_POSITION_SIZE=0.01

# Keep these for safety
RISK_PER_TRADE=0.01
REAL_TRADING_ENABLED=false
```

---

## 🔧 Troubleshooting

### "MetaApi connection failed"

**Solution:**
1. Check your API token is correct (no spaces)
2. Verify account is deployed in MetaApi dashboard
3. Check you have credit remaining (see MetaApi dashboard)

### "Account not deployed"

**Solution:**
1. Go to MetaApi dashboard
2. Click on your account
3. Click "Deploy" button
4. Wait 2 minutes for deployment

### "Symbol not found"

**Solution:**
- Different brokers support different symbols
- Check your broker's symbol list in MT4/MT5 terminal
- Common variations: `EURUSD`, `EURUSDm`, `EURUSD.`

### "Insufficient funds"

**Solution:**
- Demo accounts start with $10,000
- Adjust `MAX_POSITION_SIZE` in `.env`
- Use smaller lot sizes (0.01 instead of 0.1)

---

## 💰 Cost Information

### MetaApi Pricing
- **Free Tier**: $10 credit (good for testing)
- **Pay as you go**: ~$0.01 per request
- **Monthly plans**: Starting at $49/month for unlimited requests
- **Best for testing**: Free tier is enough!

### Broker Costs
- **Spreads**: 0.5-2 pips (varies by pair and broker)
- **Commission**: $0-$7 per lot (depends on broker)
- **No monthly fees** for demo accounts

---

## 🎓 Learning Resources

### Official Docs
- **MetaApi Docs**: https://metaapi.cloud/docs
- **MT5 Trading**: https://www.metatrader5.com/en/trading

### Best Practices
1. Start with **demo account**
2. Test strategies for at least **1 week**
3. Start with **major pairs** (EURUSD, GBPUSD)
4. Use **proper risk management** (1-2% per trade)
5. Monitor performance daily

---

## 🚀 Quick Command Reference

```bash
# Test connection
cd services/trading
node test-broker-connection.js metatrader

# Start trading bot
npm start

# View logs
tail -f trading-server.log

# Stop bot
pkill -f profitable-trading-server
```

---

## ✅ Setup Checklist

- [ ] Created MetaApi account
- [ ] Added MT4/MT5 account to MetaApi
- [ ] Got API token and account ID
- [ ] Updated `.env` file
- [ ] Installed dependencies (`npm install`)
- [ ] Tested connection successfully
- [ ] Started trading bot
- [ ] Monitoring via dashboard (http://localhost:3000)

---

## 📞 Need Help?

- **MetaApi Support**: support@metaapi.cloud
- **Documentation**: See [MULTI_BROKER_SETUP_GUIDE.md](MULTI_BROKER_SETUP_GUIDE.md)
- **Test Script**: `node test-broker-connection.js metatrader`

---

## 🎉 Next Steps

Once your MetaTrader connection is working:

1. **Monitor** trades on the dashboard
2. **Adjust** strategies based on performance
3. **Add more pairs** to `TRADING_SYMBOLS`
4. **Scale up** gradually with real money (when ready)
5. **Consider** adding IBKR or Kraken for stocks/crypto

---

**Happy Forex Trading! 📈💱**

Remember: Always start with demo accounts and test thoroughly before using real money!
