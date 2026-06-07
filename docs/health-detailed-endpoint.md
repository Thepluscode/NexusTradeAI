# `GET /api/health/detailed` — Unauthenticated Bot Monitoring

**Added:** June 4, 2026
**Bots:** stock, forex, crypto (each exposes its own copy on port 8080)
**Auth:** none (read-only; safe to point uptime monitors / alerting at it)
**Source:** `services/signals/health-pnl.js` + `app.get('/api/health/detailed', …)` in each
`clients/bot-dashboard/unified-*-bot.js`

---

## Why it exists

`GET /health` is a fast liveness probe — it answers "is the scan loop alive, are
errors spiking, is memory OK" and returns HTTP 200 regardless. It exposes **no**
P&L, positions, or trade data, so you could not monitor actual performance without
digging into Railway logs or querying PostgreSQL directly.

`/api/health/detailed` closes that gap. One request returns the bot's live state,
DB-backed P&L (today + all-time), trade counts, win rate, and the current open
position list — the prerequisite for any external dashboard, alerting rule, or
accountability report.

`/health` is intentionally left unchanged (Railway healthcheck + CI smoke tests
depend on its exact behavior).

---

## URLs

```
https://nexus-stock-bot-production.up.railway.app/api/health/detailed
https://nexus-forex-bot-production.up.railway.app/api/health/detailed
https://nexus-crypto-bot-production.up.railway.app/api/health/detailed
```

---

## Response (200)

```jsonc
{
  "success": true,
  "bot": "crypto",                 // 'stock' | 'forex' | 'crypto'
  "healthy": true,                 // false when the aggregate health check is degraded/critical
  "status": { … },                 // full aggregateHealth() object (same checks as /health)
  "isRunning": true,               // GLOBAL (env-cred) engine — legacy; real trading is per-user
  "isPaused": false,
  "demoMode": false,               // crypto only — global engine demo (no env Kraken key)
  "botPausedEnv": false,           // forex only — reflects BOT_PAUSED env var

  "operationalStatus": "demo-idle", // ← read this, not the global flags. Derived from the
                                    // per-user registry: ok | idle | starting | scan-stalled |
                                    // demo-idle (no users + global demo, expected) | down
  "userEngines": {                 // per-user engines (creds from app Settings) — where real trading runs
    "total": 0,                    // engines registered
    "running": 0,                  // engines actively looping
    "validCreds": 0,               // engines with valid broker creds (crypto-specific)
    "demo": 0,                     // engines in demo fallback (crypto-specific)
    "openPositions": 0,            // summed across user engines
    "lastScanAt": null,            // newest per-engine scan (epoch ms) — null if none scanning
    "lastScanAgeSec": null
  },

  "pnl": {
    "source": "db",                // 'db' when the query succeeded, 'unavailable' otherwise
    "today": 1.23,                 // closed-trade P&L (USD) for trades whose exit (or create) date is today
    "total": -28.67,               // all-time closed-trade P&L (USD)
    "winRatePct": 35.7,            // winners / (winners + losers) * 100; null when no decided trades
    "error": "…"                   // present ONLY when source = 'unavailable'
  },

  "trades": {
    "today": 0,                    // closed trades today
    "total": 213,                  // all-time closed trades
    "winners": 76,
    "losers": 137
  },

  "positions": {
    "live": 0,                     // open positions in the bot's in-memory engine state
    "dbOpen": 0,                   // rows in `trades` with status='open' for this bot
    "list": [                      // normalized open positions (in-memory)
      {
        "symbol": "BTC/USD",
        "direction": "long",
        "entry": 64000.0,
        "stopLoss": 63000.0,
        "takeProfit": 66000.0,
        "size": 0.01,
        "strategy": "momentum",
        "entryTime": "2026-06-04T12:00:00.000Z"
      }
    ]
  },

  "timestamp": "2026-06-04T12:34:56.000Z"
}
```

### Error response (500)

If building the response throws (e.g. malformed in-memory position state), the
handler still returns a structured body — it never hangs the request:

```json
{ "success": false, "bot": "crypto", "error": "health detail unavailable", "detail": "<message>" }
```

If only the **DB** is down, the endpoint still returns **200** with
`pnl.source = "unavailable"`, `pnl.error`, and zeroed P&L/trade figures — the live
in-memory health and positions remain available (graceful degradation).

---

## Field semantics & guarantees

| Field | Source | Notes |
|-------|--------|-------|
| `pnl.today` / `pnl.total` | `trades` table | `status='closed'`, `pnl_usd` NaN-guarded → 0. **Identical aggregation to `GET /api/trades/summary`** so the two never disagree. |
| `pnl.winRatePct` | `trades` table | `winners / (winners + losers)`. Breakeven trades excluded from the denominator (matches each engine's in-memory `getStatus()`). `null` when there are no decided trades. |
| `trades.today` | `trades` table | Bucketed by `DATE(COALESCE(exit_time, created_at)) = CURRENT_DATE` in the DB timezone — same day-bucketing as `/api/trades/summary`. |
| `positions.live` / `list` | in-memory engine | The bot's actual open positions this process knows about. |
| `positions.dbOpen` | `trades` table | `status='open'` row count. A divergence from `positions.live` is a useful signal of orphaned/restored state. |

**Invariants**

- No numeric field is ever `NaN` — non-finite values coerce to `0`.
- `getPnlSummary()` never throws; a DB failure becomes `{ available:false, error }` and is logged (`[health-pnl] …`).
- The query is read-only and parameterized (`WHERE bot=$1`) — no string interpolation.

---

## Monitoring recipes

```bash
# Net all-time P&L per bot
for b in stock forex crypto; do
  echo -n "$b: "
  curl -s "https://nexus-$b-bot-production.up.railway.app/api/health/detailed" | jq '.pnl.total'
done

# Alert if a bot is running but the DB-backed P&L is unavailable
curl -s .../api/health/detailed | jq -e '.isRunning and (.pnl.source=="unavailable")' \
  && echo "ALERT: running with no P&L source"

# Detect orphaned positions (in-memory vs DB mismatch)
curl -s .../api/health/detailed | jq -e '.positions.live != .positions.dbOpen' \
  && echo "WARN: live/dbOpen position count mismatch"
```

---

## Tests & CI

- **Unit:** `services/signals/__tests__/health-pnl.test.js` — 24 tests covering normal,
  boundary, malformed, adversarial, regression, and dependency-failure cases.
  Run: `cd services/signals && npx jest health-pnl`.
- **Production contract:** the CI `smoke-tests` job validates the live JSON contract
  (`pnl` / `trades` / `positions` groups and their keys) on all three bots after every deploy.
