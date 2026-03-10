"""
Analyst Rankings
================

Tracks each agent's decision accuracy per regime and asset class.
A decision is "correct" if:
  - Approved trade → positive P&L (agent correctly identified opportunity)
  - Rejected trade → would have lost (agent correctly avoided loss)

Since we can't know counterfactual outcomes for rejected trades,
we score only approved trades and use reward_score as a proxy for
overall agent quality.

Rankings are computed from the joined decision_runs + outcomes + rewards
tables and upserted into analyst_rankings.

The supervisor bandit can use these rankings to weight agent opinions.
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
RANKINGS_FILE = os.path.join(MEMORY_DIR, "analyst_rankings.json")


class AnalystRankings:
    """
    Computes and stores per-agent accuracy by regime and asset class.

    Rankings are updated periodically (via /agent/rankings/update endpoint)
    and stored in both PostgreSQL and local JSON.
    """

    def __init__(self):
        # In-memory: analyst_name → {asset_class:regime → stats}
        self._rankings: Dict[str, Dict[str, Dict]] = {}
        self._last_updated: Optional[str] = None
        self._load_local()

    async def update_rankings(self, lookback_days: int = 30) -> Dict:
        """
        Recompute rankings from decision_runs + outcomes + rewards.
        Returns summary of updated rankings.
        """
        from agents.outcome_store import outcome_store
        pool = await outcome_store._get_pool()

        if not pool:
            return {"error": "No database available", "rankings_updated": 0}

        try:
            async with pool.acquire() as conn:
                # Query: for each agent source × regime × asset_class,
                # compute accuracy and average reward from approved trades
                rows = await conn.fetch("""
                    SELECT
                        d.source AS analyst_name,
                        d.asset_class,
                        COALESCE(d.regime, 'unknown') AS regime,
                        COUNT(*) AS total_decisions,
                        COUNT(CASE WHEN d.approved AND o.pnl_pct > 0 THEN 1 END) AS correct_approved,
                        COUNT(CASE WHEN d.approved THEN 1 END) AS total_approved,
                        COUNT(CASE WHEN d.approved AND o.pnl_pct IS NOT NULL THEN 1 END) AS approved_with_outcome,
                        COALESCE(AVG(CASE WHEN r.reward_score IS NOT NULL THEN r.reward_score END), 0) AS avg_reward,
                        MIN(d.timestamp) AS period_start,
                        MAX(d.timestamp) AS period_end
                    FROM decision_runs d
                    LEFT JOIN outcomes o ON o.execution_id IN (
                        SELECT e.id FROM executions e WHERE e.decision_run_id = d.id
                    )
                    LEFT JOIN rewards r ON r.decision_run_id = d.id
                    WHERE d.timestamp > NOW() - INTERVAL '%s days'
                    GROUP BY d.source, d.asset_class, d.regime
                    HAVING COUNT(*) >= 1
                    ORDER BY avg_reward DESC
                """ % lookback_days)

                updated = 0
                self._rankings = {}

                for row in rows:
                    analyst = row["analyst_name"] or "pipeline"
                    asset_class = row["asset_class"]
                    regime = row["regime"]
                    total = row["total_decisions"]
                    correct = row["correct_approved"]
                    approved_with_outcome = row["approved_with_outcome"]

                    # Accuracy: correct approved / approved with known outcome
                    accuracy = correct / max(approved_with_outcome, 1)
                    avg_reward = float(row["avg_reward"])

                    # Upsert to analyst_rankings table
                    await conn.execute("""
                        INSERT INTO analyst_rankings
                            (analyst_name, asset_class, regime, total_decisions,
                             correct_decisions, accuracy, avg_reward,
                             period_start, period_end, last_updated)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                        ON CONFLICT (analyst_name, asset_class, regime) DO UPDATE SET
                            total_decisions = $4,
                            correct_decisions = $5,
                            accuracy = $6,
                            avg_reward = $7,
                            period_start = $8,
                            period_end = $9,
                            last_updated = NOW()
                    """,
                        analyst, asset_class, regime,
                        total, correct, accuracy, avg_reward,
                        row["period_start"], row["period_end"],
                    )

                    # Store in memory
                    key = f"{asset_class}:{regime}"
                    if analyst not in self._rankings:
                        self._rankings[analyst] = {}
                    self._rankings[analyst][key] = {
                        "total_decisions": total,
                        "correct_decisions": correct,
                        "accuracy": round(accuracy, 4),
                        "avg_reward": round(avg_reward, 4),
                        "total_approved": row["total_approved"],
                    }
                    updated += 1

                self._last_updated = datetime.now().isoformat()
                self._save_local()

                logger.info(f"[Rankings] Updated {updated} analyst×regime combinations")
                return {"rankings_updated": updated, "analysts": list(self._rankings.keys())}

        except Exception as e:
            logger.error(f"[Rankings] Update error: {e}")
            return {"error": str(e), "rankings_updated": 0}

    async def get_recent_decisions(self, limit: int = 50) -> List[Dict]:
        """Get recent agent decisions with outcomes for the dashboard."""
        from agents.outcome_store import outcome_store
        pool = await outcome_store._get_pool()

        if not pool:
            return []

        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch("""
                    SELECT
                        d.timestamp,
                        d.symbol,
                        d.asset_class,
                        d.direction,
                        d.tier,
                        d.regime,
                        d.approved,
                        d.confidence,
                        d.reason,
                        d.risk_flags,
                        d.source,
                        d.position_size_multiplier,
                        d.latency_ms,
                        r.reward_score,
                        o.pnl_pct,
                        o.exit_reason
                    FROM decision_runs d
                    LEFT JOIN rewards r ON r.decision_run_id = d.id
                    LEFT JOIN executions e ON e.decision_run_id = d.id
                    LEFT JOIN outcomes o ON o.execution_id = e.id
                    ORDER BY d.timestamp DESC
                    LIMIT $1
                """, limit)
                return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"[Rankings] Decision query error: {e}")
            return []

    def get_agent_score(self, analyst: str, asset_class: str, regime: str) -> float:
        """
        Get an agent's reliability score for a given context.
        Returns 0.5 (neutral) if no data available.
        Used by the orchestrator to weight agent opinions.
        """
        key = f"{asset_class}:{regime}"
        stats = self._rankings.get(analyst, {}).get(key)
        if not stats or stats["total_decisions"] < 3:
            return 0.5  # Not enough data
        # Blend accuracy (60%) and reward (40%)
        # Accuracy is 0-1, avg_reward is -1 to 1 (map to 0-1)
        reward_normalized = (stats["avg_reward"] + 1.0) / 2.0
        return 0.6 * stats["accuracy"] + 0.4 * reward_normalized

    def get_stats(self) -> Dict:
        """Return rankings summary."""
        analysts = {}
        for name, contexts in self._rankings.items():
            total_decisions = sum(c["total_decisions"] for c in contexts.values())
            total_correct = sum(c["correct_decisions"] for c in contexts.values())
            avg_accuracy = total_correct / max(total_decisions, 1)
            avg_reward = sum(c["avg_reward"] * c["total_decisions"] for c in contexts.values()) / max(total_decisions, 1)
            analysts[name] = {
                "contexts": len(contexts),
                "total_decisions": total_decisions,
                "accuracy": round(avg_accuracy, 4),
                "avg_reward": round(avg_reward, 4),
            }

        return {
            "last_updated": self._last_updated,
            "analysts": analysts,
            "total_contexts": sum(len(c) for c in self._rankings.values()),
        }

    def _load_local(self):
        try:
            if os.path.exists(RANKINGS_FILE):
                with open(RANKINGS_FILE, 'r') as f:
                    data = json.load(f)
                self._rankings = data.get("rankings", {})
                self._last_updated = data.get("last_updated")
        except Exception as e:
            logger.error(f"Failed to load rankings: {e}")

    def _save_local(self):
        try:
            os.makedirs(MEMORY_DIR, exist_ok=True)
            with open(RANKINGS_FILE, 'w') as f:
                json.dump({
                    "rankings": self._rankings,
                    "last_updated": self._last_updated,
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save rankings: {e}")


# Singleton
analyst_rankings = AnalystRankings()
