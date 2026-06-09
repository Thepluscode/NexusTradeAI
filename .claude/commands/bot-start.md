Start the NexusTradeAI trading bots. Ask which bot(s) to start if not specified: stock, forex, crypto, or all.

For each requested bot:

**Stock Bot (port 3002):**
```
cd clients/bot-dashboard && node unified-trading-bot.js > logs/unified-bot-protected.log 2>&1 &
```

**Forex Bot (port 3005):**
```
cd clients/bot-dashboard && node unified-forex-bot.js > logs/forex-bot.log 2>&1 &
```

**Crypto Bot (port 3006):**
```
cd clients/bot-dashboard && node unified-crypto-bot.js > logs/crypto-bot.log 2>&1 &
```

After starting, verify each bot is running with a health check and report status.
