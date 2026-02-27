# Three Bot Trading System - Complete Guide

## Overview
You now have **3 specialized trading bots**, each optimized for different asset classes with unique market characteristics.

---

## 1. 📈 STOCK BOT (Primary - Currently Running)

### File: `profitable-trading-server.js`
### Port: **3002**
### Status: ✅ **ACTIVE**

### Configuration:
- **Symbols**: 91 US stocks and ETFs (SPY, QQQ, AAPL, MSFT, etc.)
- **Trading Hours**: 10:00 AM - 3:30 PM EST (Monday-Friday)
- **Trend Requirement**: 0.5%+ MA spread
- **RSI Range**: 30-70
- **Volume**: 3M+ shares minimum
- **Stop Loss**: 3.5%
- **Take Profit**: 8%
- **Risk/Reward**: ~2.3:1

### Best For:
- Lower volatility
- Institutional liquidity
- Predictable market hours
- Beginner-friendly

### How to Run:
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI/services/trading
node profitable-trading-server.js
```

### API:
- Start: `POST http://localhost:3002/api/trading/start`
- Status: `GET http://localhost:3002/api/trading/status`
- Stop: `POST http://localhost:3002/api/trading/stop`

---

## 2. 🌍 FOREX BOT (24/5 Trading)

### File: `forex-trading-server.js`
### Port: **3005**
### Status: ⏸️ **READY (Not Started)**

### Configuration:
- **Symbols**: 13 currency pairs (EURUSD, GBPUSD, USDJPY, etc.)
- **Trading Hours**: 24/5 (Sunday 5 PM - Friday 5 PM EST)
- **Trend Requirement**: 0.3%+ (30 pips on EURUSD)
- **RSI Range**: 25-75 (wider for longer trends)
- **Volume**: N/A (forex is interbank, no volume)
- **Stop Loss**: 1.5% (~150 pips)
- **Take Profit**: 4.5% (~450 pips)
- **Risk/Reward**: 3:1

### Best For:
- 24/5 availability
- Lower volatility than crypto
- News-driven trading (economic data)
- Session-based strategies

### Optimal Trading Sessions:
- **London/NY Overlap**: 8 AM - 12 PM EST (BEST)
- **London Session**: 3 AM - 12 PM EST (EUR/GBP pairs)
- **Tokyo Session**: 7 PM - 4 AM EST (JPY pairs)

### Requirements:
- **Broker**: MetaTrader 4/5 or OANDA account
- **API Keys**: Set in `.env`:
  ```
  FOREX_BROKER=oanda
  FOREX_ACCOUNT_ID=your_account_id
  FOREX_API_KEY=your_api_key
  ```

### How to Run:
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI/services/trading
node forex-trading-server.js
```

### API:
- Start: `POST http://localhost:3005/api/forex/start`
- Status: `GET http://localhost:3005/api/forex/status`
- Stop: `POST http://localhost:3005/api/forex/stop`

---

## 3. 🔥 CRYPTO BOT (24/7 Trading - HIGH RISK)

### File: `crypto-trading-server.js`
### Port: **3006**
### Status: ⏸️ **READY (Not Started)**

### Configuration:
- **Symbols**: 12 cryptocurrencies (BTC, ETH, SOL, etc.)
- **Trading Hours**: 24/7/365 (never closes)
- **Trend Requirement**: 1.5%+ (crypto is volatile)
- **RSI Range**: 20-80 (extreme trends common)
- **Volume**: $1M+ daily minimum
- **Stop Loss**: 5% (wide for volatility)
- **Take Profit**: 15%
- **Risk/Reward**: 3:1

### Best For:
- High risk tolerance
- 24/7 trading
- Large profit potential
- Experienced traders

### Special Features:
- **BTC Correlation Check**: Altcoins only trade when BTC is bullish
- **Volume Confirmation**: Requires 1.2x average volume
- **Volatility Filter**: Pauses during 30%+ daily moves
- **Weekend Awareness**: Lower liquidity on weekends

