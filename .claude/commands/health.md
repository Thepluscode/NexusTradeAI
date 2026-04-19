Check the health of all running NexusTradeAI services. Run these checks:

1. Stock bot: `curl -sf https://nexus-stock-bot-production.up.railway.app/health`
2. Crypto bot: `curl -sf https://nexus-crypto-bot-production.up.railway.app/health`
3. Forex bot: `curl -sf https://nexus-forex-bot-production.up.railway.app/health`
4. Strategy bridge: `curl -sf https://nexus-strategy-bridge-production.up.railway.app/health`
5. Dashboard: `curl -sf https://nexus-dashboard-production-e6e6.up.railway.app -o /dev/null -w "%{http_code}"`

For each service, report:
- Status (ok/down)
- Scan health (lastScanMs, errors)
- Trading activity (positions, tradesToday)
- Memory usage (heapUsedMB)

Then check strategy health by running evaluateStrategyHealth from the strategy registry
against recent trade data if available.

Flag any service that is down or has recentErrors > 0.
