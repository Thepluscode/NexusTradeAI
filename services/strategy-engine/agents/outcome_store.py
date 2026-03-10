"""
Outcome Store
=============

Shared persistence layer for the four-learner architecture.
Writes to PostgreSQL (decision_runs, executions, outcomes, rewards)
with JSONL fallback when DB is unavailable.

All four learners (analyst, supervisor, strategist, risk) read from this store.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict, List

from agents.base import AgentDecision, MarketSnapshot, TradeOutcome
from agents.reward_calculator import calculate_reward, RewardComponents

logger = logging.getLogger(__name__)

MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")

# JSONL fallback files (used when DB is unavailable)
DECISION_RUNS_FILE = os.path.join(MEMORY_DIR, "decision_runs.jsonl")
EXECUTIONS_FILE = os.path.join(MEMORY_DIR, "executions.jsonl")
OUTCOMES_FILE = os.path.join(MEMORY_DIR, "outcomes.jsonl")
REWARDS_FILE = os.path.join(MEMORY_DIR, "rewards.jsonl")


class OutcomeStore:
    """
    Shared outcome store for all four learners.

    Persists to PostgreSQL when DATABASE_URL is available,
    falls back to JSONL files otherwise.
    """

    def __init__(self):
        self.db_pool = None
        self._db_available = False
        self._init_db()

        # In-memory stats
        self.total_decisions_logged = 0
        self.total_executions_logged = 0
        self.total_outcomes_logged = 0
        self.total_rewards_calculated = 0

    def _init_db(self):
        """Try to connect to PostgreSQL."""
        db_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
        if not db_url:
            logger.info("No DATABASE_URL — outcome store using JSONL fallback")
            return

        try:
            import asyncpg
            # Store URL for lazy pool creation
            self._db_url = db_url
            self._db_available = True
            logger.info("Outcome store will use PostgreSQL")
        except ImportError:
            logger.info("asyncpg not installed — outcome store using JSONL fallback")

    async def _get_pool(self):
        """Lazy pool creation."""
        if self.db_pool is None and self._db_available:
            try:
                import asyncpg
                ssl_mode = os.environ.get("PGSSLMODE", "prefer")
                self.db_pool = await asyncpg.create_pool(
                    self._db_url,
                    min_size=1,
                    max_size=5,
                    ssl='require' if ssl_mode == 'require' else None,
                )
                await self._ensure_tables()
            except Exception as e:
                logger.error(f"DB pool creation failed: {e}")
                self._db_available = False
        return self.db_pool

    async def _ensure_tables(self):
        """Create tables if they don't exist."""
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        try:
            with open(schema_path, 'r') as f:
                sql = f.read()
            async with self.db_pool.acquire() as conn:
                await conn.execute(sql)
            logger.info("Outcome store tables verified/created")
        except Exception as e:
            logger.error(f"Table creation error: {e}")

    # ========================================
    # DECISION RUNS
    # ========================================

    async def log_decision(
        self,
        snapshot: MarketSnapshot,
        decision: AgentDecision,
        latency_ms: float = 0.0,
    ) -> Optional[int]:
        """Log an agent decision run. Returns decision_run_id."""
        record = {
            "timestamp": datetime.now().isoformat(),
            "symbol": snapshot.symbol,
            "asset_class": snapshot.asset_class,
            "direction": snapshot.direction,
            "tier": snapshot.tier,
            "price": snapshot.price,
            "rsi": snapshot.rsi,
            "momentum_pct": snapshot.momentum,
            "volume_ratio": snapshot.volume_ratio,
            "trend_strength": snapshot.trend_strength,
            "atr_pct": snapshot.atr_pct,
            "regime": snapshot.regime,
            "regime_quality": snapshot.regime_quality,
            "signal_score": snapshot.score,
            "approved": decision.approved,
            "confidence": decision.confidence,
            "reason": decision.reason,
            "risk_flags": decision.risk_flags,
            "position_size_multiplier": decision.position_size_multiplier,
            "market_regime": decision.market_regime,
            "source": decision.source,
            "agents_consulted": decision.agents_consulted,
            "lessons_applied": decision.lessons_applied,
            "latency_ms": latency_ms,
        }

        self.total_decisions_logged += 1
        decision_id = None

        pool = await self._get_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    decision_id = await conn.fetchval("""
                        INSERT INTO decision_runs (
                            symbol, asset_class, direction, tier, price, rsi,
                            momentum_pct, volume_ratio, trend_strength, atr_pct,
                            regime, regime_quality, signal_score,
                            approved, confidence, reason, risk_flags,
                            position_size_multiplier, market_regime, source,
                            agents_consulted, lessons_applied, latency_ms
                        ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                            $17::jsonb,$18,$19,$20,$21::jsonb,$22::jsonb,$23
                        ) RETURNING id
                    """,
                        snapshot.symbol, snapshot.asset_class, snapshot.direction,
                        snapshot.tier, snapshot.price, snapshot.rsi,
                        snapshot.momentum, snapshot.volume_ratio, snapshot.trend_strength,
                        snapshot.atr_pct, snapshot.regime, snapshot.regime_quality,
                        snapshot.score,
                        decision.approved, decision.confidence, decision.reason,
                        json.dumps(decision.risk_flags),
                        decision.position_size_multiplier, decision.market_regime,
                        decision.source,
                        json.dumps(decision.agents_consulted),
                        json.dumps(decision.lessons_applied),
                        latency_ms,
                    )
            except Exception as e:
                logger.error(f"DB decision log error: {e}")

        # Always write JSONL fallback
        record["decision_run_id"] = decision_id
        self._append_jsonl(DECISION_RUNS_FILE, record)

        return decision_id

    # ========================================
    # EXECUTIONS
    # ========================================

    async def log_execution(
        self,
        decision_run_id: Optional[int],
        snapshot: MarketSnapshot,
        fill_price: float,
        quantity: float,
        position_size_usd: float,
        strategy: str = "",
        agent_decision: Optional[AgentDecision] = None,
    ) -> Optional[int]:
        """Log a trade execution. Returns execution_id."""
        slippage = abs(fill_price - snapshot.price) / snapshot.price if snapshot.price else 0

        record = {
            "timestamp": datetime.now().isoformat(),
            "decision_run_id": decision_run_id,
            "symbol": snapshot.symbol,
            "asset_class": snapshot.asset_class,
            "direction": snapshot.direction,
            "tier": snapshot.tier,
            "strategy": strategy,
            "intended_price": snapshot.price,
            "fill_price": fill_price,
            "slippage_pct": slippage,
            "quantity": quantity,
            "position_size_usd": position_size_usd,
            "stop_loss": snapshot.stop_loss,
            "take_profit": snapshot.take_profit,
            "entry_rsi": snapshot.rsi,
            "entry_regime": snapshot.regime,
            "entry_regime_quality": snapshot.regime_quality,
            "entry_momentum": snapshot.momentum,
            "entry_volume_ratio": snapshot.volume_ratio,
            "entry_atr_pct": snapshot.atr_pct,
            "entry_score": snapshot.score,
        }

        if agent_decision:
            record["agent_approved"] = agent_decision.approved
            record["agent_confidence"] = agent_decision.confidence
            record["agent_reason"] = agent_decision.reason
            record["agent_size_multiplier"] = agent_decision.position_size_multiplier

        self.total_executions_logged += 1
        execution_id = None

        pool = await self._get_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    execution_id = await conn.fetchval("""
                        INSERT INTO executions (
                            decision_run_id, symbol, asset_class, direction, tier,
                            strategy, intended_price, fill_price, slippage_pct,
                            quantity, position_size_usd, stop_loss, take_profit,
                            entry_rsi, entry_regime, entry_regime_quality,
                            entry_momentum, entry_volume_ratio, entry_atr_pct,
                            entry_score, agent_approved, agent_confidence,
                            agent_reason, agent_size_multiplier
                        ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                            $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
                        ) RETURNING id
                    """,
                        decision_run_id, snapshot.symbol, snapshot.asset_class,
                        snapshot.direction, snapshot.tier, strategy,
                        snapshot.price, fill_price, slippage,
                        quantity, position_size_usd,
                        snapshot.stop_loss, snapshot.take_profit,
                        snapshot.rsi, snapshot.regime, snapshot.regime_quality,
                        snapshot.momentum, snapshot.volume_ratio, snapshot.atr_pct,
                        snapshot.score,
                        agent_decision.approved if agent_decision else None,
                        agent_decision.confidence if agent_decision else None,
                        agent_decision.reason if agent_decision else None,
                        agent_decision.position_size_multiplier if agent_decision else None,
                    )
            except Exception as e:
                logger.error(f"DB execution log error: {e}")

        record["execution_id"] = execution_id
        self._append_jsonl(EXECUTIONS_FILE, record)

        return execution_id

    # ========================================
    # OUTCOMES + REWARD
    # ========================================

    async def log_outcome(
        self,
        outcome: TradeOutcome,
        execution_id: Optional[int] = None,
        decision_run_id: Optional[int] = None,
        max_drawdown_pct: float = 0.0,
        max_favorable_pct: float = 0.0,
        exit_regime: str = "",
        regime_changed: bool = False,
        rule_breaches: Optional[List[str]] = None,
        pattern_type: str = "",
        actionable_lesson: str = "",
        lesson_confidence: float = 0.0,
        trades_today: int = 0,
    ) -> Optional[RewardComponents]:
        """
        Log a trade outcome and calculate reward.
        Returns the calculated RewardComponents.
        """
        rule_breaches = rule_breaches or []

        # Calculate reward
        reward = calculate_reward(
            pnl_pct=outcome.pnl_pct,
            r_multiple=outcome.r_multiple,
            max_drawdown_pct=max_drawdown_pct,
            hold_duration_minutes=outcome.hold_duration_minutes,
            trades_today=trades_today,
            rule_breaches=rule_breaches,
            agent_confidence=outcome.agent_confidence or 0.5,
        )

        self.total_outcomes_logged += 1
        self.total_rewards_calculated += 1

        outcome_record = {
            "timestamp": datetime.now().isoformat(),
            "execution_id": execution_id,
            "symbol": outcome.symbol,
            "asset_class": outcome.asset_class,
            "exit_price": outcome.exit_price,
            "exit_reason": outcome.exit_reason,
            "pnl_usd": outcome.pnl,
            "pnl_pct": outcome.pnl_pct,
            "r_multiple": outcome.r_multiple,
            "hold_duration_minutes": outcome.hold_duration_minutes,
            "max_drawdown_pct": max_drawdown_pct,
            "max_favorable_pct": max_favorable_pct,
            "exit_regime": exit_regime,
            "regime_changed": regime_changed,
            "rule_breaches": rule_breaches,
            "pattern_type": pattern_type,
            "actionable_lesson": actionable_lesson,
            "lesson_confidence": lesson_confidence,
            "reward": reward.to_dict(),
        }

        pool = await self._get_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    outcome_id = await conn.fetchval("""
                        INSERT INTO outcomes (
                            execution_id, symbol, asset_class, exit_price, exit_reason,
                            pnl_usd, pnl_pct, r_multiple, hold_duration_minutes,
                            max_drawdown_pct, max_favorable_pct, exit_regime,
                            regime_changed, rule_breaches, pattern_type,
                            actionable_lesson, lesson_confidence
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17)
                        RETURNING id
                    """,
                        execution_id, outcome.symbol, outcome.asset_class,
                        outcome.exit_price, outcome.exit_reason,
                        outcome.pnl, outcome.pnl_pct, outcome.r_multiple,
                        outcome.hold_duration_minutes,
                        max_drawdown_pct, max_favorable_pct,
                        exit_regime, regime_changed,
                        json.dumps(rule_breaches), pattern_type,
                        actionable_lesson, lesson_confidence,
                    )

                    # Write reward
                    await conn.execute("""
                        INSERT INTO rewards (
                            outcome_id, execution_id, decision_run_id,
                            symbol, asset_class,
                            realized_return_score, risk_adjusted_score,
                            drawdown_penalty, turnover_penalty,
                            research_quality_score, compliance_penalty,
                            weights, reward_score,
                            regime_at_entry, regime_at_exit
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
                    """,
                        outcome_id, execution_id, decision_run_id,
                        outcome.symbol, outcome.asset_class,
                        reward.realized_return_score, reward.risk_adjusted_score,
                        reward.drawdown_penalty, reward.turnover_penalty,
                        reward.research_quality_score, reward.compliance_penalty,
                        json.dumps(reward.weights), reward.reward_score,
                        outcome.entry_regime, exit_regime,
                    )
            except Exception as e:
                logger.error(f"DB outcome/reward log error: {e}")

        # JSONL fallback
        self._append_jsonl(OUTCOMES_FILE, outcome_record)
        self._append_jsonl(REWARDS_FILE, {
            "timestamp": datetime.now().isoformat(),
            "symbol": outcome.symbol,
            "asset_class": outcome.asset_class,
            **reward.to_dict(),
        })

        logger.info(
            f"[Reward] {outcome.symbol}: score={reward.reward_score:+.3f} "
            f"(return={reward.realized_return_score:.2f}, risk_adj={reward.risk_adjusted_score:.2f}, "
            f"dd_pen={reward.drawdown_penalty:.2f})"
        )

        return reward

    # ========================================
    # QUERY METHODS (for supervisor bandit)
    # ========================================

    async def get_recent_rewards(
        self,
        asset_class: str = "",
        regime: str = "",
        limit: int = 50,
    ) -> List[Dict]:
        """Get recent rewards for supervisor bandit training."""
        pool = await self._get_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    where = "WHERE 1=1"
                    params = []
                    idx = 1
                    if asset_class:
                        where += f" AND r.asset_class = ${idx}"
                        params.append(asset_class)
                        idx += 1
                    if regime:
                        where += f" AND r.regime_at_entry = ${idx}"
                        params.append(regime)
                        idx += 1
                    params.append(limit)

                    rows = await conn.fetch(f"""
                        SELECT r.*, o.pnl_pct, o.exit_reason, o.pattern_type,
                               d.approved, d.confidence, d.source
                        FROM rewards r
                        LEFT JOIN outcomes o ON r.outcome_id = o.id
                        LEFT JOIN decision_runs d ON r.decision_run_id = d.id
                        {where}
                        ORDER BY r.timestamp DESC
                        LIMIT ${idx}
                    """, *params)
                    return [dict(r) for r in rows]
            except Exception as e:
                logger.error(f"DB query error: {e}")

        # Fallback: read from JSONL
        return self._read_recent_jsonl(REWARDS_FILE, limit)

    def _append_jsonl(self, filepath: str, record: Dict):
        """Append record to JSONL file."""
        try:
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'a') as f:
                f.write(json.dumps(record, default=str) + "\n")
        except Exception as e:
            logger.error(f"JSONL write error ({filepath}): {e}")

    def _read_recent_jsonl(self, filepath: str, limit: int = 50) -> List[Dict]:
        """Read recent entries from JSONL file."""
        try:
            if not os.path.exists(filepath):
                return []
            with open(filepath, 'r') as f:
                lines = f.readlines()
            results = []
            for line in lines[-limit:]:
                try:
                    results.append(json.loads(line.strip()))
                except json.JSONDecodeError:
                    continue
            return results
        except Exception:
            return []

    def get_stats(self) -> Dict:
        return {
            "db_available": self._db_available,
            "total_decisions_logged": self.total_decisions_logged,
            "total_executions_logged": self.total_executions_logged,
            "total_outcomes_logged": self.total_outcomes_logged,
            "total_rewards_calculated": self.total_rewards_calculated,
        }


# Singleton
outcome_store = OutcomeStore()
