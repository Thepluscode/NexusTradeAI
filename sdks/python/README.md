# NexusTradeAI Python SDK

AI-powered trade signal evaluation. One API call → GO/NO-GO decision with confidence, reasoning, and risk flags.

## Install

```bash
pip install nexustrade-ai
```

## Quick Start

```python
import asyncio
from nexustrade import NexusTradeAI

async def main():
    async with NexusTradeAI(api_key="ntai_live_your_key") as nexus:
        result = await nexus.evaluate(
            symbol="NVDA",
            price=875.50,
            direction="long",
            rsi=62.4,
            momentum_pct=3.2,
        )

        if result.should_enter and result.confidence > 0.6:
            print(f"GO ({result.confidence:.0%}): {result.reason}")
        else:
            print(f"NO-GO: {result.reason}")

asyncio.run(main())
```

## Get your API key

Sign up free at [nexustradeai.com](https://nexus-dashboard-production-e6e6.up.railway.app) → API Access → Create Key.

Free tier: 100 evaluations/month. No credit card required.
