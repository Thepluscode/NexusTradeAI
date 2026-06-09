# Strategy Backlog (v1 — research-only, no code)

> 5 candidate strategies that would slot into existing bot infrastructure
> with NO new data sources and minimal new execution code. Designed to be
> ready-to-test on 2026-05-25 if crypto/momentum retires, OR queued behind
> it if crypto/momentum scales up.
>
> Each entry has: hypothesis, evidence it might work, what we'd need to
> build, how we'd test it, expected sample-size to reach significance.

---

## Selection criteria

A candidate strategy is in the backlog only if it:

1. **Uses existing data**. No new feeds (no earnings API, no order-book L2, no funding-rate feed) for v1. Same OHLCV that current bots already ingest.
2. **Fits the existing execution path**. Same Alpaca/OANDA/crypto-exchange clients, same position-management code, same exit rules. Only the *signal generation* changes.
3. **Has a falsifiable hypothesis**. "Stocks go up over time" is not a hypothesis; "the close-to-open gap in NVDA reverses 60% of the time on days when the prior day's volume was > 2× 20-day avg" is.
4. **Tests in < 30 days** to first signal. A strategy that needs 90 trades to clear minN=30 at 1 trade/day is too slow for our cycle.

---

## Candidate 1 — Pairs trading: EURUSD vs GBPUSD

**Hypothesis**: EURUSD and GBPUSD are cointegrated (long-run equilibrium with mean-reverting spread). When their normalized spread deviates >2σ from its 60-day rolling mean, the spread reverts within 24-48h more often than chance.

**Evidence it might work**:
- Pairs trading is a textbook strategy in academic literature (Gatev et al. 2006). Edge has decayed in equities but is generally preserved in currency pairs because central bank policy correlations don't change as fast as fundamental relationships.
- The forex bot already has both pairs in its scan universe. Spread series is computable in-process.

**What to build**:
- New signal: compute `z_score = (current_spread - rolling_mean_60d) / rolling_std_60d`
- Entry: when |z| > 2, short the relatively expensive pair and long the cheap one
- Exit: when z crosses zero, or after 48h (time stop)
- Position sizing: equal dollar amounts both sides

**Test plan**:
- Backtest against last 90 days of forex tick data already in DB
- Live shadow for 14 days
- Apply the same CI rule: clear `pnl_pct_ci_low > 0` to graduate

**Sample size to significance**:
- Expected signal rate: 1-2 entries/week per pair
- 30 trades ≈ 4-6 months at one pair
- **Workaround**: run across 3 cointegrated pairs (EURUSD/GBPUSD, EURUSD/USDCHF, AUDUSD/NZDUSD) → ~30 trades in 6-8 weeks

**Risk to thesis**: cointegration is not stationary. Brexit-style structural breaks can permanently widen a spread without reverting. Mitigation: rolling cointegration test, if Engle-Granger p-value drops below 0.05 for >5 days consecutively, pause the pair.

---

## Candidate 2 — Crypto volatility-cluster breakout

**Hypothesis**: Periods of compressed realized volatility (ATR in the 30th percentile of trailing 60 days) are followed by directional breakouts within 24h more often than chance, on the same asset.

**Evidence it might work**:
- Volatility clusters (Engle 1982). Periods of low volatility are systematically followed by high volatility — but the direction isn't symmetric in crypto. Bull-skew (crypto trends up after compression more often than it trends down).
- Strategy that fits existing crypto bot: it already computes ATR.

**What to build**:
- New signal: when ATR_14 < 30th percentile of trailing 60 days for 4+ consecutive bars AND price breaks the high of the compression range, enter long; conversely for low break, enter short.
- Exit: stop at compression-range opposite extreme, take profit at 2× range width.
- Universe: top 5 crypto pairs by volume.

**Test plan**:
- Same as candidate 1.

