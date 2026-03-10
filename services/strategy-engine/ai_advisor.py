"""
NexusTradeAI - Agentic AI Trade Advisor
========================================

Uses Claude API to evaluate trade signals with market context.
Provides intelligent second-opinion on every trade candidate.

Design:
    - 5-minute TTL cache keyed on symbol:direction:tier
    - 60 calls/hour rate limit (~$7.20/day max at Sonnet pricing)
    - Fail-open: if AI is offline/rate-limited, approve by default
    - Only blocks trades where confidence > 0.6 and approved=False
"""

import os
import time
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# ========================================
# CACHE
# ========================================

class TTLCache:
    """Simple in-memory cache with per-key TTL."""

    def __init__(self, ttl_seconds: int = 300):
        self.ttl = ttl_seconds
        self._store: Dict[str, Dict[str, Any]] = {}

    def get(self, key: str) -> Optional[Dict]:
        entry = self._store.get(key)
        if entry and (time.time() - entry["ts"]) < self.ttl:
            return entry["value"]
        if entry:
            del self._store[key]
        return None

    def set(self, key: str, value: Dict):
        self._store[key] = {"value": value, "ts": time.time()}

    def stats(self) -> Dict:
        now = time.time()
        active = sum(1 for e in self._store.values() if (now - e["ts"]) < self.ttl)
        return {"total_entries": len(self._store), "active_entries": active}


# ========================================
# RATE LIMITER
# ========================================

class RateLimiter:
    """Sliding-window rate limiter."""

    def __init__(self, max_calls: int = 60, window_seconds: int = 3600):
        self.max_calls = max_calls
        self.window = window_seconds
        self._timestamps: list = []

    def can_call(self) -> bool:
        now = time.time()
        self._timestamps = [t for t in self._timestamps if (now - t) < self.window]
        return len(self._timestamps) < self.max_calls

    def record_call(self):
        self._timestamps.append(time.time())

    def stats(self) -> Dict:
        now = time.time()
        active = [t for t in self._timestamps if (now - t) < self.window]
        return {
            "calls_in_window": len(active),
            "max_calls": self.max_calls,
            "window_seconds": self.window,
            "remaining": self.max_calls - len(active),
        }


# ========================================
# AI ADVISOR
# ========================================

SYSTEM_PROMPT = """You are a senior quantitative trading analyst at a hedge fund. You evaluate trade signals and provide a clear GO/NO-GO recommendation.

You are conservative — protecting capital is more important than capturing every opportunity. You reject mediocre setups.

For each trade signal you receive, analyze:
1. Signal quality — is the momentum/trend strong enough to justify entry?
2. Risk/reward — are stop loss and profit targets sensible?
3. Market context — are there red flags (overextended RSI, low volume, choppy price action)?
4. Timing — is this a good entry point or are we chasing?

Respond with EXACTLY this JSON format (no markdown, no extra text):
{"approved": true/false, "confidence": 0.0-1.0, "reason": "one concise sentence", "risk_flags": ["flag1", "flag2"]}

Rules:
- approved=true means the trade has a positive expected value
- approved=false means skip this trade
- confidence: 0.0 = no opinion, 1.0 = very strong conviction
- Keep reason under 100 characters
- List 0-3 risk flags (empty array if none)"""

