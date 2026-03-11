# NexusTradeAI TypeScript SDK

AI-powered trade signal evaluation. One API call → GO/NO-GO decision with confidence, reasoning, and risk flags.

## Install

```bash
npm install nexustrade-ai
```

## Quick Start

```ts
import { NexusTradeAI } from "nexustrade-ai";

const nexus = new NexusTradeAI("ntai_live_your_key");

const result = await nexus.evaluate({
  symbol: "AAPL",
  price: 185.50,
  direction: "long",
  rsi: 58.3,
  momentum_pct: 2.8,
});

if (result.should_enter && result.confidence > 0.6) {
  console.log(`GO (${(result.confidence * 100).toFixed(0)}%): ${result.reason}`);
} else {
  console.log(`NO-GO: ${result.reason}`);
}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `symbol` | string | Yes | Ticker (e.g. "AAPL", "EUR_USD", "BTC_USD") |
| `price` | number | Yes | Current market price |
| `direction` | "long" \| "short" | No | Trade direction (default: "long") |
| `asset_class` | "stock" \| "forex" \| "crypto" | No | Asset class (default: "stock") |
| `rsi` | number | No | RSI value (0-100) |
| `momentum_pct` | number | No | Price change % (e.g. 2.5 = +2.5%) |
| `volume_ratio` | number | No | Volume vs 20-day average |
| `tier` | "tier1" \| "tier2" \| "tier3" | No | Signal tier (default: "tier1") |

## Response

```ts
{
  should_enter: true,
  confidence: 0.82,
  direction: "long",
  reason: "Strong momentum with bullish regime confirmation",
  risk_flags: [],
  position_size_multiplier: 1.2,
  market_regime: "trending_up",
  evaluation_id: "eval_abc123",
  latency_ms: 145
}
```

## Get your API key

Sign up free at [nexustradeai.com](https://nexus-dashboard-production-e6e6.up.railway.app) → API Access → Create Key.

Free tier: 100 evaluations/month. No credit card required.
