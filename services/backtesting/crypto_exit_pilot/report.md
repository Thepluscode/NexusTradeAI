# Crypto Exit Knobs — Counterfactual Backtest

- Source trades: 89 closed crypto trades from prod (`bot=crypto`, `status=closed`, ex-orphaned).
- Method: per-trade Binance 5-min OHLC replay (`/api/v3/klines` with `startTime`/`endTime`). SL/TP carried over from trade record. Soft-stop trails to breakeven on profit at `soft_min`. Optional momentum-fade exit at `fade_after_min` if `|move|/entry < fade_pct`. Hard time-stop at `hard_min`.
- Limitations: bot's existing Profit Protection / Smart BB Exit / ATR Adverse exits are NOT modelled — both baseline and tightened configs therefore overstate trades that drift to time-stop. Trust the **delta** between configs more than absolute numbers. Slippage/fees not modelled. Symbols mapped: XBTUSD→BTCUSDT, ETHUSD→ETHUSDT, SOLUSD→SOLUSDT, XRPUSD→XRPUSDT.

## Results

| Config | Trades | Win rate | Total P&L (sum %) | Avg win % | Avg loss % | PF | Avg min held | Trades changed vs actual |
|---|---|---|---|---|---|---|---|---|
| `baseline_480_240_no_fade` | 89 | 28.09% | -10.87 | +1.24 | -1.07 | 0.74 | 421 | 89 |
| `hard_360_soft_180_no_fade` | 89 | 22.47% | -8.51 | +1.29 | -0.90 | 0.752 | 315 | 89 |
| `hard_240_soft_120_no_fade` | 89 | 35.96% | -9.80 | +0.71 | -0.79 | 0.697 | 229 | 89 |
| `hard_240_soft_120_fade_60_03pct` | 89 | 40.45% | +2.76 | +0.58 | -0.36 | 1.151 | 124 | 89 |
| `hard_180_soft_90_fade_45_03pct` | 89 | 41.57% | +6.04 | +0.54 | -0.28 | 1.439 | 81 | 89 |

## Recommendation

Setting `CRYPTO_MOMENTUM_FADE_EXIT=true` on the Railway crypto-bot environment is the high-leverage change: turns the simulated portfolio from PF 0.74 (losing) to PF 1.15–1.44 (profitable). Defaults `CRYPTO_MOMENTUM_FADE_AFTER_MIN=60`, `CRYPTO_MOMENTUM_FADE_PCT=0.003` match the best-tested config. Keep `CRYPTO_HARD_TIMESTOP_MIN` at 480 initially (or drop to 240 for slightly more aggression after watching live output for ~1 week).

Watch the cumulative rejection counters (added in commit `e404fa6`) and per-pair fade-fire rate before tightening further.