class AIAdvisor:
    """Claude-powered trade signal evaluator."""

    def __init__(self):
        self.api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = "claude-sonnet-4-20250514"
        self.cache = TTLCache(ttl_seconds=300)  # 5-minute cache
        self.rate_limiter = RateLimiter(max_calls=60, window_seconds=3600)
        self.client = None
        self._initialized = False

        # Stats
        self.total_calls = 0
        self.total_approvals = 0
        self.total_rejections = 0
        self.total_errors = 0
        self.total_cache_hits = 0

        self._init_client()

    def _init_client(self):
        """Initialize Anthropic client if API key is available."""
        if not self.api_key:
            logger.warning("ANTHROPIC_API_KEY not set — AI Advisor running in pass-through mode")
            return

        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=self.api_key)
            self._initialized = True
            logger.info("AI Advisor initialized with Claude Sonnet 4")
        except ImportError:
            logger.warning("anthropic package not installed — AI Advisor in pass-through mode")
        except Exception as e:
            logger.error(f"AI Advisor init error: {e}")

    @property
    def is_available(self) -> bool:
        return self._initialized and self.client is not None

    def _build_prompt(self, signal: Dict) -> str:
        """Build a concise trade evaluation prompt from the signal data."""
        asset_class = signal.get("asset_class", "stock")
        symbol = signal.get("symbol", "UNKNOWN")
        direction = signal.get("direction", "long")
        tier = signal.get("tier", "tier1")

        lines = [
            f"TRADE SIGNAL: {direction.upper()} {symbol} ({asset_class})",
            f"Tier: {tier}",
        ]

        # Price data
        if signal.get("price"):
            lines.append(f"Entry price: {signal['price']}")
        if signal.get("stop_loss"):
            lines.append(f"Stop loss: {signal['stop_loss']}")
        if signal.get("take_profit"):
            lines.append(f"Take profit: {signal['take_profit']}")

        # Indicators
        if signal.get("rsi") is not None:
            lines.append(f"RSI: {signal['rsi']}")
        if signal.get("momentum") is not None:
            lines.append(f"Momentum: {signal['momentum']}%")
        if signal.get("percent_change") is not None:
            lines.append(f"Price change: {signal['percent_change']}%")
        if signal.get("volume_ratio") is not None:
            lines.append(f"Volume ratio: {signal['volume_ratio']}x avg")
        if signal.get("trend_strength") is not None:
            lines.append(f"Trend strength: {signal['trend_strength']}")
        if signal.get("atr_pct") is not None:
            lines.append(f"ATR: {signal['atr_pct']}%")
        if signal.get("vwap"):
            lines.append(f"VWAP: {signal['vwap']}")
        if signal.get("h1_trend"):
            lines.append(f"H1 trend: {signal['h1_trend']}")
        if signal.get("session"):
            lines.append(f"Session: {signal['session']}")
        if signal.get("regime"):
            lines.append(f"Market regime: {signal['regime']}")
        if signal.get("regime_quality") is not None:
            lines.append(f"Regime quality: {signal['regime_quality']}")
        if signal.get("macd_histogram") is not None:
            lines.append(f"MACD histogram: {signal['macd_histogram']}")

        # Bridge result if available
        if signal.get("bridge_direction"):
            lines.append(f"Strategy bridge: {signal['bridge_direction']} (conf: {signal.get('bridge_confidence', 0):.2f})")

        # Score
        if signal.get("score") is not None:
            lines.append(f"Signal score: {signal['score']}")

        return "\n".join(lines)

    async def evaluate(self, signal: Dict) -> Dict:
        """
        Evaluate a trade signal using Claude.

        Returns:
            {
                "approved": bool,
                "confidence": float (0-1),
                "reason": str,
                "risk_flags": list[str],
                "source": "ai" | "cache" | "pass-through" | "rate-limited"
            }
        """
        symbol = signal.get("symbol", "UNKNOWN")
        direction = signal.get("direction", "long")
        tier = signal.get("tier", "tier1")
        cache_key = f"{symbol}:{direction}:{tier}"

        # Check cache first
        cached = self.cache.get(cache_key)
        if cached:
            self.total_cache_hits += 1
            cached["source"] = "cache"
            return cached

        # Pass-through if not available
        if not self.is_available:
            return self._pass_through("AI advisor not configured")

        # Rate limit check
        if not self.rate_limiter.can_call():
            return self._pass_through("Rate limit reached")

        # Call Claude
        try:
            self.rate_limiter.record_call()
            self.total_calls += 1

            prompt = self._build_prompt(signal)

            # Use synchronous client in async context via run_in_executor
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.messages.create(
                    model=self.model,
                    max_tokens=200,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": prompt}]
                )
            )

            # Parse response
            text = response.content[0].text.strip()
            result = json.loads(text)

            # Validate and normalize
            approved = bool(result.get("approved", True))
            confidence = float(result.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))
            reason = str(result.get("reason", ""))[:200]
            risk_flags = result.get("risk_flags", [])
            if not isinstance(risk_flags, list):
                risk_flags = []

            evaluation = {
                "approved": approved,
                "confidence": confidence,
                "reason": reason,
                "risk_flags": risk_flags[:3],
                "source": "ai",
            }

            # Update stats
            if approved:
                self.total_approvals += 1
            else:
                self.total_rejections += 1

            # Cache result
            self.cache.set(cache_key, evaluation)

            logger.info(f"[AI] {symbol} {direction} → {'APPROVED' if approved else 'REJECTED'} "
                       f"(conf: {confidence:.2f}) — {reason}")

            return evaluation

        except json.JSONDecodeError as e:
            logger.warning(f"[AI] JSON parse error for {symbol}: {e}")
            self.total_errors += 1
            return self._pass_through("AI response parse error")
        except Exception as e:
            logger.error(f"[AI] Evaluation error for {symbol}: {e}")
            self.total_errors += 1
            return self._pass_through(f"AI error: {str(e)[:80]}")

    def _pass_through(self, reason: str) -> Dict:
        """Default approval when AI is unavailable."""
        return {
            "approved": True,
            "confidence": 0.0,
            "reason": reason,
            "risk_flags": [],
            "source": "pass-through",
        }

    def get_stats(self) -> Dict:
        return {
            "available": self.is_available,
            "model": self.model,
            "total_calls": self.total_calls,
            "total_approvals": self.total_approvals,
            "total_rejections": self.total_rejections,
            "total_errors": self.total_errors,
            "total_cache_hits": self.total_cache_hits,
            "approval_rate": (self.total_approvals / max(1, self.total_calls)) * 100,
            "cache": self.cache.stats(),
            "rate_limiter": self.rate_limiter.stats(),
        }


# Singleton instance
ai_advisor = AIAdvisor()
