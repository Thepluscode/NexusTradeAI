"""
Agent Orchestrator
==================

Coordinates the multi-agent pipeline:

    Signal → KillSwitch → MarketAgent(cached) → DecisionAgent → SafetyGuardrails → Execute
    Trade Closed → LearningAgent → ScanEngine → Patterns → AdaptiveContext

The orchestrator:
- Manages the pipeline flow
- Handles caching (5-min TTL for identical signals)
- Records audit logs (append-only JSONL)
- Provides fail-open fallback at every stage
"""

import os
import json
import time
import logging
from datetime import datetime
from typing import Optional, Dict, List

from agents.base import AgentDecision, MarketSnapshot, AgentAuditEntry, TradeOutcome
from agents.safety import KillSwitch, SafetyGuardrails
from agents.claude_client import ClaudeClient
from agents.market_agent import MarketAnalysisAgent
from agents.outcome_store import outcome_store
from agents.decision_agent import DecisionAgent
from agents.learning_agent import LearningAgent
from agents.scan_engine import ScanEngine
from agents.supervisor_bandit import supervisor
from agents.analyst_rankings import analyst_rankings
from agents.portfolio_agent import portfolio_agent
from agents.sentiment_agent import SentimentAgent
from agents.macro_agent import macro_agent
from agents.institutional_agent import institutional_agent
from agents.autopsy_agent import run_autopsy, save_to_db as save_autopsy_to_db

logger = logging.getLogger(__name__)

MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
AUDIT_FILE = os.path.join(MEMORY_DIR, "agent_audit.jsonl")