**Sample size**:
- Expected signal rate: 2-3 setups/week across 5 pairs (compressions are common, but most don't break)
- 30 trades ≈ 10-15 weeks
- Acceptable for a 14-day initial shadow + 30-day decision window if we relax minN to 20 initially.

**Risk**: false breakouts. The strategy depends on the compression being real and the break being directional. Mitigation: confirm with volume — only take breaks on bars where volume > 1.5× 20-bar average.

---

## Candidate 3 — Stock first-15-min mean reversion

**Hypothesis**: When a US-listed stock moves more than 0.5σ in the first 15 minutes after open relative to its 20-day intraday volatility, it tends to fade back toward the 9:30 open price by 10:30 AM.

**Evidence it might work**:
- Opening auctions over-react to overnight news. Liquidity returns by 9:45 and reverts the initial spike. Documented in market-microstructure literature.
- Stock bot already computes opening-range indicators (ORB is the current active strategy).

**What to build**:
- Signal: at 9:45 EST, compute the 15-min return relative to 20-day rolling stddev. If |return| > 0.5σ, fade entry at current price.
- Exit: target = 9:30 open (so a 50% retrace of the 15-min move). Stop = the 9:45 extreme + 1 ATR.
- Universe: SPY, QQQ, AAPL, NVDA, TSLA, MSFT, GOOGL (high-liquidity, narrow spreads).

**Test plan**:
- Backtest against last 90 days of stock tick data
- Live shadow for 30 days
- Per-symbol AND aggregate CI

**Sample size**:
- ~3 signals/week per symbol → 7 symbols × 4 weeks = 84 trades in a month. Fast to evaluate.

**Risk**: trend days. On strongly trending days the 9:30 open never gets revisited. Mitigation: time stop at 10:30 — if not at target, exit at current price (this is what most opening-reversal academic papers do).

---

## Candidate 4 — Forex session-handoff momentum

**Hypothesis**: When the Asian session direction (00:00-08:00 UTC) matches the London first-hour direction (08:00-09:00 UTC), the pair continues in that direction through London close (16:00 UTC) more often than chance.

**Evidence it might work**:
- Session-handoff confirmation is institutional flow following its own positioning. When two independent venues agree on direction, it's more likely a directional thesis than noise.
- The forex bot already tags trades with session. Adding signal logic is small.

**What to build**:
- Signal: at 09:00 UTC, check sign of (Asian session close - Asian session open) and sign of (09:00 close - 08:00 open). If signs match and |both moves| > 0.2 ATR, enter in that direction.
- Exit: trailing stop at 1.5× ATR, time stop at 16:00 UTC (London close).
- Universe: EURUSD, GBPUSD, USDJPY (top 3 forex pairs by liquidity).

**Test plan**:
- Same backtest pipeline as candidate 1.

**Sample size**:
- Expected signal rate: ~2 days/week (signals are rare because both sessions have to agree).
- 3 pairs × 2 sig/week × 5 weeks = 30 trades. ~5 weeks to significance.

**Risk**: news days override the pattern. Mitigation: skip the entry if a tier-1 economic event is scheduled in the next 4h.

---

## Candidate 5 — Cross-bot regime confluence

**Hypothesis**: Crypto/momentum signals are more likely to be profitable when the stock-market regime classifier reads "TRENDING_UP" or "MEAN_REVERTING" than when it reads "HIGH_VOLATILITY" or "TRENDING_DOWN."

**Evidence it might work**:
- Crypto correlation with US risk-on regimes is well documented. The bots already write `market_regime` (System-1 4-state classifier) to every trade as of 2026-05-09. The data to test this exists already.
- This isn't a new strategy — it's a *regime filter* on an existing strategy. If crypto/momentum retires on 5/24, this is the cleanest rescue attempt: maybe momentum works only in certain regimes.

**What to build**:
- At signal time in the crypto bot, query latest stock-bot regime classifier output (already exposed via `/api/ml/regime` per memory).
- Gate the entry: only execute crypto/momentum signals when stock_regime ∈ {TRENDING_UP, MEAN_REVERTING}.
- Other signals (other strategies) ignore the gate.

**Test plan**:
- **Retrospective first**. Query existing trades where decision_run_id is intact, join on stock_regime at decision time, compute CI per (strategy, regime) bucket. This is essentially a deeper edge-attribution query — no new live trades needed.
- If the retrospective shows separation (e.g., crypto/momentum CI clears zero in TRENDING_UP regime but goes negative in HIGH_VOLATILITY), THEN ship the gate.

**Sample size**:
- Already have 41 crypto/momentum trades with market_regime tagged. Need ~30 in the favorable regime to test. May be on the boundary today; will be confirmed by querying the existing data.

**Risk**: overfitting via slicing. Cutting an inconclusive strategy by regime to find a "winning slice" is exactly the curve-fitting we're trying to avoid. **Discipline**: pre-register the regime cut on paper before running the query. If the favorable slice doesn't beat the original CI by a meaningful margin (say, CI low at least 0.3% above zero), don't ship the gate.

---

## Prioritization

If crypto/momentum retires on 2026-05-24, here's the order I'd test:

1. **Candidate 5 (regime confluence)** — first, because it reuses existing data and might salvage crypto/momentum without new infrastructure. Cheapest test.
2. **Candidate 3 (stock first-15-min reversion)** — fastest to significance (~4-5 weeks). Different bot, different signal class, parallel to any crypto work.
3. **Candidate 2 (crypto volatility-cluster breakout)** — fills the crypto-strategy slot if Candidate 5 also fails.
4. **Candidate 1 (forex pairs trading)** — slowest to significance but tests a genuinely uncorrelated strategy class (mean-reversion at the pair level, not directional).
5. **Candidate 4 (forex session-handoff)** — alternative if forex pairs is too slow.

## What to NOT add to the backlog

For the record (and to resist temptation):

- "Use ML to predict X" — no. Hypothesis-first means the signal logic is human-readable and grounded in a *why*. ML wrapped around the same data we're already using doesn't add a why.
- "Add more filters to crypto/momentum" — no. If it's getting retired, it's retired. Don't resurrect via filter-tweaking. (Candidate 5 is the only exception, and only retrospectively.)
- "Try a different time frame" — no. Same strategy on 15-min bars is the same hypothesis, not a new one.
- "Buy and hold BTC with trailing stop" — that's not a strategy, that's a position. Not falsifiable in the hypothesis-first sense.
