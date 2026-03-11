"""NexusTradeAI Python SDK — lightweight wrapper for the evaluate API."""

import httpx
from dataclasses import dataclass, field
from typing import Optional, List


DEFAULT_BASE_URL = "https://nexus-strategy-bridge-production.up.railway.app"


@dataclass
class EvaluationResult:
    """Result from an AI trade signal evaluation."""
    should_enter: bool
    confidence: float
    direction: str
    reason: str
    risk_flags: List[str] = field(default_factory=list)
    position_size_multiplier: float = 1.0
    market_regime: Optional[str] = None
    evaluation_id: Optional[str] = None
    latency_ms: float = 0.0


class NexusTradeAI:
    """Async client for the NexusTradeAI evaluate API.

    Usage::

        async with NexusTradeAI(api_key="ntai_live_...") as nexus:
            result = await nexus.evaluate(
                symbol="AAPL",
                price=185.50,
                direction="long",
                rsi=58.3,
            )
            if result.should_enter:
                print(f"GO ({result.confidence:.0%}): {result.reason}")
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.client = httpx.AsyncClient(
            base_url=base_url,
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            timeout=timeout,
        )

    async def evaluate(
        self,
        symbol: str,
        price: float,
        direction: str = "long",
        asset_class: str = "stock",
        rsi: Optional[float] = None,
        momentum_pct: Optional[float] = None,
        volume_ratio: Optional[float] = None,
        regime: Optional[str] = None,
        macd_histogram: Optional[float] = None,
        atr_pct: Optional[float] = None,
        vwap: Optional[float] = None,
        trend_strength: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        tier: str = "tier1",
    ) -> EvaluationResult:
        """Evaluate a trade signal and get AI GO/NO-GO decision.

        Args:
            symbol: Ticker (e.g. "AAPL", "EUR_USD", "BTC_USD")
            price: Current market price
            direction: "long" or "short"
            asset_class: "stock", "forex", or "crypto"
            rsi: RSI value (0-100)
            momentum_pct: Price change % (e.g. 2.5 = +2.5%)
            volume_ratio: Volume vs 20-day average
            regime: Market regime (trending_up, ranging, volatile, etc.)
            tier: Signal tier (tier1=conservative, tier3=aggressive)

        Returns:
            EvaluationResult with should_enter, confidence, reason, risk_flags
        """
        payload = {
            "symbol": symbol,
            "price": price,
            "direction": direction,
            "asset_class": asset_class,
            "tier": tier,
        }
        # Only include optional fields if provided
        optionals = {
            "rsi": rsi, "momentum_pct": momentum_pct,
            "volume_ratio": volume_ratio, "regime": regime,
            "macd_histogram": macd_histogram, "atr_pct": atr_pct,
            "vwap": vwap, "trend_strength": trend_strength,
            "stop_loss": stop_loss, "take_profit": take_profit,
        }
        for key, val in optionals.items():
            if val is not None:
                payload[key] = val

        resp = await self.client.post("/api/v1/evaluate", json=payload)
        resp.raise_for_status()
        data = resp.json()

        return EvaluationResult(
            should_enter=data["should_enter"],
            confidence=data["confidence"],
            direction=data["direction"],
            reason=data["reason"],
            risk_flags=data.get("risk_flags", []),
            position_size_multiplier=data.get("position_size_multiplier", 1.0),
            market_regime=data.get("market_regime"),
            evaluation_id=data.get("evaluation_id"),
            latency_ms=data.get("latency_ms", 0),
        )

    async def close(self):
        """Close the underlying HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
