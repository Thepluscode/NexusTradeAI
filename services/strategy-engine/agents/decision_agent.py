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
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agents.sentiment_agent import SentimentResult

logger = logging.getLogger(__name__)

DECISION_SYSTEM = """You are a quantitative trading analyst evaluating trade signals. Provide a structured GO/NO-GO recommendation using the submit_trade_decision tool.

Your job is to APPROVE trades that have a reasonable edge and REJECT only genuinely bad setups. You are NOT ultra-conservative — the bot's risk management (stop losses, position sizing, anti-churning) already protects capital. Your role is to filter out noise, not block everything.

Evaluate:
1. SIGNAL QUALITY — Does the signal have momentum/volume confirmation?
2. RISK/REWARD — Is R:R >= 1.5? Are stop/target levels sensible?
3. MARKET CONTEXT — Any red flags? (extreme RSI, very low volume, choppy action)
4. REGIME FIT — Does this trade fit the current market regime?

IMPORTANT — Asset-class-specific thresholds:
- STOCKS: trend_strength > 0.1 is decent, > 0.3 is strong. Volume ratio > 1.0 confirms.
- FOREX: trend_strength is raw pip movement (e.g. 0.0005 = 5 pips). Values > 0.0003 are normal. Do NOT reject forex trades for "weak trend" based on stock thresholds. Forex R:R and session timing matter more.
- CRYPTO: Higher volatility is normal. trend_strength > 0.05 is decent. Volume spikes confirm.

Rules:
- If RSI > 80 for longs or RSI < 20 for shorts → flag as overextended (note: 70-80 is NOT overextended in a trend)
- If volume_ratio < 0.5 → flag as very low conviction
- approved=true when you see a reasonable setup with positive expected value
- approved=false ONLY for clearly bad setups (multiple red flags, terrible R:R, counter-trend in ranging market)
- position_size_adjustment: 0.5 for marginal, 1.0 for solid, 1.25 for ideal setups
- When in doubt, APPROVE with reduced size rather than rejecting"""


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
        sentiment=None,
    ) -> AgentDecision:
        """
        Evaluate a trade signal and return a structured decision.
        sentiment: optional SentimentResult from SentimentAgent
        """
        if not self.client.available:
            return self._rule_based_decision(snapshot)

        prompt = self._build_prompt(snapshot, market_analysis, lessons, sentiment)
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
        sentiment=None,
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

        # Sentiment context
        if sentiment and sentiment.headline_count > 0:
            lines.append(f"\nSENTIMENT CONTEXT:")
            lines.append(f"Score: {sentiment.sentiment_score:+.2f} ({sentiment.sentiment_label})")
            lines.append(f"Bullish signals: {sentiment.bullish_count} | Bearish signals: {sentiment.bearish_count}")
            if sentiment.top_headlines:
                lines.append(f"Top headlines:")
                for hl in sentiment.top_headlines[:3]:
                    lines.append(f"  - {hl}")

        # Learned lessons
        if lessons:
            lines.append(f"\nLESSONS FROM PAST TRADES (apply these):")
            for lesson in lessons[:5]:
                lines.append(f"- {lesson}")

        return "\n".join(lines)

    def _rule_based_decision(self, s: MarketSnapshot) -> AgentDecision:
        """Fallback decision when Claude is unavailable."""
        flags = []

        # RSI checks (use wider bands — 70-80 is fine in a trend)
        if s.rsi is not None:
            if s.direction == "long" and s.rsi > 80:
                flags.append("overbought_rsi")
            elif s.direction == "short" and s.rsi < 20:
                flags.append("oversold_rsi")

        # Volume check (only flag very low volume)
        if s.volume_ratio is not None and s.volume_ratio < 0.5:
            flags.append("low_volume")

        # ATR check (crypto has higher vol, so raise threshold)
        atr_limit = 5.0 if s.asset_class == "crypto" else 3.0
        if s.atr_pct is not None and s.atr_pct > atr_limit:
            flags.append("high_volatility")

        # Trend strength — asset-class aware thresholds
        if s.trend_strength is not None:
            if s.asset_class == "forex" and s.trend_strength < 0.0001:
                flags.append("weak_trend")
            elif s.asset_class == "crypto" and s.trend_strength < 0.02:
                flags.append("weak_trend")
            elif s.asset_class == "stock" and s.trend_strength < 0.1:
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
