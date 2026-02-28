# Railway Deployment Guide — NexusTradeAI

## Services to create (5 total)

| Service | Root Directory | Start Command |
|---------|---------------|---------------|
| `nexus-stock-bot` | `clients/bot-dashboard` | `node unified-trading-bot.js` |
| `nexus-forex-bot` | `clients/bot-dashboard` | `node unified-forex-bot.js` |
| `nexus-crypto-bot` | `clients/bot-dashboard` | `node unified-crypto-bot.js` |
| `nexus-strategy-bridge` | `services/strategy-engine` | `uvicorn strategy_bridge:app --host 0.0.0.0 --port $PORT` |
| `nexus-dashboard` | `clients/bot-dashboard` | `npm run build && npm start` |

---

## Step 1 — Create a Railway project

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select `NexusTradeAI`

---

## Step 2 — Create each service

For each service in the table above:
1. Click **+ New Service** → **GitHub Repo**
2. Set **Root Directory** to the value in the table
3. Railway will auto-detect Node.js or Python from the root dir

---

## Step 3 — Set environment variables

### Stock Bot (`nexus-stock-bot`)
```
ALPACA_API_KEY=your_key
ALPACA_SECRET_KEY=your_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_URL=https://data.alpaca.markets
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
NODE_ENV=production
```

### Forex Bot (`nexus-forex-bot`)
```
OANDA_API_KEY=your_key
OANDA_ACCOUNT_ID=your_account_id
OANDA_BASE_URL=https://api-fxpractice.oanda.com
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
NODE_ENV=production
```

### Crypto Bot (`nexus-crypto-bot`)
```
BINANCE_API_KEY=your_key
BINANCE_SECRET_KEY=your_secret
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
NODE_ENV=production
```

### Strategy Bridge (`nexus-strategy-bridge`)
No extra env vars needed.

### Dashboard (`nexus-dashboard`)
After the 3 bots and bridge are deployed, Railway gives each a public URL.
Set these in the dashboard service:
```
VITE_STOCK_BOT_URL=https://nexus-stock-bot.up.railway.app
VITE_FOREX_BOT_URL=https://nexus-forex-bot.up.railway.app
VITE_CRYPTO_BOT_URL=https://nexus-crypto-bot.up.railway.app
VITE_REAL_TRADING_ENABLED=false
```

---

## Step 4 — Deploy order

Deploy in this order to avoid the dashboard trying to reach bots before they're up:
1. `nexus-stock-bot`
2. `nexus-forex-bot`
3. `nexus-crypto-bot`
4. `nexus-strategy-bridge`
5. `nexus-dashboard` (last — needs bot URLs for env vars)

---

## Step 5 — Verify

Health check each service:
```
https://nexus-stock-bot.up.railway.app/health
https://nexus-forex-bot.up.railway.app/health
https://nexus-crypto-bot.up.railway.app/health
https://nexus-strategy-bridge.up.railway.app/health
```

Then open the dashboard URL — all panels should connect to the live bots.

---

## Notes

- Railway automatically injects `$PORT` — all bots read `process.env.PORT` first
- The Python bridge uses nixpacks with Python 3.11 (see `services/strategy-engine/nixpacks.toml`)
- `serve` is used to host the Vite static build in production
- Paper trading only — `VITE_REAL_TRADING_ENABLED=false` must stay false until validated
