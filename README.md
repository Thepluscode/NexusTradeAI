# NexusTradeAI

Paper-trading platform running independent stock, forex, crypto, strategy bridge, and dashboard services on Railway.

This project is currently paper trading only. Do not enable real-money trading without explicit prompt-level approval and the live-readiness controls documented in `docs/OPERATIONS_GAP_REGISTER.md`.

## Live Services

| Service | Runtime | URL |
|---------|---------|-----|
| Stock bot | Node.js/Express | `https://nexus-stock-bot-production.up.railway.app` |
| Forex bot | Node.js/Express | `https://nexus-forex-bot-production.up.railway.app` |
| Crypto bot | Node.js/Express | `https://nexus-crypto-bot-production.up.railway.app` |
| Strategy bridge | Python/FastAPI | `https://nexus-strategy-bridge-production.up.railway.app` |
| Dashboard | React/Vite | `https://nexus-dashboard-production-e6e6.up.railway.app` |

## Source Of Truth

Bot source files:

- Stock: `clients/bot-dashboard/unified-trading-bot.js`
- Forex: `clients/bot-dashboard/unified-forex-bot.js`
- Crypto: `clients/bot-dashboard/unified-crypto-bot.js`
- Dashboard: `clients/bot-dashboard/src/`
- Signals: `services/signals/`
- Strategy bridge: `services/strategy-engine/`

Deployment entry points under `deploy/*/bot.js` are thin loaders. Do not edit them directly.

Operational rules live in `AGENTS.md`. `AGENT.md` is a short compatibility file for tools that look for the singular filename.

## Current Strategies

- Stock: ORB is active; momentum is disabled after weak paper results.
- Forex: evidence-based restricted strategy set; service may be paused with `BOT_PAUSED=true`.
- Crypto: momentum is active; trend-pullback is disabled; funding-rate monitoring is read-only unless explicitly extended.

Strategy quality is tracked as an operations gap. New strategies should not be enabled without backtest, walk-forward, and live paper-trading evidence.

Strategy evidence gates:

- Backtest: minimum trade count, win rate, and profit factor.
- Walk-forward: out-of-sample trade count and Sharpe robustness.
- Live paper: recent closed paper trades, win rate, profit factor, and net P&L.

Set `STRATEGY_EVIDENCE_GATE=true` only after evidence rows exist for the target strategies. Without that flag, the dashboard still shows evidence failures, but execution remains controlled by the existing bot strategy gates.

## Verification

Targeted local checks:

```bash
cd services/signals && npx jest
npx jest tests/unit/ --config='{}'
cd clients/bot-dashboard && npm run lint && npx tsc --noEmit && npm run build
cd clients/bot-dashboard && npx jest shared/__tests__/ --ci --config '{}' --passWithNoTests
```

Production verification:

```bash
./scripts/verify-production.sh
```

The production verifier checks service health, strategy bridge agent stats, bot status, dashboard availability, and operator status endpoints.

## Deployment

Normal path:

```bash
git push origin main
```

GitHub Actions runs signal tests, dashboard checks, deploy sync, Railway redeploy triggers, and smoke tests.

Important failure mode: Railway GraphQL responses with `errors` must fail the deploy job. Do not treat "build succeeded" as proof that production works. Verify the live endpoints and relevant API contracts after deploy.

## Database

Runtime persistence is PostgreSQL. Do not use JSON files for Railway runtime state.

Key tables include:

- `trades`
- `engine_state`
- `users`
- `strategy_regime_performance`
- `evaluations`
- `scan_diagnostics`

Before deleting any Railway database, export it and confirm no active service still references its `DATABASE_URL`.

## Safety Rules

- Never commit secrets, broker credentials, Railway tokens, or `.env` files.
- Never increase position sizes or disable safety limits without explicit approval.
- Never touch anti-churning logic without reading the full `canTrade()` implementation and running focused tests.
- Real-money mode requires global live enablement, operator approval, daily loss limits, audit trail, and broker reconciliation.

## Operations Gaps

Tracked in `docs/OPERATIONS_GAP_REGISTER.md`:

- strategy edge quality
- live-money readiness
- observability coverage
- monolith refactor plan
- Railway cost controls
- deployment reliability
- test coverage around bot engines
