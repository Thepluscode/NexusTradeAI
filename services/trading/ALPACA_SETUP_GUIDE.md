# Alpaca Setup Guide - Free Real Market Data

## Step 1: Create Free Alpaca Account (5 minutes)

1. **Go to Alpaca:** https://alpaca.markets
2. **Click "Sign Up"**
3. **Choose "Paper Trading Only"** (100% free, no credit card needed)
4. **Fill in the form:**
   - Name, Email, Password
   - Click "I agree to terms"
   - Click "Create Account"
5. **Verify your email** (check inbox)

## Step 2: Get Your API Keys (2 minutes)

1. **Log in to Alpaca:** https://app.alpaca.markets
2. **Go to "Paper Trading"** section (left sidebar)
3. **Click "Generate API Keys"** or "View API Keys"
4. **Copy both keys:**
   - API Key ID (starts with PK...)
   - Secret Key (starts with ...)

   ⚠️ **IMPORTANT:** Save the Secret Key immediately - you can only see it once!

## Step 3: Add Keys to Your Bot (1 minute)

### Option A: Create `.env` file (Recommended)

1. **Go to your project root:**
   ```bash
   cd /Users/theophilusogieva/Desktop/NexusTradeAI
   ```

2. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` file** and add your keys:
   ```bash
   # Alpaca API Keys (Paper Trading)
   ALPACA_API_KEY=PKxxxxxxxxxxxxxxxxxx
   ALPACA_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ALPACA_BASE_URL=https://paper-api.alpaca.markets

   # Keep paper trading enabled
   REAL_TRADING_ENABLED=false
   ```

### Option B: Environment Variables (Alternative)

```bash
export ALPACA_API_KEY="PKxxxxxxxxxxxxxxxxxx"
export ALPACA_SECRET_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export ALPACA_BASE_URL="https://paper-api.alpaca.markets"
```

## Step 4: Test Connection

```bash
cd services/trading
node -e "
const axios = require('axios');
const apiKey = process.env.ALPACA_API_KEY || 'YOUR_KEY_HERE';
const apiSecret = process.env.ALPACA_SECRET_KEY || 'YOUR_SECRET_HERE';

axios.get('https://paper-api.alpaca.markets/v2/account', {
  headers: {
    'APCA-API-KEY-ID': apiKey,
    'APCA-API-SECRET-KEY': apiSecret
  }
}).then(res => {
  console.log('✅ Connected to Alpaca!');
  console.log('Account:', res.data);
}).catch(err => {
  console.log('❌ Connection failed:', err.message);
});
"
```

## Step 5: Restart Bot with Real Data

```bash
cd services/trading
./stop-trading.sh
./start-trading.sh
```

The bot will now use **REAL market data** from Alpaca!

---

## What You Get (Free):

✅ **Real-time market data** for all US stocks
✅ **Paper trading account** with $100K virtual money
✅ **No credit card required**
✅ **No time limits**
✅ **Professional market data feed**
✅ **Historical data access**

---

## Benefits vs Mock Data:

| Feature | Mock Data | Alpaca Real Data |
|---------|-----------|------------------|
| Price accuracy | Random ±1% | Real market prices |
| Market structure | None | Real trends, support/resistance |
| Technical analysis | Doesn't work | Works properly |
| Win rate | ~27% | Expected 45-55% |
| Learning | Limited | Real market behavior |

---

## Troubleshooting

### "401 Unauthorized"
- Check your API keys are correct
- Make sure you're using Paper Trading keys
- Keys should start with `PK` for paper trading

### "Connection timeout"
- Check your internet connection
- Alpaca might be down (rare) - check https://status.alpaca.markets

### "Invalid symbols"
- Alpaca only supports US stocks and ETFs
- Crypto symbols won't work (use Binance for crypto)
- Forex won't work (use Interactive Brokers for forex)

---

## Next Steps After Setup:

1. Bot will automatically use real market data
2. Monitor performance for 1-2 hours
3. Win rate should improve to 40-50%+
4. Strategies will work much better with real data

---

## Security Tips:

🔒 **NEVER commit `.env` file to git**
🔒 **Don't share your API keys**
🔒 **Paper trading keys can't access real money**
🔒 **Regenerate keys if accidentally exposed**

---

Ready to start? Follow Step 1 above! 🚀
