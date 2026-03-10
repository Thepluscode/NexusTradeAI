"""
Reward Calculator
=================

Computes a blended reward score from trade outcomes.
The reward is NOT based on LLM judgment — it's derived from execution reality.

Reward = weighted blend of:
    - Realized return (30%) — normalized P&L
    - Risk-adjusted return (25%) — return / max drawdown
    - Drawdown penalty (15%) — penalty for large intra-trade drawdowns
    - Turnover penalty (10%) — penalty for excessive trading (anti-churning)
    - Research quality score (10%) — LLM judge on reasoning quality (capped)
    - Compliance penalty (10%) — penalty for rule breaches

Output: reward_score in [-1.0, 1.0]
"""

import logging
from typing import Dict, Optional, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS = {
    "return": 0.30,
    "risk_adj": 0.25,
    "drawdown": 0.15,
    "turnover": 0.10,
    "research": 0.10,
    "compliance": 0.10,
}


@dataclass
class RewardComponents:
    realized_return_score: float = 0.0
    risk_adjusted_score: float = 0.0
    drawdown_penalty: float = 0.0
    turnover_penalty: float = 0.0
    research_quality_score: float = 0.0
    compliance_penalty: float = 0.0
    reward_score: float = 0.0
    weights: Dict = None

    def __post_init__(self):
        if self.weights is None:
            self.weights = DEFAULT_WEIGHTS.copy()

    def to_dict(self) -> Dict:
        return {
            "realized_return_score": round(self.realized_return_score, 4),
            "risk_adjusted_score": round(self.risk_adjusted_score, 4),
            "drawdown_penalty": round(self.drawdown_penalty, 4),
            "turnover_penalty": round(self.turnover_penalty, 4),
            "research_quality_score": round(self.research_quality_score, 4),
            "compliance_penalty": round(self.compliance_penalty, 4),
            "reward_score": round(self.reward_score, 4),
            "weights": self.weights,
        }


def calculate_reward(
    pnl_pct: float,
    r_multiple: float,
    max_drawdown_pct: float = 0.0,
    hold_duration_minutes: float = 0.0,
    trades_today: int = 0,
    max_trades_per_day: int = 15,
    rule_breaches: Optional[List[str]] = None,
    agent_confidence: float = 0.5,
    agent_reason_quality: float = 0.5,  # LLM judge score (0-1), capped influence
    weights: Optional[Dict] = None,
) -> RewardComponents:
    """
    Calculate blended reward from trade outcome.

    Args:
        pnl_pct: Realized P&L percentage (-100 to +inf)
        r_multiple: Actual risk-reward ratio achieved
        max_drawdown_pct: Worst intra-trade drawdown (0 = no drawdown)
        hold_duration_minutes: How long position was held
        trades_today: Number of trades executed today
        max_trades_per_day: Anti-churning limit
        rule_breaches: List of compliance violations
        agent_confidence: Decision agent's confidence at entry
        agent_reason_quality: LLM judge score on reasoning quality
        weights: Custom weight overrides

    Returns:
        RewardComponents with all scores and final blended reward
    """
    w = weights or DEFAULT_WEIGHTS.copy()
    rule_breaches = rule_breaches or []

    reward = RewardComponents(weights=w)

    # 1. REALIZED RETURN SCORE (0 to 1)
    # Normalize: -5% = 0.0, 0% = 0.5, +5% = 1.0, >10% capped at 1.0
    reward.realized_return_score = _normalize(pnl_pct, low=-5.0, high=5.0)

    # 2. RISK-ADJUSTED RETURN (0 to 1)
    # R-multiple: <0 = bad, 1.0 = break-even risk, 2.0 = ideal, >3 capped
    reward.risk_adjusted_score = _normalize(r_multiple, low=-2.0, high=3.0)

    # 3. DRAWDOWN PENALTY (0 to 1, where 1 = no drawdown)
    # 0% drawdown = 1.0 (no penalty), 10%+ drawdown = 0.0 (max penalty)
    dd = abs(max_drawdown_pct)
    reward.drawdown_penalty = max(0.0, min(1.0, 1.0 - (dd / 10.0)))

    # 4. TURNOVER PENALTY (0 to 1, where 1 = low turnover)
    # Trading at <50% of daily limit = 1.0, at 100% = 0.3, over limit = 0.0
    turnover_ratio = trades_today / max(1, max_trades_per_day)
    if turnover_ratio <= 0.5:
        reward.turnover_penalty = 1.0
    elif turnover_ratio <= 1.0:
        reward.turnover_penalty = max(0.3, 1.0 - (turnover_ratio - 0.5) * 1.4)
    else:
        reward.turnover_penalty = 0.0

    # 5. RESEARCH QUALITY SCORE (0 to 1)
    # Capped at 0.1 weight — LLM judge should not dominate the reward
    # Based on: did the confidence match the outcome? Was reasoning grounded?
    confidence_accuracy = 1.0 - abs(
        agent_confidence - (1.0 if pnl_pct > 0 else 0.0)
    )
    reward.research_quality_score = 0.5 * confidence_accuracy + 0.5 * agent_reason_quality

    # 6. COMPLIANCE PENALTY (0 to 1, where 1 = fully compliant)
    breach_count = len(rule_breaches)
    if breach_count == 0:
        reward.compliance_penalty = 1.0
    elif breach_count <= 2:
        reward.compliance_penalty = 0.5
    else:
        reward.compliance_penalty = 0.0

    # FINAL BLENDED REWARD
    raw = (
        w["return"] * reward.realized_return_score
        + w["risk_adj"] * reward.risk_adjusted_score
        + w["drawdown"] * reward.drawdown_penalty
        + w["turnover"] * reward.turnover_penalty
        + w["research"] * reward.research_quality_score
        + w["compliance"] * reward.compliance_penalty
    )

    # Scale from [0, 1] to [-1, 1] for RL compatibility
    reward.reward_score = max(-1.0, min(1.0, (raw - 0.5) * 2.0))

    return reward


def _normalize(value: float, low: float, high: float) -> float:
    """Normalize value to [0, 1] range given low/high bounds."""
    if high == low:
        return 0.5
    return max(0.0, min(1.0, (value - low) / (high - low)))
