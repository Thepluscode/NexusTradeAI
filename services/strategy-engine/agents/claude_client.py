"""
Async Claude API client with timeout, rate limiting, and structured output via tool_use.

Uses Anthropic's tool_use feature to get structured JSON responses
instead of parsing free text — more reliable for trading decisions.
"""

import os
import json
import time
import asyncio
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


# Tool definitions for structured output
TRADE_DECISION_TOOL = {
    "name": "submit_trade_decision",
    "description": "Submit your trade evaluation decision with structured data.",
    "input_schema": {
        "type": "object",
        "properties": {
            "approved": {
                "type": "boolean",
                "description": "True if trade has positive expected value, false to reject"
            },
            "confidence": {
                "type": "number",
                "description": "Conviction level 0.0 to 1.0"
            },
            "reason": {
                "type": "string",
                "description": "Concise explanation under 120 characters"
            },
            "risk_flags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "0-3 specific risk concerns"
            },
            "position_size_adjustment": {
                "type": "number",
                "description": "Multiplier 0.25-1.5 (1.0 = no change, <1 = reduce, >1 = increase)"
            },
            "market_regime_assessment": {
                "type": "string",
                "enum": ["trending", "ranging", "volatile", "quiet", "transitioning"],
                "description": "Current market regime assessment"
            }
        },
        "required": ["approved", "confidence", "reason", "risk_flags", "position_size_adjustment", "market_regime_assessment"]
    }
}

MARKET_ANALYSIS_TOOL = {
    "name": "submit_market_analysis",
    "description": "Submit market regime and condition analysis.",
    "input_schema": {
        "type": "object",
        "properties": {
            "regime": {
                "type": "string",
                "enum": ["trending_up", "trending_down", "ranging", "volatile", "quiet", "breakout"]
            },
            "regime_confidence": {
                "type": "number",
                "description": "0.0-1.0 confidence in regime assessment"
            },
            "trend_strength": {
                "type": "string",
                "enum": ["strong", "moderate", "weak", "none"]
            },
            "volatility_level": {
                "type": "string",
                "enum": ["high", "moderate", "low"]
            },
            "key_observations": {
                "type": "array",
                "items": {"type": "string"},
                "description": "2-4 key market observations"
            },
            "favorable_for_entry": {
                "type": "boolean",
                "description": "Whether current conditions favor new entries"
            }
        },
        "required": ["regime", "regime_confidence", "trend_strength", "volatility_level", "key_observations", "favorable_for_entry"]
    }
}

LESSON_EXTRACTION_TOOL = {
    "name": "submit_trade_lessons",
    "description": "Submit lessons learned from a completed trade.",
    "input_schema": {
        "type": "object",
        "properties": {
            "pattern_type": {
                "type": "string",
                "description": "Category: regime_mismatch, overbought_entry, low_volume_trap, trend_exhaustion, good_setup, strong_momentum"
            },
            "actionable_lesson": {
                "type": "string",
                "description": "One concise sentence the decision agent should remember"
            },
            "should_adjust_sizing": {
                "type": "boolean",
                "description": "Whether similar setups need position size adjustment"
            },
            "sizing_direction": {
                "type": "string",
                "enum": ["increase", "decrease", "unchanged"]
            },
            "confidence_in_lesson": {
                "type": "number",
                "description": "0.0-1.0 how confident in this lesson"
            }
        },
        "required": ["pattern_type", "actionable_lesson", "should_adjust_sizing", "sizing_direction", "confidence_in_lesson"]
    }
}

AUTOPSY_SYNTHESIS_TOOL = {
    "name": "submit_autopsy_synthesis",
    "description": "Submit your synthesis of the post-loss autopsy findings. Combine all agent analyses into a final diagnosis.",
    "input_schema": {
        "type": "object",
        "properties": {
            "primary_failure_mode": {
                "type": "string",
                "enum": ["bad_entry_timing", "adverse_news", "stop_too_tight", "regime_mismatch", "bad_luck", "multiple_factors"],
                "description": "The main reason this trade lost money"
            },
            "actionable_lesson": {
                "type": "string",
                "description": "One concise sentence the trading system should remember to avoid this loss pattern"
            },
            "confidence": {
                "type": "number",
                "description": "0.0-1.0 confidence in this diagnosis"
            },
            "severity": {
                "type": "string",
                "enum": ["minor", "moderate", "severe"],
                "description": "How serious this failure pattern is"
            }
        },
        "required": ["primary_failure_mode", "actionable_lesson", "confidence", "severity"]
    }
}


class ClaudeClient:
    """Async Claude API client with structured output via tool_use."""

    def __init__(self):
        self.api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = "claude-haiku-4-5-20251001"  # 10x cheaper than Sonnet, great for structured tool_use
        self.client = None
        self._available = False
        self._daily_calls = 0
        self._daily_budget = 400  # max API calls per day (raised from 200)
        self._last_reset = time.time()
        self._call_timestamps: List[float] = []
        self._hourly_limit = 30  # reduced from 60 to pace usage evenly

        self._init()

    def _init(self):
        if not self.api_key:
            logger.warning("ANTHROPIC_API_KEY not set — Claude client unavailable")
            return
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=self.api_key)
            self._available = True
            logger.info(f"Claude client initialized ({self.model})")
        except ImportError:
            logger.warning("anthropic package not installed")
        except Exception as e:
            logger.error(f"Claude client init error: {e}")

    @property
    def available(self) -> bool:
        return self._available and self.client is not None

    def _check_rate_limits(self) -> bool:
        """Check daily and hourly rate limits."""
        now = time.time()

        # Reset daily counter every 24h
        if now - self._last_reset > 86400:
            self._daily_calls = 0
            self._last_reset = now

        if self._daily_calls >= self._daily_budget:
            return False

        # Hourly limit
        self._call_timestamps = [t for t in self._call_timestamps if (now - t) < 3600]
        if len(self._call_timestamps) >= self._hourly_limit:
            return False

        return True

    async def call_with_tool(
        self,
        system: str,
        user_message: str,
        tool: Dict,
        timeout_seconds: int = 15
    ) -> Optional[Dict]:
        """
        Call Claude with a tool definition and extract structured output.
        Returns the tool input dict, or None on failure.
        """
        if not self.available:
            return None

        if not self._check_rate_limits():
            logger.warning("Claude rate limit reached")
            return None

        try:
            self._daily_calls += 1
            self._call_timestamps.append(time.time())

            loop = asyncio.get_event_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: self.client.messages.create(
                        model=self.model,
                        max_tokens=400,
                        system=system,
                        messages=[{"role": "user", "content": user_message}],
                        tools=[tool],
                        tool_choice={"type": "tool", "name": tool["name"]}
                    )
                ),
                timeout=timeout_seconds
            )

            # Extract tool_use block
            for block in response.content:
                if block.type == "tool_use":
                    return block.input

            logger.warning("No tool_use block in Claude response")
            return None

        except asyncio.TimeoutError:
            logger.warning(f"Claude call timed out ({timeout_seconds}s)")
            return None
        except Exception as e:
            logger.error(f"Claude call error: {e}")
            return None

    def get_stats(self) -> Dict:
        now = time.time()
        hourly_calls = len([t for t in self._call_timestamps if (now - t) < 3600])
        return {
            "available": self.available,
            "model": self.model,
            "daily_calls": self._daily_calls,
            "daily_budget": self._daily_budget,
            "daily_remaining": self._daily_budget - self._daily_calls,
            "hourly_calls": hourly_calls,
            "hourly_limit": self._hourly_limit,
            "hourly_remaining": self._hourly_limit - hourly_calls,
        }
