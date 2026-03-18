"""
Market Analysis Agent
=====================

Provides cached market regime analysis to give the Decision Agent
broader context about current conditions.

Cache: 60-second TTL per asset class (market regimes don't change every tick).
"""

import time
import logging
from typing import Optional, Dict

from agents.base import MarketSnapshot
from agents.claude_client import ClaudeClient, MARKET_ANALYSIS_TOOL

logger = logging.getLogger(__name__)

MARKET_ANALYSIS_SYSTEM = """You are a market regime analyst. Given current market indicators for a symbol, assess the overall market conditions.

Be precise and data-driven. Base your assessment on the indicators provided, not speculation.

Key regime definitions:
- trending_up: Clear higher highs/lows, strong momentum, RSI 50-70
- trending_down: Clear lower highs/lows, negative momentum, RSI 30-50
- ranging: No clear direction, RSI oscillating 40-60, low trend strength
- volatile: Large ATR, rapid regime changes, unpredictable
- quiet: Very low ATR, compressed ranges, low volume
- breakout: Price moving out of range with volume confirmation"""


class MarketAnalysisAgent:
    """Cached market regime analyzer using Claude."""

    def __init__(self, client: ClaudeClient, cache_ttl: int = 600):
        self.client = client
        self.cache_ttl = cache_ttl  # 10 minutes (was 60s — regime doesn't change every tick)
        self._cache: Dict[str, Dict] = {}
        self.total_calls = 0
        self.total_cache_hits = 0

    async def analyze(self, snapshot: MarketSnapshot) -> Optional[Dict]:
        """
        Get market regime analysis for the given snapshot.
        Uses rule-based analysis (no Claude call) — the DecisionAgent already
        receives all indicators and makes the Claude call. This saves ~50% of API budget.
        """
        cache_key = f"{snapshot.asset_class}:{snapshot.symbol}"
        cached = self._get_cached(cache_key)
        if cached:
            self.total_cache_hits += 1
            return cached

        # v8.0: Always use rule-based — eliminates redundant Claude call.
        # The DecisionAgent already sees all indicators in its prompt.
        result = self._default_analysis(snapshot)
        self.total_calls += 1
        self._cache[cache_key] = {"value": result, "ts": time.time()}
        return result

    def _get_cached(self, key: str) -> Optional[Dict]:
        entry = self._cache.get(key)
        if entry and (time.time() - entry["ts"]) < self.cache_ttl:
            return entry["value"]
        return None

    def _build_prompt(self, s: MarketSnapshot) -> str:
        lines = [f"MARKET ANALYSIS REQUEST: {s.symbol} ({s.asset_class})"]
        if s.rsi is not None: lines.append(f"RSI: {s.rsi:.1f}")
        if s.momentum is not None: lines.append(f"Momentum: {s.momentum}%")
        if s.percent_change is not None: lines.append(f"Intraday change: {s.percent_change}%")
        if s.volume_ratio is not None: lines.append(f"Volume ratio: {s.volume_ratio}x")
        if s.trend_strength is not None: lines.append(f"Trend strength: {s.trend_strength}")
        if s.atr_pct is not None: lines.append(f"ATR: {s.atr_pct}%")
        if s.regime is not None: lines.append(f"Local regime assessment: {s.regime}")
        if s.regime_quality is not None: lines.append(f"Local regime quality: {s.regime_quality}")
        if s.h1_trend is not None: lines.append(f"H1 trend: {s.h1_trend}")
        if s.session is not None: lines.append(f"Trading session: {s.session}")
        if s.macd_histogram is not None: lines.append(f"MACD histogram: {s.macd_histogram}")
        return "\n".join(lines)

    def _default_analysis(self, s: MarketSnapshot) -> Dict:
        """Fallback when Claude is unavailable — derive from local indicators."""
        regime = "ranging"
        if s.regime:
            regime = s.regime
        elif s.trend_strength and s.trend_strength > 0.5:
            regime = "trending_up" if (s.momentum or 0) > 0 else "trending_down"
        elif s.atr_pct and s.atr_pct > 2.0:
            regime = "volatile"

        return {
            "regime": regime,
            "regime_confidence": 0.3,
            "trend_strength": "moderate",
            "volatility_level": "high" if (s.atr_pct or 0) > 1.5 else "moderate",
            "key_observations": ["Derived from local indicators (AI unavailable)"],
            "favorable_for_entry": True,  # fail-open
        }

    def get_stats(self) -> Dict:
        return {
            "total_calls": self.total_calls,
            "total_cache_hits": self.total_cache_hits,
            "cache_entries": len(self._cache),
            "cache_ttl": self.cache_ttl,
        }
