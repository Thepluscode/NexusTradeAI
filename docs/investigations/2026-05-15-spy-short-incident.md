# Investigation: 2026-05-15 SPY Unintended Short Incident

**Date of incident:** 2026-05-15 ~14:45 UTC (02:45 PM EST)
**Investigated:** 2026-05-22
**Status:** Investigation-only — no unambiguous fix identified. Human decision required.

---

## Incident Summary

Two orders fired ~28 seconds apart on the paper Alpaca account, both with
`order_source: access_key` (the bot's own API key):

| Time (EST) | Order | Notes |
|---|---|---|
| 02:45:06 PM | `sell 225 SPY @ $738.66 LIMIT` | Opened unintended -225 short |
| 02:45:34 PM | `buy 225 SPY @ $727.59 LIMIT` (≈ $738.66 × 0.985) | Cover attempt; never filled (off-market on wrong side) |

The short persisted ~14 hours until a manual cover the next day. Realized
loss ~$515 (paper money).

---

## Item 2: OrphanCover Verification ✅

**Finding: no change needed.**

`coverOrphanShorts` at `clients/bot-dashboard/unified-trading-bot.js:2793–2831`
places `side:'buy', type:'market', time_in_force:'day'` orders:

```javascript
// unified-trading-bot.js:2818
await axios.post(`${config.baseURL}/v2/orders`, {
    symbol: p.symbol, qty, side: 'buy', type: 'market', time_in_force: 'day'
}, { ... });
```

A repo-wide grep for `type.*limit`, `limit_price`, `bracket`, `stop_limit`,
and `order_class` in `*.js` (excluding node_modules, archives, and built
assets) returns **zero hits** inside any order-submission payload. No
stop-style limit-cover path exists anywhere in the codebase.

**Item 2: OrphanCover already uses a market buy (market-order since
2026-04-26); no stop-style limit-cover path exists; no change needed.**

---

## Item 1: Where Did the Limit Orders Come From?

### All `/v2/orders` POST calls in the bot (exhaustive list)

| Line | Function | side | type | Notes |
|------|----------|------|------|-------|
| 2818 | `coverOrphanShorts` | `buy` | `market` | OrphanCover |
| 4690 | `executeTrade` (global) | `buy` | `market` | Long entry |
| 4851 | `closePosition` (global) | `sell` | `market` | Exit |
| 6513 | `Engine.closePosition` | `sell` | `market` | Per-user exit |
| 6682 | `Engine.executeTrade` | `buy` | `market` | Per-user long entry |

**Every order submission in every git-tracked version uses `type: 'market'`.**
No `type: 'limit'` order exists anywhere. The incident's two LIMIT orders
cannot be produced by any code path in this repository.

### Why the limit orders remain unexplained

The git history is a shallow clone (`--depth 50`) with the earliest commit
dated 2026-05-12 (50 commits total, repo freshly initialized 3 days before
the incident). The Railway deployment on 2026-05-15 at 02:45 PM EST had
received several recent pushes (commits `823ef76`, `1af32f3`, `49a9750`
between 08:46–11:53 BST that day), all with `type: 'market'` intact.

The specific pattern observed:

- A **limit SELL** at the market price ($738.66) that opened a short
- A **limit BUY** at exactly `sell_price × 0.985` = `sell_price × (1 − 0.015)`

…matches a **paired limit-order entry pattern with a 1.5% protective buy
stop** that does not exist in any accessible version of this code. This
pattern predates the git history.

### Double-sell race condition (market-order variant — current code)

Even though limit orders cannot be produced, there is a structural concern
worth noting:

1. `closePosition()` (both global and Engine variants) fetches a fresh
   Alpaca position price for P&L recording before submitting the sell:

   ```javascript
   // unified-trading-bot.js:4835–4846
   try {
       const posRes = await axios.get(`${alpacaConfig.baseURL}/v2/positions/${symbol}`, ...);
       currentPrice = parseFloat(posRes.data.current_price);
   } catch (e) {
       // Not critical - just can't record P&L
   }
   ```

   If the position was already closed by another path, this fetch returns
   404. The `catch` swallows it silently, and the sell fires anyway using
   the caller-supplied `qty` (from an earlier Alpaca snapshot). On paper
   accounts, Alpaca accepts the sell and opens an unintended short.

2. The process-wide `closingSymbols` Set (`unified-trading-bot.js:4806`)
   prevents concurrent double-close *within a single event-loop flush*, but
   does **not** prevent a stale-Map close across *sequential scan cycles*
   (60 s apart).

3. The global `positions` Map (module-level, populated by the global engine)
   and each Engine's `this.positions` Map (populated by `Engine.executeTrade`
   and restored via `loadStateFromDb`) are **independent data structures**.
   A position entered by the global engine can be simultaneously "restored"
   into a per-user Engine's Map on the next `managePositions()` cycle.
   Conversely, the global engine's `managePositions()` restores unknown
   Alpaca positions into the global Map (lines 2869–2892).

