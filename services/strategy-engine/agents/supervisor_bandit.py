"""
Supervisor Bandit
=================

Contextual bandit using Thompson Sampling for strategy arm selection.

Context:  regime × asset_class × tier
Arms:     conservative, moderate, aggressive, skip
Reward:   from rewards table (blended score mapped to [0, 1])

Each (context, arm) pair maintains a Beta(alpha, beta) distribution.
Thompson Sampling: draw from each arm's Beta, pick the highest draw.

Persistence: PostgreSQL (supervisor_state table) + JSONL fallback.
"""

import os
import json
import math
import random
import logging
from datetime import datetime
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
BANDIT_STATE_FILE = os.path.join(MEMORY_DIR, "supervisor_bandit.json")

# ========================================
# ARMS — each arm is a strategy profile
# ========================================

ARM_PROFILES = {
    "conservative": {
        "position_size_cap": 0.75,
        "conviction_floor": 0.55,
        "description": "Smaller positions, higher conviction required",
    },
    "moderate": {
        "position_size_cap": 1.0,
        "conviction_floor": 0.40,
        "description": "Default balanced strategy",
    },
    "aggressive": {
        "position_size_cap": 1.5,
        "conviction_floor": 0.30,
        "description": "Larger positions, lower conviction threshold",
    },
    "skip": {
        "position_size_cap": 0.0,
        "conviction_floor": 1.0,
        "description": "Do not trade in this context",
    },
}

ARM_NAMES = list(ARM_PROFILES.keys())

# Prior: Beta(1, 1) = uniform. Slightly favor moderate at start.
DEFAULT_ARM_STATS = {
    "conservative": {"alpha": 1.0, "beta": 1.0, "pulls": 0, "total_reward": 0.0},
    "moderate": {"alpha": 2.0, "beta": 1.0, "pulls": 0, "total_reward": 0.0},
    "aggressive": {"alpha": 1.0, "beta": 1.0, "pulls": 0, "total_reward": 0.0},
    "skip": {"alpha": 1.0, "beta": 2.0, "pulls": 0, "total_reward": 0.0},
}


@dataclass
class BanditRecommendation:
    """What the supervisor recommends for a given context."""
    context_key: str
    selected_arm: str
    position_size_cap: float
    conviction_floor: float
    exploration: bool  # True if this was an exploratory pick
    arm_scores: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return asdict(self)


def _make_context_key(regime: str, asset_class: str, tier: str) -> str:
    """Build context key: regime:asset_class:tier"""
    r = (regime or "unknown").lower().replace(" ", "_")
    a = (asset_class or "unknown").lower()
    t = (tier or "tier1").lower()
    return f"{r}:{a}:{t}"