class AgentOrchestrator:
    """
    Central coordinator for the agentic trading system.

    Pipeline:
        1. Kill switch check (hard stop)
        2. Cache check (5-min TTL)
        3. Market analysis (60s cache)
        4. Adaptive context (lessons + patterns)
        5. Decision agent (Claude evaluation)
        6. Safety guardrails (hardcoded limits)
        7. Audit log (append-only)
    """

    def __init__(self):
        self._client = ClaudeClient()
        self.kill_switch = KillSwitch()
        self.market_agent = MarketAnalysisAgent(self._client, cache_ttl=60)
        self.decision_agent = DecisionAgent(self._client)
        self.learning_agent = LearningAgent(self._client)
        self.scan_engine = ScanEngine()
        self.sentiment_agent = SentimentAgent()
        self.macro_agent = macro_agent
        self.institutional_agent = institutional_agent
        self.supervisor = supervisor

        # Decision cache (5-min TTL)
        self._cache: Dict[str, Dict] = {}
        self._cache_ttl = 300

        # Stats
        self.total_evaluations = 0
        self.total_approvals = 0
        self.total_rejections = 0
        self.total_kills = 0
        self.total_cache_hits = 0
        self.total_latency_ms = 0.0

        logger.info(f"Agent Orchestrator initialized | Claude: {'ACTIVE' if self._client.available else 'UNAVAILABLE'}")

    async def evaluate_signal(self, snapshot: MarketSnapshot) -> AgentDecision:
        """
        Run the full agent pipeline on a trade signal.
        Returns AgentDecision with approval, confidence, risk flags, and adjustments.
        """
        start = time.time()
        self.total_evaluations += 1

        # Step 1: Kill switch
        if self.kill_switch.is_killed():
            self.total_kills += 1
            decision = AgentDecision(
                approved=False,
                confidence=1.0,
                reason=f"Kill switch active: {self.kill_switch.get_status()['reason']}",
                source="kill_switch",
            )
            self._audit(snapshot, decision, time.time() - start)
            return decision

        # Step 2: Cache check
        cache_key = snapshot.cache_key()
        cached = self._get_cached(cache_key)
        if cached:
            self.total_cache_hits += 1
            cached.source = "cache"
            return cached

        # Step 3: Market analysis (60s cache)
        market_analysis = await self.market_agent.analyze(snapshot)

        # Step 4: Supervisor bandit — select strategy arm for this context
        bandit_rec = self.supervisor.select_arm(
            regime=snapshot.regime or "unknown",
            asset_class=snapshot.asset_class,
            tier=snapshot.tier,
        )

        # If bandit says "skip", reject immediately
        if bandit_rec.selected_arm == "skip":
            self.total_rejections += 1
            decision = AgentDecision(
                approved=False,
                confidence=0.9,
                reason=f"Supervisor bandit: skip context {bandit_rec.context_key}",
                source="supervisor_skip",
            )
            self._audit(snapshot, decision, time.time() - start)
            return decision

        # Step 4b: Sentiment analysis (5-min cache)
        sentiment = None
        try:
            sentiment = await self.sentiment_agent.analyze(
                symbol=snapshot.symbol,
                asset_class=snapshot.asset_class,
            )
            # Hard reject on strong negative sentiment
            if sentiment.sentiment_score < -0.6 and sentiment.bearish_count >= 3:
                self.total_rejections += 1
                decision = AgentDecision(
                    approved=False,
                    confidence=0.85,
                    reason=f"Strong negative sentiment (score={sentiment.sentiment_score:.2f}, "
                           f"{sentiment.bearish_count} bearish signals)",
                    source="sentiment_agent",
                    risk_flags=["strong_negative_sentiment"],
                )
                self._audit(snapshot, decision, time.time() - start)
                return decision
        except Exception as e:
            logger.error(f"Sentiment agent error (fail-open): {e}")

        # Step 4c: Macro regime analysis (1-hour cache)
        macro = None
        try:
            macro = await self.macro_agent.analyze(asset_class=snapshot.asset_class)
            # Hard reject in extreme risk-off for aggressive tiers
            if macro.regime_score < -0.6 and snapshot.tier in ("tier2", "tier3"):
                self.total_rejections += 1
                decision = AgentDecision(
                    approved=False,
                    confidence=0.9,
                    reason=f"Extreme risk-off macro (VIX={macro.vix}, score={macro.regime_score:.2f})",
                    source="macro_agent",
                    risk_flags=["macro_risk_off"],
                )
                self._audit(snapshot, decision, time.time() - start)
                return decision
        except Exception as e:
            logger.error(f"Macro agent error (fail-open): {e}")

        # Step 4d: Institutional flow (24-hour cache, stock-only)
        institutional = None
        if snapshot.asset_class == "stock":
            try:
                institutional = await self.institutional_agent.analyze(snapshot.symbol)
                # Hard reject if heavy institutional selling
                if institutional.net_sentiment < -0.6 and institutional.total_funds_holding >= 3:
                    self.total_rejections += 1
                    decision = AgentDecision(
                        approved=False,
                        confidence=0.85,
                        reason=f"Heavy institutional selling ({institutional.total_funds_decreasing + institutional.total_funds_exited} funds reducing/exiting)",
                        source="institutional_agent",
                        risk_flags=["institutional_selling"],
                    )
                    self._audit(snapshot, decision, time.time() - start)
                    return decision
            except Exception as e:
                logger.error(f"Institutional agent error (fail-open): {e}")

        # Step 5: Adaptive context — get lessons and patterns
        lessons = self.learning_agent.get_applicable_lessons(
            symbol=snapshot.symbol,
            asset_class=snapshot.asset_class,
            regime=snapshot.regime or "",
        )
        relevant_patterns = self.scan_engine.get_relevant_patterns(
            asset_class=snapshot.asset_class,
            rsi=snapshot.rsi,
            regime=snapshot.regime,
            volume_ratio=snapshot.volume_ratio,
        )
        # Inject pattern lessons
        for p in relevant_patterns[:3]:
            if p.actionable_lesson and p.actionable_lesson not in lessons:
                lessons.append(p.actionable_lesson)

        # Step 6: Decision agent (with sentiment + macro + institutional context)
        decision = await self.decision_agent.evaluate(
            snapshot=snapshot,
            market_analysis=market_analysis,
            lessons=lessons,
            sentiment=sentiment,
            macro=macro,
            institutional=institutional,
        )

        # Step 6b: Macro-based adjustments
        if macro:
            if macro.regime_score < -0.3:
                decision.position_size_multiplier *= 0.7
                decision.risk_flags.append("macro_risk_off")
            elif macro.regime_score > 0.3:
                decision.confidence = min(1.0, decision.confidence + 0.05)

        # Step 6b2: Institutional-based adjustments (stocks only)
        if institutional and institutional.total_funds_holding >= 2:
            if institutional.net_sentiment > 0.4:
                decision.confidence = min(1.0, decision.confidence + 0.1)
            elif institutional.net_sentiment < -0.3:
                decision.position_size_multiplier *= 0.7
                decision.risk_flags.append("institutional_selling")

        # Step 6c: Sentiment-based adjustments
        if sentiment:
            if sentiment.sentiment_score < -0.3:
                # Moderately negative sentiment — reduce position size
                decision.position_size_multiplier *= 0.5
                decision.risk_flags.append("negative_sentiment")
            elif sentiment.sentiment_score > 0.5:
                # Positive sentiment — boost confidence slightly
                decision.confidence = min(1.0, decision.confidence + 0.1)

        # Step 6c: Adjust confidence based on analyst track record
        agent_score = analyst_rankings.get_agent_score(
            analyst=decision.source or "pipeline",
            asset_class=snapshot.asset_class,
            regime=snapshot.regime or "unknown",
        )
        # Blend: 70% agent's confidence + 30% historical reliability
        if agent_score != 0.5:  # Only adjust when we have real data
            decision.confidence = 0.7 * decision.confidence + 0.3 * agent_score

        # Step 7: Apply supervisor bandit constraints
        # Cap position size to bandit's recommendation
        decision.position_size_multiplier = min(
            decision.position_size_multiplier,
            bandit_rec.position_size_cap,
        )
        # Reject if confidence below bandit's conviction floor
        if decision.approved and decision.confidence < bandit_rec.conviction_floor:
            decision.approved = False
            decision.reason = (
                f"Below supervisor conviction floor ({decision.confidence:.2f} < "
                f"{bandit_rec.conviction_floor:.2f} for {bandit_rec.selected_arm} arm)"
            )
            decision.risk_flags.append("below_supervisor_threshold")

        # Step 7b: Portfolio-level risk check (cross-bot exposure)
        try:
            portfolio_risk = await portfolio_agent.check_risk(
                new_symbol=snapshot.symbol,
                new_asset_class=snapshot.asset_class,
                new_direction=snapshot.direction,
            )
            if portfolio_risk.blocked:
                decision.approved = False
                decision.reason = f"Portfolio risk: {', '.join(portfolio_risk.risk_flags)}"
                decision.risk_flags.extend(portfolio_risk.risk_flags)
            elif portfolio_risk.risk_flags:
                decision.risk_flags.extend(portfolio_risk.risk_flags)
                decision.position_size_multiplier = min(
                    decision.position_size_multiplier,
                    portfolio_risk.size_cap,
                )
        except Exception as e:
            logger.error(f"Portfolio risk check error: {e}")

        # Enrich decision with bandit metadata
        consulted = ["market_agent", "sentiment_agent", "decision_agent", "scan_engine", "supervisor_bandit", "portfolio_agent"]
        if macro:
            consulted.append("macro_agent")
        if institutional:
            consulted.append("institutional_agent")
        decision.agents_consulted = consulted
        decision.market_regime = market_analysis.get("regime") if market_analysis else None
        decision.lessons_applied = lessons[:3]

        # Store bandit arm on the decision for reward attribution
        self._last_bandit_arm = bandit_rec.selected_arm
        self._last_bandit_context = bandit_rec.context_key

        # Step 8: Safety guardrails (hardcoded, non-negotiable)
        decision = SafetyGuardrails.validate_decision(decision, snapshot)

        # Step 9: Audit and cache
        latency = time.time() - start
        self.total_latency_ms += latency * 1000

        if decision.approved:
            self.total_approvals += 1
            self.kill_switch.record_success()
        else:
            self.total_rejections += 1

        self._cache_decision(cache_key, decision)
        self._audit(snapshot, decision, latency)

        # [v4.1] Log decision to outcome store (four-learner shared store)
        try:
            await outcome_store.log_decision(snapshot, decision, latency * 1000)
        except Exception as e:
            logger.error(f"Outcome store decision log error: {e}")

        logger.info(
            f"[Agent] {snapshot.symbol} {snapshot.direction} → "
            f"{'APPROVED' if decision.approved else 'REJECTED'} "
            f"(conf: {decision.confidence:.2f}, size: {decision.position_size_multiplier:.2f}x) "
            f"— {decision.reason} [{latency*1000:.0f}ms]"
        )

        return decision

    async def record_trade_outcome(self, outcome: TradeOutcome):
        """
        Process a completed trade for learning.
        Called by bots when a position is closed.

        Pipeline: LearningAgent → ScanEngine → OutcomeStore(+reward) → KillSwitch → SupervisorBandit
        """
        # Learning agent extracts lessons
        lesson = await self.learning_agent.analyze_trade(outcome)

        # Scan engine tracks patterns
        self.scan_engine.ingest_trade(outcome)

        # Update kill switch with P&L info
        if outcome.pnl_pct:
            self.kill_switch.update_pnl(outcome.pnl_pct / 100)

        # [v4.1] Log outcome + calculate reward in shared outcome store
        reward = None
        try:
            reward = await outcome_store.log_outcome(
                outcome=outcome,
                pattern_type=lesson.get("pattern_type", "") if lesson else "",
                actionable_lesson=lesson.get("actionable_lesson", "") if lesson else "",
                lesson_confidence=lesson.get("confidence_in_lesson", 0) if lesson else 0,
            )
            if reward:
                logger.info(f"[Reward] {outcome.symbol}: {reward.reward_score:+.3f}")
        except Exception as e:
            logger.error(f"Outcome store log error: {e}")

        # [v4.2] Feed reward back to supervisor bandit
        if reward:
            try:
                arm = getattr(self, '_last_bandit_arm', 'moderate')
                self.supervisor.update(
                    regime=outcome.entry_regime or "unknown",
                    asset_class=outcome.asset_class,
                    tier=outcome.tier,
                    arm=arm,
                    reward_score=reward.reward_score,
                )
            except Exception as e:
                logger.error(f"Bandit update error: {e}")

        if lesson:
            logger.info(f"[Learn] {outcome.symbol}: {lesson.get('actionable_lesson', 'no lesson')}")

        # [v7.1] Post-loss autopsy — run 5 parallel analysis agents on losing trades
        if outcome.pnl_pct is not None and outcome.pnl_pct < 0:
            try:
                autopsy_report = await run_autopsy(
                    outcome=outcome,
                    claude_client=self._client,
                    sentiment_agent=self.sentiment_agent,
                )
                # Save to DB if pool is available
                pool = await outcome_store._get_pool()
                if pool:
                    await save_autopsy_to_db(autopsy_report, pool)

                # Inject autopsy lesson into learning agent for future decisions
                if autopsy_report.actionable_lesson:
                    self.learning_agent.inject_lesson(
                        symbol=outcome.symbol,
                        asset_class=outcome.asset_class,
                        regime=outcome.entry_regime or "",
                        lesson=f"[AUTOPSY] {autopsy_report.actionable_lesson}",
                    )
                    logger.info(
                        f"[Autopsy] {outcome.symbol}: {autopsy_report.primary_failure_mode} "
                        f"({autopsy_report.severity}) — {autopsy_report.actionable_lesson}"
                    )
            except Exception as e:
                logger.error(f"Autopsy agent error (non-fatal): {e}")

    def _get_cached(self, key: str) -> Optional[AgentDecision]:
        entry = self._cache.get(key)
        if entry and (time.time() - entry["ts"]) < self._cache_ttl:
            return entry["decision"]
        return None

    def _cache_decision(self, key: str, decision: AgentDecision):
        self._cache[key] = {"decision": decision, "ts": time.time()}

    def _audit(self, snapshot: MarketSnapshot, decision: AgentDecision, latency: float):
        """Append to immutable audit log."""
        entry = AgentAuditEntry(
            timestamp=datetime.now().isoformat(),
            symbol=snapshot.symbol,
            direction=snapshot.direction,
            asset_class=snapshot.asset_class,
            tier=snapshot.tier,
            decision="approved" if decision.approved else ("killed" if decision.source == "kill_switch" else "rejected"),
            confidence=decision.confidence,
            reason=decision.reason,
            risk_flags=decision.risk_flags,
            source=decision.source,
            agents_consulted=decision.agents_consulted,
            position_size_multiplier=decision.position_size_multiplier,
            market_regime=decision.market_regime,
            lessons_applied=decision.lessons_applied,
            latency_ms=latency * 1000,
        )

        try:
            os.makedirs(MEMORY_DIR, exist_ok=True)
            with open(AUDIT_FILE, 'a') as f:
                f.write(entry.to_json() + "\n")
        except Exception as e:
            logger.error(f"Audit log write error: {e}")

    def get_stats(self) -> Dict:
        avg_latency = (self.total_latency_ms / max(1, self.total_evaluations))
        return {
            "orchestrator": {
                "total_evaluations": self.total_evaluations,
                "total_approvals": self.total_approvals,
                "total_rejections": self.total_rejections,
                "total_kills": self.total_kills,
                "total_cache_hits": self.total_cache_hits,
                "approval_rate": f"{(self.total_approvals / max(1, self.total_evaluations)) * 100:.1f}%",
                "avg_latency_ms": f"{avg_latency:.0f}",
            },
            "claude": self._client.get_stats(),
            "kill_switch": self.kill_switch.get_status(),
            "market_agent": self.market_agent.get_stats(),
            "sentiment_agent": self.sentiment_agent.get_stats(),
            "decision_agent": self.decision_agent.get_stats(),
            "learning_agent": self.learning_agent.get_stats(),
            "scan_engine": self.scan_engine.get_stats(),
            "supervisor_bandit": self.supervisor.get_stats(),
            "analyst_rankings": analyst_rankings.get_stats(),
            "macro_agent": self.macro_agent.get_stats(),
            "institutional_agent": self.institutional_agent.get_stats(),
            "portfolio_agent": portfolio_agent.get_stats(),
            "outcome_store": outcome_store.get_stats(),
        }


# Singleton
orchestrator = AgentOrchestrator()
