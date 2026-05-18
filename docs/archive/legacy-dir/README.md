# Legacy directory — pre-Railway historical artifacts

This directory holds the contents of the old top-level `legacy/` folder, archived
during the 2026-05-18 directory restructure (see `docs/RESTRUCTURE_PROPOSAL.md`).

## What's here

| File | Type | Era |
|---|---|---|
| `automation-server.js` | Pre-bot automation server entrypoint | pre-Railway monolith era |
| `check-orders.js`, `track-trades.js` | Manual order/trade inspection scripts | early debugging tools |
| `enhanced-integration-server.js` | Integration-test server | superseded by deploy/*-bot/ |
| `enhanced-market-data-server.js` | Market-data API server | superseded by per-bot market data calls |
| `mock-market-data-server.js` | Mock data for offline dev | superseded |
| `platform-demo.js` | Demo orchestrator | one-off |
| `simple-status.js`, `status-dashboard.js` | Status endpoints | superseded by `/api/<asset>/status` on each bot |
| `trading-server.js`, `trading-service.js` | Pre-bot trading entrypoints | superseded by `deploy/stock-bot/` |
| `*-dashboard.html` (5 files) | Pre-React standalone HTML dashboards | superseded by `clients/bot-dashboard/` |

## Why archived rather than deleted

These files document the **pre-Railway monolith architecture** the project
evolved away from. They're useful for:

- Understanding *why* certain decisions were made (the shape of "before" gives
  context for the ADRs in `docs/adr/`)
- Recovering any logic that the migration to the unified Railway services may
  have accidentally dropped — none known, but the working copies are kept as
  insurance

## Status

**Frozen.** Do not modify. Do not import from live code. Anything load-bearing
has been migrated into `deploy/`, `services/`, or `clients/bot-dashboard/`.

Verified at archive time: zero inbound references from `clients/`, `services/`,
`deploy/`, or `.github/`.
