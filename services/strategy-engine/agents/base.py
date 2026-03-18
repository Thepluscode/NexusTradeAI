"""
Base types for the agentic trading system.
All data flows through these structures.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional, List, Dict, Any
import json
import hashlib


@dataclass
class MarketSnapshot:
    """Point-in-time market context for agent decisions."""
    symbol: str
    asset_class: str  # stock, forex, crypto
    price: float
    direction: str  # long, short
    tier: str  # tier1, tier2, tier3
    # Indicators
    rsi: Optional[float] = None
    momentum: Optional[float] = None
    percent_change: Optional[float] = None
    volume_ratio: Optional[float] = None
    trend_strength: Optional[float] = None
    atr_pct: Optional[float] = None
    vwap: Optional[float] = None
    h1_trend: Optional[str] = None
    session: Optional[str] = None
    regime: Optional[str] = None
    regime_quality: Optional[float] = None
    macd_histogram: Optional[float] = None
    score: Optional[float] = None
    # Stop / target
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    # Bridge context
    bridge_direction: Optional[str] = None
    bridge_confidence: Optional[float] = None

    def to_dict(self) -> Dict:
        return {k: v for k, v in asdict(self).items() if v is not None}

    def cache_key(self) -> str:
        return f"{self.symbol}:{self.direction}:{self.tier}:{self.asset_class}"


@dataclass
class AgentDecision:
    """Final decision from the agent pipeline."""
    approved: bool
    confidence: float  # 0.0 - 1.0
    reason: str
    risk_flags: List[str] = field(default_factory=list)
    position_size_multiplier: float = 1.0  # 0.25x - 1.5x adjustment
    adjusted_stop: Optional[float] = None  # tighter stop suggestion
    source: str = "pipeline"  # pipeline, cache, pass-through, killed
    agents_consulted: List[str] = field(default_factory=list)
    market_regime: Optional[str] = None
    lessons_applied: List[str] = field(default_factory=list)
    decision_run_id: Optional[int] = None  # DB ID for linking outcomes back

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class AgentAuditEntry:
    """Immutable audit log entry for every agent decision."""
    timestamp: str
    symbol: str
    direction: str
    asset_class: str
    tier: str
    decision: str  # approved, rejected, killed
    confidence: float
    reason: str
    risk_flags: List[str]
    source: str
    agents_consulted: List[str]
    position_size_multiplier: float
    market_regime: Optional[str] = None
    lessons_applied: List[str] = field(default_factory=list)
    latency_ms: float = 0.0

    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class TradeOutcome:
    """Completed trade record for learning agent."""
    symbol: str
    asset_class: str
    direction: str
    tier: str
    entry_price: float
    exit_price: float
    pnl: float
    pnl_pct: float
    r_multiple: float  # actual gain / risk (stop distance)
    hold_duration_minutes: float
    exit_reason: str  # stop_loss, take_profit, trailing_stop, manual
    # Context at entry
    entry_rsi: Optional[float] = None
    entry_regime: Optional[str] = None
    entry_regime_quality: Optional[float] = None
    entry_momentum: Optional[float] = None
    entry_volume_ratio: Optional[float] = None
    entry_atr_pct: Optional[float] = None
    entry_score: Optional[float] = None
    # Agent decision at entry
    agent_approved: Optional[bool] = None
    agent_confidence: Optional[float] = None
    agent_reason: Optional[str] = None
    decision_run_id: Optional[int] = None  # Links outcome back to the decision that approved it
    bandit_arm: Optional[str] = None  # Supervisor bandit arm used (for reward attribution)
    timestamp: str = ""

    def to_dict(self) -> Dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class TrackedPattern:
    """A learned pattern from real trade data."""
    pattern_id: str
    pattern_type: str  # regime_mismatch, overbought_entry, low_volume_trap, trend_exhaustion, etc.
    description: str
    occurrences: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    avg_pnl: float = 0.0
    avg_r_multiple: float = 0.0
    symbols: List[str] = field(default_factory=list)
    confidence: float = 0.0  # statistical significance
    last_seen: str = ""
    actionable_lesson: str = ""  # one-liner for prompt injection

    @staticmethod
    def make_id(pattern_type: str, description: str) -> str:
        raw = f"{pattern_type}:{description}"
        return hashlib.sha256(raw.encode()).hexdigest()[:12]

    def to_dict(self) -> Dict:
        return asdict(self)

    def is_significant(self) -> bool:
        """Pattern has enough data to be statistically meaningful."""
        return self.occurrences >= 5 and self.confidence >= 0.6
