"""
Decision Agent
==============

The core trade evaluator. Takes a MarketSnapshot + market analysis + learned patterns
and produces an AgentDecision (approve/reject with conviction and risk flags).

Uses Claude tool_use for structured output. Falls back to rule-based logic if unavailable.
"""

import logging
from typing import Optional, Dict, List

from agents.base import AgentDecision, MarketSnapshot
from agents.claude_client import ClaudeClient, TRADE_DECISION_TOOL

logger = logging.getLogger(__name__)

DECISION_SYSTEM = """You are a senior quantitative trading analyst at a hedge fund. You evaluate trade signals and provide a structured GO/NO-GO recommendation.

You are CONSERVATIVE — protecting capital is more important than capturing every opportunity. You reject mediocre setups and only approve trades with clear edge.

For each trade signal, analyze:
1. SIGNAL QUALITY — Is momentum/trend strong enough? Is volume confirming?
2. RISK/REWARD — Are stop and target levels sensible? Is R:R >= 1.5?
3. MARKET CONTEXT — Any red flags? (overextended RSI, low volume, choppy action)
4. TIMING — Good entry or chasing? Pullback entry vs. extension entry?
5. REGIME FIT — Does this trade fit the current market regime?

Use the submit_trade_decision tool to provide your structured evaluation.

Key rules:
- If RSI > 75 for longs or RSI < 25 for shorts → flag as overextended
- If volume_ratio < 1.0 → flag as low conviction move
- If trend_strength < 0.3 → flag as weak trend
- If ATR > 3% → flag as high volatility risk
- approved=true ONLY if you see clear positive expected value
- position_size_adjustment: reduce for risky setups, increase for ideal setups"""


class DecisionAgent:
    """Claude-powered trade decision maker."""

    def __init__(self, client: ClaudeClient):
        self.client = client
        self.total_decisions = 0
        self.total_approvals = 0
        self.total_rejections = 0

    async def evaluate(
        self,
        snapshot: MarketSnapshot,
        market_analysis: Optional[Dict] = None,
        lessons: Optional[List[str]] = None,
    ) -> AgentDecision:
        """
        Evaluate a trade signal and return a structured decision.
        """
        if not self.client.available:
            return self._rule_based_decision(snapshot)

        prompt = self._build_prompt(snapshot, market_analysis, lessons)
        try:
            result = await self.client.call_with_tool(
                system=DECISION_SYSTEM,
                user_message=prompt,
                tool=TRADE_DECISION_TOOL,
                timeout_seconds=15  # v5.0: increased from 12s for reliability
            )
        except Exception as e:
            logger.error(f"Decision agent Claude call exception: {e}")
            result = None

        if result:
            self.total_decisions += 1
            decision = AgentDecision(
                approved=result.get("approved", True),
                confidence=max(0.0, min(1.0, result.get("confidence", 0.5))),
                reason=str(result.get("reason", ""))[:200],
                risk_flags=result.get("risk_flags", [])[:5],
                position_size_multiplier=result.get("position_size_adjustment", 1.0),
                source="decision_agent",
                agents_consulted=["decision_agent"],
                market_regime=result.get("market_regime_assessment"),
                lessons_applied=lessons[:3] if lessons else [],
            )

            if decision.approved:
                self.total_approvals += 1
            else:
                self.total_rejections += 1

            logger.info(f"[DecisionAgent] {snapshot.symbol}: {'APPROVED' if decision.approved else 'REJECTED'} (conf: {decision.confidence:.2f}) — {decision.reason}")
            return decision

        # Claude returned None — fall back to rule-based (with logging)
        logger.warning(f"[DecisionAgent] {snapshot.symbol}: Claude returned None — using rule-based fallback")
        return self._rule_based_decision(snapshot)

    def _build_prompt(
        self,
        s: MarketSnapshot,
        market: Optional[Dict],
        lessons: Optional[List[str]],
    ) -> str:
        lines = [
            f"TRADE SIGNAL: {s.direction.upper()} {s.symbol} ({s.asset_class})",
            f"Tier: {s.tier}",
            f"Entry price: {s.price}",
        ]

        if s.stop_loss: lines.append(f"Stop loss: {s.stop_loss}")
        if s.take_profit: lines.append(f"Take profit: {s.take_profit}")
        if s.rsi is not None: lines.append(f"RSI: {s.rsi}")
        if s.momentum is not None: lines.append(f"Momentum: {s.momentum}%")
        if s.percent_change is not None: lines.append(f"Price change: {s.percent_change}%")
        if s.volume_ratio is not None: lines.append(f"Volume ratio: {s.volume_ratio}x")
        if s.trend_strength is not None: lines.append(f"Trend strength: {s.trend_strength}")
        if s.atr_pct is not None: lines.append(f"ATR: {s.atr_pct}%")
        if s.vwap: lines.append(f"VWAP: {s.vwap}")
        if s.h1_trend: lines.append(f"H1 trend: {s.h1_trend}")
        if s.session: lines.append(f"Session: {s.session}")
        if s.macd_histogram is not None: lines.append(f"MACD histogram: {s.macd_histogram}")
        if s.score is not None: lines.append(f"Signal score: {s.score}")

        # Market analysis context
        if market:
            lines.append(f"\nMARKET ANALYSIS:")
            lines.append(f"Regime: {market.get('regime', 'unknown')}")
            lines.append(f"Trend: {market.get('trend_strength', 'unknown')}")
            lines.append(f"Volatility: {market.get('volatility_level', 'unknown')}")
            obs = market.get("key_observations", [])
            if obs:
                lines.append(f"Observations: {'; '.join(obs[:3])}")

        # Learned lessons
        if lessons:
            lines.append(f"\nLESSONS FROM PAST TRADES (apply these):")
            for lesson in lessons[:5]:
                lines.append(f"- {lesson}")

        return "\n".join(lines)

    def _rule_based_decision(self, s: MarketSnapshot) -> AgentDecision:
        """Fallback decision when Claude is unavailable."""
        flags = []

        # RSI checks
        if s.rsi is not None:
            if s.direction == "long" and s.rsi > 75:
                flags.append("overbought_rsi")
            elif s.direction == "short" and s.rsi < 25:
                flags.append("oversold_rsi")

        # Volume check
        if s.volume_ratio is not None and s.volume_ratio < 0.8:
            flags.append("low_volume")

        # ATR check
        if s.atr_pct is not None and s.atr_pct > 3.0:
            flags.append("high_volatility")

        # Trend strength
        if s.trend_strength is not None and s.trend_strength < 0.2:
            flags.append("weak_trend")

        approved = len(flags) <= 1  # allow 1 flag, reject on 2+
        confidence = max(0.3, 1.0 - len(flags) * 0.2)

        return AgentDecision(
            approved=approved,
            confidence=confidence,
            reason=f"Rule-based: {len(flags)} flags" if flags else "Rule-based: signals look clean",
            risk_flags=flags,
            position_size_multiplier=1.0 if not flags else 0.75,
            source="rule_based_fallback",
            agents_consulted=["decision_agent_fallback"],
        )

    def get_stats(self) -> Dict:
        return {
            "total_decisions": self.total_decisions,
            "total_approvals": self.total_approvals,
            "total_rejections": self.total_rejections,
            "approval_rate": (self.total_approvals / max(1, self.total_decisions)) * 100,
        }