### ⚠️ **WARNING:**
- **HIGH VOLATILITY**: 5-20% daily moves possible
- **Use small positions**: Max 2% risk per trade
- **Leverage = DANGER**: Use 2x max (exchanges offer 100x - DON'T)
- **Sentiment-driven**: Tweets/news can cause instant 10% moves

### Requirements:
- **Exchange**: Binance, Coinbase Pro, or Kraken account
- **API Keys**: Set in `.env`:
  ```
  CRYPTO_EXCHANGE=binance
  CRYPTO_API_KEY=your_api_key
  CRYPTO_API_SECRET=your_api_secret
  ```

### How to Run:
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI/services/trading
node crypto-trading-server.js
```

### API:
- Start: `POST http://localhost:3006/api/crypto/start`
- Status: `GET http://localhost:3006/api/crypto/status`
- Stop: `POST http://localhost:3006/api/crypto/stop`

---

## Comparison Table

| Feature | STOCKS | FOREX | CRYPTO |
|---------|--------|-------|--------|
| **Volatility** | Low (1-3%) | Medium (0.5-2%) | HIGH (5-20%) |
| **Trading Hours** | 6.5 hrs/day | 24/5 | 24/7 |
| **Liquidity** | High | Extremely High | Variable |
| **Stop Loss** | 3.5% | 1.5% | 5% |
| **Profit Target** | 8% | 4.5% | 15% |
| **Risk Level** | LOW | MEDIUM | HIGH |
| **Beginner Friendly** | ✅ Yes | ⚠️ Moderate | ❌ No |
| **Volume Required** | 3M+ shares | N/A | $1M+ |
| **Leverage** | 2x max | 10x max | 2x max |
| **RSI Range** | 30-70 | 25-75 | 20-80 |
| **Trend Min** | 0.5% | 0.3% | 1.5% |

---

## Recommended Approach

### Phase 1: Master Stocks (Current)
- **Duration**: 3-6 months
- **Goal**: Achieve consistent profitability (60%+ win rate)
- **Focus**: Learn the strategy on lower volatility assets
- **Risk**: 1% per trade

### Phase 2: Add Forex (When Profitable)
- **Prerequisites**: 60%+ win rate on stocks for 3+ months
- **Goal**: Extend trading hours, diversify
- **Focus**: Session-based trading, economic calendar
- **Risk**: 1% per trade

### Phase 3: Add Crypto (Advanced Only)
- **Prerequisites**: Profitable on both stocks and forex
- **Goal**: High-risk, high-reward opportunities
- **Focus**: BTC trend following, volume analysis
- **Risk**: 2% per trade (MAX)

---

## Running Multiple Bots Simultaneously

You can run all 3 bots at the same time:

```bash
# Terminal 1: Stocks (6.5 hrs/day)
cd services/trading
node profitable-trading-server.js

# Terminal 2: Forex (24/5)
node forex-trading-server.js

# Terminal 3: Crypto (24/7)
node crypto-trading-server.js
```

### Dashboard Integration:
The bots run on different ports:
- **Stocks**: localhost:3002
- **Forex**: localhost:3005
- **Crypto**: localhost:3006

You can create a unified dashboard that monitors all three.

---

## Key Differences Explained

### Why Different RSI Ranges?

**Stocks (30-70)**:
- Shorter trends, mean-reversion common
- RSI > 70 = overbought, likely reversal

**Forex (25-75)**:
- Longer trends due to macroeconomic factors
- RSI > 75 still valid in strong trends

**Crypto (20-80)**:
- EXTREME trends (FOMO/panic)
- RSI > 80 = strong momentum, not reversal

### Why Different Stop Losses?

**Stocks (3.5%)**:
- Lower volatility
- Tight stops work without getting stopped out

**Forex (1.5%)**:
- Even lower volatility (pips move slowly)
- Tight stops = better risk/reward

**Crypto (5%)**:
- HIGH volatility (5% moves are noise)
- Tight stops = constant stop-outs

### Why Different Trading Hours?

**Stocks (10 AM - 3:30 PM EST)**:
- Market open volatility (9:30-10 AM) = avoid
- Market close volatility (3:30-4 PM) = avoid
- Best liquidity midday

**Forex (24/5, session-optimized)**:
- London/NY overlap = highest volume
- Tokyo session = JPY pairs only
- Never closes (follows the sun)

**Crypto (24/7)**:
- Never closes
- Weekend = lower liquidity
- Always on, always volatile

---

## Troubleshooting

### Stock Bot Not Trading?
- ✅ Markets must be open (9:30 AM - 4 PM EST)
- ✅ Trading hours: 10:00 AM - 3:30 PM EST
- ✅ Check RSI (must be 30-70)
- ✅ Check trend strength (0.5%+)

### Forex Bot Not Trading?
- ✅ Check if optimal session (London/NY overlap best)
- ✅ Verify broker API connection
- ✅ Economic news coming? (bot pauses)

### Crypto Bot Not Trading?
- ✅ Is BTC bullish? (altcoins follow BTC)
- ✅ Check 24h volatility (< 30%)
- ✅ Volume increasing? (1.2x+ average)
- ✅ Verify exchange API connection

---

## Next Steps

1. ✅ **Stock bot is running** with 91 symbols (forex/crypto removed)
2. ⏸️ **Forex bot ready** - set up OANDA/MT4 account and API keys
3. ⏸️ **Crypto bot ready** - set up Binance/Coinbase and API keys
4. 📊 **Monitor stock bot performance** for next 2-4 weeks
5. 📈 **Once profitable** (60%+ win rate), add forex
6. 🔥 **Once advanced**, add crypto (high risk)

---

## Important Notes

- **Don't run all 3 immediately**: Master stocks first
- **Position sizing**: Stocks 1%, Forex 1%, Crypto 2% risk
- **Total risk**: Never exceed 5% total account risk across all bots
- **Correlation**: Some assets are correlated (e.g., tech stocks + crypto)
- **API costs**: Some brokers charge for live data feeds

Your stock bot is now clean, focused, and ready for tomorrow's markets! 🚀
