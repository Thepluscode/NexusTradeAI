# NexusTradeAI Operations Gap Register

Last updated: 2026-05-02

This register tracks production gaps that cannot be solved by adding another strategy or endpoint. Keep it current when incidents, billing changes, or architecture changes happen.

## Current Live Baseline

Active Railway services:

- Stock bot: `https://nexus-stock-bot-production.up.railway.app`
- Forex bot: `https://nexus-forex-bot-production.up.railway.app`
- Crypto bot: `https://nexus-crypto-bot-production.up.railway.app`
- Strategy bridge: `https://nexus-strategy-bridge-production.up.railway.app`
- Dashboard: `https://nexus-dashboard-production-e6e6.up.railway.app`

Production verification:

```bash
./scripts/verify-production.sh
```

## P0 Gaps

### Railway Redeploys Must Fail Closed

Status: implemented in `.github/workflows/deploy.yml`; validate on the next deploy run.

Incident: the GitHub deploy workflow printed "All redeploy triggers sent" while Railway GraphQL returned `Not Authorized` for every service.

Required behavior:

- Missing `RAILWAY_TOKEN` fails the deploy job.
- GraphQL responses with `errors` fail the deploy job.
- Smoke checks report every service status before exiting.

Validation:

- Rerun the deploy workflow with a valid token and confirm each Railway response has no `errors`.
- Temporarily test with an invalid token in a non-production branch and confirm the job fails before smoke tests.

### Billing Shutdown Must Not Surprise Production

Incident: Railway subscription shutdown caused public domains to return edge-level `404 Application not found`.

Required behavior:

- Keep a monthly inventory of active projects, services, databases, volumes, and domains.
- Every Railway database must have an owner and retention decision.
- Delete databases for inactive projects only after backup/export.
- Production services must have a cost ceiling and alert threshold.

Monthly audit checklist:

```text
[ ] Export or confirm backup for each database before deletion.
[ ] Confirm no active service still uses the database URL.
[ ] Delete inactive app services.
[ ] Delete inactive databases and volumes.
[ ] Delete unused environments.
[ ] Delete unused custom domains.
[ ] Record expected monthly cost after cleanup.
```

## P1 Gaps

### Strategy Edge Is Not Proven Enough

Status: evidence evaluator implemented in `services/signals/strategy-evidence.js`; strict execution filtering is controlled by `STRATEGY_EVIDENCE_GATE=true`.

Current state:

- Stock ORB is near breakeven.
- Crypto momentum is modestly positive.
- Forex is paused because earlier strategies had poor live results.

Required behavior:

- Every active strategy has a backtest result, walk-forward result, and live paper-trading performance record.
- Strategy enablement is gated by minimum sample size and drawdown limits.
- Strategy disabling produces a visible reason in dashboard/API.

Validation:

- Strategy registry shows enabled/disabled status and reason.
- Backtest and live-paper results are linked by strategy id and market regime.
- Dashboard Strategy Performance and Operator Status show evidence disabled reasons from `/api/ops/status`.

### Bot Monoliths Limit Safe Change

Status: shared live-safety and ops-status helpers have been extracted; route handlers, broker clients, lifecycle, and strategy routing are still mostly inline.

Current state:

- Stock, forex, and crypto bot engines still mix Express routes, broker integration, strategy evaluation, persistence, and control flow in large files.

Target extraction order:

1. Route handlers.
2. Broker clients.
3. Engine lifecycle.
4. Strategy routing.
5. Regime/performance reporting.

Rule:

- Do not refactor anti-churning or position safety logic without dedicated tests first.

### Live-Money Readiness Is Incomplete

Status: live-mode approval guard and redacted audit-event builder exist in `clients/bot-dashboard/shared/live-safety.js`; broker reconciliation, durable immutable audit storage, and global kill switch remain open.

Required before real-money trading:

- Broker-level kill switch.
- Max daily loss guard.
- Max open exposure guard across all bots.
- Broker-vs-database reconciliation.
- Immutable audit events for trade decisions, order attempts, fills, rejects, and manual overrides.
- Operator approval flow for changing live trading mode.

## P2 Gaps

### Documentation Drift

Current state:

- `AGENTS.md` is the operational source of truth.
- `README.md` has been reset to the current Railway bot architecture.
- Long-form historical notes still need to be sorted into `docs/archive/` or deleted.

Required behavior:

- Keep current production architecture at the top of `README.md`.
- Move old local-service reports to `docs/archive/`.
- Keep `AGENT.md` as a short compatibility file pointing to `AGENTS.md`.

### Observability Coverage

Status: initial operator status API implemented for stock, forex, and crypto bots; dashboard UI and durable event retention remain open.

Required operator signals:

- Last scan age per bot.
- Strategy disabled/suppressed reasons.
- Trade rejection reasons.
- Strategy bridge latency and error rate.
- Database connectivity.
- Railway redeploy trigger result.
- Cost/billing status outside the app dashboard.

Retention:

- Health and metrics can remain ephemeral.
- Trade decisions, order attempts, rejects, fills, and manual overrides should be persisted in PostgreSQL or an append-only external sink.
