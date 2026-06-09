Stop NexusTradeAI trading bots. Ask which bot(s) to stop if not specified: stock, forex, crypto, or all.

- Stock Bot: `lsof -ti :3002 | xargs kill -9`
- Forex Bot: `lsof -ti :3005 | xargs kill -9`
- Crypto Bot: `lsof -ti :3006 | xargs kill -9`
- Dashboard: `lsof -ti :3000 | xargs kill -9`

Verify processes are stopped and report.
