# NexusTradeAI Agent Notes

## Project

NexusTradeAI is a paper-trading platform with separate Railway services for stock, forex, crypto, strategy bridge, and dashboard.

Treat `AGENTS.md` as the source of truth for full project rules. This file is a lowercase compatibility note for tools that look for `agent.md`.

## Hard Rules

- Do not commit secrets, broker credentials, `.env` files, or Railway tokens.
- Do not increase position sizes or disable trading safety limits without explicit prompt-level approval.
- Do not edit `deploy/*/bot.js` directly. Bot source of truth lives under `clients/bot-dashboard/`.
- Do not touch anti-churning logic without reading the full `canTrade()` implementation first.
- Do not use JSON file persistence for Railway runtime state. Use PostgreSQL.
- Keep changes minimal and verify with commands before claiming completion.

## Active Source Files

- Stock bot: `clients/bot-dashboard/unified-trading-bot.js`
- Forex bot: `clients/bot-dashboard/unified-forex-bot.js`
- Crypto bot: `clients/bot-dashboard/unified-crypto-bot.js`
- Dashboard frontend: `clients/bot-dashboard/src/`
- Shared signal modules: `services/signals/`
- Shared auth: `clients/bot-dashboard/shared/auth.js`

## Verification Commands

Use the repo's documented targeted checks:

```bash
cd services/signals && npx jest
npx jest tests/unit/ --config='{}'
cd clients/bot-dashboard && npm run lint && npx tsc --noEmit && npm run build
cd clients/bot-dashboard && npx jest shared/__tests__/ --ci --config '{}' --passWithNoTests
```

Root `jest.config.js` has historical issues, so prefer explicit configs and targeted paths.

## Live Health Checks

```bash
curl -s https://nexus-stock-bot-production.up.railway.app/health
curl -s https://nexus-forex-bot-production.up.railway.app/health
curl -s https://nexus-crypto-bot-production.up.railway.app/health
curl -s https://nexus-strategy-bridge-production.up.railway.app/health
curl -s https://nexus-dashboard-production-e6e6.up.railway.app/
```

Build success is not enough. Verify the specific service endpoint and API contract affected by any change.