class SupervisorBandit:
    """
    Thompson Sampling contextual bandit.

    For each context key (regime:asset_class:tier), maintains a
    Beta distribution per arm. Selects the arm with the highest
    Thompson sample.

    State is persisted to both PostgreSQL and local JSON.
    """

    def __init__(self):
        # In-memory state: context_key → {arm_name → {alpha, beta, pulls, total_reward}}
        self._state: Dict[str, Dict[str, Dict]] = {}
        self._total_pulls = 0
        self._total_updates = 0
        self._load_state()
        logger.info(f"Supervisor bandit initialized | contexts: {len(self._state)}")

    # ========================================
    # SELECTION
    # ========================================

    def select_arm(
        self,
        regime: str,
        asset_class: str,
        tier: str,
    ) -> BanditRecommendation:
        """
        Select the best arm for this context using Thompson Sampling.
        Returns a BanditRecommendation with the selected strategy profile.
        """
        ctx = _make_context_key(regime, asset_class, tier)
        arms = self._get_arms(ctx)

        # Thompson sample: draw from Beta(alpha, beta) for each arm
        samples = {}
        for arm_name, stats in arms.items():
            a = max(stats["alpha"], 0.01)
            b = max(stats["beta"], 0.01)
            try:
                samples[arm_name] = random.betavariate(a, b)
            except ValueError:
                samples[arm_name] = 0.5

        # Select highest sample
        selected = max(samples, key=samples.get)
        profile = ARM_PROFILES[selected]

        # Detect exploration: if the selected arm isn't the one with the
        # highest mean (alpha / (alpha+beta)), it's exploratory
        means = {
            name: stats["alpha"] / max(stats["alpha"] + stats["beta"], 0.01)
            for name, stats in arms.items()
        }
        best_mean_arm = max(means, key=means.get)
        is_exploration = selected != best_mean_arm

        self._total_pulls += 1

        rec = BanditRecommendation(
            context_key=ctx,
            selected_arm=selected,
            position_size_cap=profile["position_size_cap"],
            conviction_floor=profile["conviction_floor"],
            exploration=is_exploration,
            arm_scores=samples,
        )

        logger.info(
            f"[Bandit] {ctx} → {selected} "
            f"(scores: {', '.join(f'{k}={v:.3f}' for k, v in samples.items())}) "
            f"{'[explore]' if is_exploration else '[exploit]'}"
        )

        return rec

    # ========================================
    # UPDATE
    # ========================================

    def update(
        self,
        regime: str,
        asset_class: str,
        tier: str,
        arm: str,
        reward_score: float,
    ):
        """
        Update arm stats with observed reward.

        reward_score: from rewards table, in [-1.0, 1.0].
        Mapped to [0, 1] for Beta distribution update:
            success probability = (reward_score + 1) / 2
        """
        if arm not in ARM_NAMES:
            logger.warning(f"Unknown arm '{arm}', skipping update")
            return

        ctx = _make_context_key(regime, asset_class, tier)
        arms = self._get_arms(ctx)

        # Map reward [-1, 1] → probability [0, 1]
        p_success = max(0.0, min(1.0, (reward_score + 1.0) / 2.0))

        # Bernoulli update: treat p_success as a soft success/failure
        # This is the continuous relaxation of Beta-Bernoulli:
        #   alpha += p_success, beta += (1 - p_success)
        arms[arm]["alpha"] += p_success
        arms[arm]["beta"] += (1.0 - p_success)
        arms[arm]["pulls"] += 1
        arms[arm]["total_reward"] += reward_score

        self._state[ctx] = arms
        self._total_updates += 1

        logger.info(
            f"[Bandit] UPDATE {ctx}:{arm} reward={reward_score:+.3f} "
            f"→ alpha={arms[arm]['alpha']:.1f} beta={arms[arm]['beta']:.1f}"
        )

        # Persist every 5 updates
        if self._total_updates % 5 == 0:
            self._save_state()

    def batch_update_from_rewards(self, rewards: List[Dict]):
        """
        Bulk update from a list of reward records.
        Each record should have: regime_at_entry, asset_class, tier (from decision_runs),
        reward_score, and source (arm that was used).
        """
        updated = 0
        for r in rewards:
            regime = r.get("regime_at_entry") or r.get("regime") or "unknown"
            asset_class = r.get("asset_class", "stock")
            # Try to get tier from decision run, fallback to "tier1"
            tier = r.get("tier", "tier1")
            arm = r.get("selected_arm") or r.get("source") or "moderate"
            reward_score = r.get("reward_score", 0.0)

            if isinstance(reward_score, (int, float)) and math.isfinite(reward_score):
                # Map arm sources to bandit arms
                arm_mapped = self._map_source_to_arm(arm)
                self.update(regime, asset_class, tier, arm_mapped, reward_score)
                updated += 1

        if updated > 0:
            self._save_state()
            logger.info(f"[Bandit] Batch updated {updated} rewards")

        return updated

    # ========================================
    # STATE MANAGEMENT
    # ========================================

    def _get_arms(self, ctx: str) -> Dict[str, Dict]:
        """Get or initialize arm stats for a context."""
        if ctx not in self._state:
            self._state[ctx] = json.loads(json.dumps(DEFAULT_ARM_STATS))
        return self._state[ctx]

    def _map_source_to_arm(self, source: str) -> str:
        """Map a decision source to the closest bandit arm."""
        source = (source or "moderate").lower()
        if source in ARM_NAMES:
            return source
        # Heuristic mapping from decision agent sources
        if source in ("pass-through", "rule_based_fallback"):
            return "moderate"
        if source in ("killed", "kill_switch"):
            return "skip"
        if source == "cache":
            return "moderate"
        return "moderate"

    def _load_state(self):
        """Load state from JSON file."""
        try:
            if os.path.exists(BANDIT_STATE_FILE):
                with open(BANDIT_STATE_FILE, 'r') as f:
                    data = json.load(f)
                self._state = data.get("contexts", {})
                self._total_pulls = data.get("total_pulls", 0)
                self._total_updates = data.get("total_updates", 0)
                logger.info(f"Loaded bandit state: {len(self._state)} contexts")
        except Exception as e:
            logger.error(f"Failed to load bandit state: {e}")
            self._state = {}

    def _save_state(self):
        """Save state to JSON file."""
        try:
            os.makedirs(MEMORY_DIR, exist_ok=True)
            data = {
                "contexts": self._state,
                "total_pulls": self._total_pulls,
                "total_updates": self._total_updates,
                "last_saved": datetime.now().isoformat(),
            }
            with open(BANDIT_STATE_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save bandit state: {e}")

    async def sync_to_db(self):
        """Persist state to PostgreSQL supervisor_state table."""
        from agents.outcome_store import outcome_store
        pool = await outcome_store._get_pool()
        if not pool:
            return

        try:
            async with pool.acquire() as conn:
                for ctx, arms in self._state.items():
                    total = sum(a["pulls"] for a in arms.values())
                    await conn.execute("""
                        INSERT INTO supervisor_state (context_key, arm_stats, total_pulls, last_updated)
                        VALUES ($1, $2::jsonb, $3, NOW())
                        ON CONFLICT (context_key) DO UPDATE SET
                            arm_stats = $2::jsonb,
                            total_pulls = $3,
                            last_updated = NOW()
                    """, ctx, json.dumps(arms), total)
            logger.info(f"Synced {len(self._state)} contexts to DB")
        except Exception as e:
            logger.error(f"DB sync error: {e}")

    async def load_from_db(self):
        """Load state from PostgreSQL (overrides local)."""
        from agents.outcome_store import outcome_store
        pool = await outcome_store._get_pool()
        if not pool:
            return

        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT context_key, arm_stats, total_pulls FROM supervisor_state")
                for row in rows:
                    ctx = row["context_key"]
                    arms = json.loads(row["arm_stats"]) if isinstance(row["arm_stats"], str) else row["arm_stats"]
                    self._state[ctx] = arms
                    self._total_pulls += row["total_pulls"] or 0
            if rows:
                logger.info(f"Loaded {len(rows)} contexts from DB")
                self._save_state()  # Update local copy
        except Exception as e:
            logger.error(f"DB load error: {e}")

    # ========================================
    # STATS
    # ========================================

    def get_stats(self) -> Dict:
        """Return supervisor bandit statistics."""
        context_summaries = {}
        for ctx, arms in self._state.items():
            best_arm = max(
                arms.items(),
                key=lambda x: x[1]["alpha"] / max(x[1]["alpha"] + x[1]["beta"], 0.01),
            )
            context_summaries[ctx] = {
                "best_arm": best_arm[0],
                "best_arm_mean": round(
                    best_arm[1]["alpha"] / max(best_arm[1]["alpha"] + best_arm[1]["beta"], 0.01), 3
                ),
                "total_pulls": sum(a["pulls"] for a in arms.values()),
            }

        return {
            "total_contexts": len(self._state),
            "total_pulls": self._total_pulls,
            "total_updates": self._total_updates,
            "arms": ARM_NAMES,
            "contexts": context_summaries,
        }

    def get_context_detail(self, regime: str, asset_class: str, tier: str) -> Dict:
        """Detailed view of one context's arm distributions."""
        ctx = _make_context_key(regime, asset_class, tier)
        arms = self._get_arms(ctx)

        detail = {}
        for arm_name, stats in arms.items():
            a, b = stats["alpha"], stats["beta"]
            mean = a / max(a + b, 0.01)
            # 95% credible interval using Beta quantiles (approximation)
            std = math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1))) if (a + b) > 0 else 0
            detail[arm_name] = {
                "alpha": round(a, 2),
                "beta": round(b, 2),
                "mean": round(mean, 4),
                "std": round(std, 4),
                "pulls": stats["pulls"],
                "avg_reward": round(stats["total_reward"] / max(stats["pulls"], 1), 4),
                "profile": ARM_PROFILES[arm_name],
            }

        return {
            "context_key": ctx,
            "arms": detail,
            "recommended": max(detail, key=lambda k: detail[k]["mean"]),
        }


# Singleton
supervisor = SupervisorBandit()
