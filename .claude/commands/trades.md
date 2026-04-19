Show today's trading activity across all bots:

1. Stock bot: `curl -s https://nexus-stock-bot-production.up.railway.app/health`
2. Crypto bot: `curl -s https://nexus-crypto-bot-production.up.railway.app/health`
3. Forex bot: `curl -s https://nexus-forex-bot-production.up.railway.app/health`

For each running bot, report:
- Total trades today (from health endpoint tradesToday field)
- Open positions
- P&L
- Win rate
- Scan health (lastScanMs, errors)
- Memory usage

Also fetch recent trades:
- Stock: `curl -s 'https://nexus-stock-bot-production.up.railway.app/api/trades?limit=10'`
- Crypto: `curl -s 'https://nexus-crypto-bot-production.up.railway.app/api/trades?limit=10'`

Summarize: how many trades today, win/loss breakdown, total P&L.