4. The main scan interval guard (lines 8438–8441) only skips the global
   `tradingLoop()` when `anyEngineRunning = true`. If all per-user engines
   are registered but have `botRunning = false` (paused), BOTH the per-user
   Engine's `managePositions()` (called by `runScanQueue()`) AND the global
   `tradingLoop()` run in the same 60-second cycle.

   However, because both scan paths are driven by the same `setInterval`
   via sequential `await` calls, the global loop's `managePositions()` sees
   a *fresh* Alpaca snapshot taken AFTER the Engine loop completed. If the
   Engine already closed SPY, Alpaca will return an empty position list and
   the global loop will not re-fire. In practice this means the double-sell
   requires a very narrow window and has not been confirmed.

### Hypotheses ranked by confidence

| # | Hypothesis | Confidence | Evidence |
|---|---|---|---|
| 1 | Pre-git-history code version used limit orders; Railway was running that older code at the time of the incident | **High** | The only explanation consistent with `type: 'limit'` appearing at all. Git history starts May 12; incident May 15. |
| 2 | Double-sell via stale position Map (market orders, sequential engines) opened the short; a separate (now-removed) protective-limit-buy was placed by older code in a paired manner | **Medium** | The 404-swallow path in `closePosition` (line 4845) creates a plausible route for a market double-sell. Doesn't explain limit order type. |
| 3 | Alpaca paper trading displayed a market sell as a limit order internally | **Low** | Alpaca consistently records order type accurately; the specific $727.59 buy is too precise to be coincidental. |

### What a confirmed fix would look like (IF hypothesis 2 were confirmed)

The 404-swallow in `closePosition` means a "close a position we no longer
own" silently becomes an opening short. A defensive guard would be:

```javascript
// PROPOSED (not applied — hypothesis 2 is not confirmed):
// Before submitting the sell, verify the Alpaca position still exists and
// has positive qty. Abort if it's already flat.
try {
    const posRes = await axios.get(`${alpacaConfig.baseURL}/v2/positions/${symbol}`, ...);
    const alpacaQty = parseFloat(posRes.data.qty);
    if (!(alpacaQty > 0)) {
        console.warn(`[closePosition] ${symbol}: Alpaca qty=${alpacaQty} — aborting sell to avoid opening short`);
        positions.delete(symbol);
        return;
    }
    currentPrice = parseFloat(posRes.data.current_price);
} catch (e) {
    if (e.response?.status === 404) {
        console.warn(`[closePosition] ${symbol}: position not on Alpaca (404) — aborting sell to avoid opening short`);
        positions.delete(symbol);
        return;
    }
    // Non-404: price fetch failed but position may still exist. Proceed with sell.
}
```

**This patch is NOT applied in this PR.** Root cause of the 2026-05-15
incident is not confirmed, and the CLAUDE.md rules prohibit speculative
patches. The fix must wait for log-level confirmation (Railway logs from
2026-05-15 ~14:45 UTC).

---

## Validation

### `node --check` on every bot file (no code changes, verification only)

```
$ node --check clients/bot-dashboard/unified-trading-bot.js
(no output — exit 0: SYNTAX OK)

$ node --check deploy/stock-bot/unified-trading-bot.js
(no output — exit 0: SYNTAX OK)
```

Both files pass syntax check. No diff — no code was modified.

### Unified diff

No code changes in this PR. Investigation-only.

---

## Human Action Required

1. **Confirm freeze status**: freeze window 2026-05-10 to 2026-05-24; no
   deploy action before 2026-05-25.

2. **Retrieve Railway logs**: Pull Railway log export for the stock-bot
   service covering 2026-05-15 14:40–14:50 UTC. Look for:
   - Which code path fired the sell (`[closePosition]` log line, caller
     reason string e.g. `'Stop Loss'` or `'Time Stop'`)
   - Whether `[OrphanCover]` or `Engine.closePosition` logged anything
   - Whether `closingSymbols` blocked a second attempt
   - What the `positions` Map state was at the time

3. **Check pre-May-12 git history**: Determine what code was deployed to
   Railway before the repo was initialized. Look for a prior repo or
   Railway service source snapshot with limit-order order construction.

4. **Decide on the 404-guard patch**: If logs confirm hypothesis 2
   (double-sell via stale Map), apply the guard described above. If logs
   confirm hypothesis 1 (pre-history code), no code change is needed in
   the current codebase.

5. **After any fix is merged**: Deploy via the normal Railway pipeline and
   verify in Railway logs that:
   - No unexplained sell-to-short recurs
   - Any orphan event covers within seconds (OrphanCover market order)
