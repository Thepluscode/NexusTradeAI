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
from agents.decision_agent import DecisionAgent
from agents.learning_agent import LearningAgent
from agents.scan_engine import ScanEngine

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

        # Step 4: Adaptive context — get lessons and patterns
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

        # Step 5: Decision agent
        decision = await self.decision_agent.evaluate(
            snapshot=snapshot,
            market_analysis=market_analysis,
            lessons=lessons,
        )

        # Enrich decision
        decision.agents_consulted = ["market_agent", "decision_agent", "scan_engine"]
        decision.market_regime = market_analysis.get("regime") if market_analysis else None
        decision.lessons_applied = lessons[:3]

        # Step 6: Safety guardrails (hardcoded, non-negotiable)
        decision = SafetyGuardrails.validate_decision(decision, snapshot)

        # Step 7: Audit and cache
        latency = time.time() - start
        self.total_latency_ms += latency * 1000

        if decision.approved:
            self.total_approvals += 1
            self.kill_switch.record_success()
        else:
            self.total_rejections += 1

        self._cache_decision(cache_key, decision)
        self._audit(snapshot, decision, latency)

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
        """
        # Learning agent extracts lessons
        lesson = await self.learning_agent.analyze_trade(outcome)

        # Scan engine tracks patterns
        self.scan_engine.ingest_trade(outcome)

        # Update kill switch with P&L info
        if outcome.pnl_pct:
            self.kill_switch.update_pnl(outcome.pnl_pct / 100)

        if lesson:
            logger.info(f"[Learn] {outcome.symbol}: {lesson.get('actionable_lesson', 'no lesson')}")

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
            "decision_agent": self.decision_agent.get_stats(),
            "learning_agent": self.learning_agent.get_stats(),
            "scan_engine": self.scan_engine.get_stats(),
        }


# Singleton
orchestrator = AgentOrchestrator()
