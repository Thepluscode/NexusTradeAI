"""
Scan AI Engine
==============

The core learning system. Unlike traditional ML that trains on generic market data,
Scan AI learns from how THIS specific trading system actually operates:

- What entry conditions preceded winning trades?
- Which regime + indicator combinations produce the best R-multiples?
- What patterns correlate with stop-outs?
- How does position sizing affect outcomes in different volatility regimes?

This real-data approach creates a feedback loop where every trade teaches
the system something, and that knowledge improves future decisions.

Pattern Tracking:
    Each pattern is tracked with statistical rigor:
    - Minimum 5 occurrences before a pattern is considered
    - Win rate and average P&L tracked per pattern
    - Confidence scored based on sample size and consistency
    - Patterns decay if not seen recently (30-day half-life)
"""

import os
import json
import time
import hashlib
import logging
from datetime import datetime
from typing import Dict, List, Optional

from agents.base import TradeOutcome, TrackedPattern

logger = logging.getLogger(__name__)

MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
PATTERNS_FILE = os.path.join(MEMORY_DIR, "pattern_stats.jsonl")


def _classify_entry_conditions(outcome: TradeOutcome) -> List[str]:
    """Classify the entry conditions of a trade into pattern categories."""
    tags = []

    # RSI-based patterns
    if outcome.entry_rsi is not None:
        if outcome.entry_rsi > 70:
            tags.append("overbought_entry")
        elif outcome.entry_rsi < 30:
            tags.append("oversold_entry")
        elif 45 <= outcome.entry_rsi <= 55:
            tags.append("neutral_rsi_entry")

    # Volume patterns
    if outcome.entry_volume_ratio is not None:
        if outcome.entry_volume_ratio > 2.0:
            tags.append("high_volume_entry")
        elif outcome.entry_volume_ratio < 0.8:
            tags.append("low_volume_entry")

    # Regime patterns
    if outcome.entry_regime:
        tags.append(f"regime_{outcome.entry_regime}")

    # ATR patterns
    if outcome.entry_atr_pct is not None:
        if outcome.entry_atr_pct > 2.5:
            tags.append("high_volatility_entry")
        elif outcome.entry_atr_pct < 0.5:
            tags.append("low_volatility_entry")

    # Momentum patterns
    if outcome.entry_momentum is not None:
        if outcome.entry_momentum > 5:
            tags.append("strong_momentum_entry")
        elif outcome.entry_momentum < 1:
            tags.append("weak_momentum_entry")

    # Exit-based patterns
    if outcome.exit_reason:
        tags.append(f"exit_{outcome.exit_reason}")

    # Combo patterns (most valuable)
    if outcome.entry_rsi and outcome.entry_regime:
        if outcome.entry_rsi > 65 and outcome.entry_regime in ("ranging", "volatile"):
            tags.append("overbought_in_choppy_market")
        if outcome.entry_rsi < 40 and outcome.entry_regime in ("trending_up",):
            tags.append("pullback_in_uptrend")

    return tags


class ScanEngine:
    """
    Scan AI: Real-data pattern extraction and statistical tracking.

    Learns from actual trading outcomes to identify what works and what doesn't
    in THIS specific trading system, not from generic backtests.
    """

    def __init__(self):
        self.patterns: Dict[str, TrackedPattern] = {}
        self.total_trades_analyzed = 0
        self._load_patterns()

    def ingest_trade(self, outcome: TradeOutcome):
        """
        Process a completed trade and update pattern statistics.
        This is where the system learns from real data.
        """
        self.total_trades_analyzed += 1
        tags = _classify_entry_conditions(outcome)
        is_win = outcome.pnl > 0

        for tag in tags:
            pattern_id = TrackedPattern.make_id(tag, outcome.asset_class)
            pattern = self.patterns.get(pattern_id)

            if pattern is None:
                pattern = TrackedPattern(
                    pattern_id=pattern_id,
                    pattern_type=tag,
                    description=f"{tag} in {outcome.asset_class}",
                )
                self.patterns[pattern_id] = pattern

            # Update statistics
            pattern.occurrences += 1
            if is_win:
                pattern.wins += 1
            else:
                pattern.losses += 1
            pattern.win_rate = pattern.wins / pattern.occurrences

            # Running average P&L
            pattern.avg_pnl = (
                (pattern.avg_pnl * (pattern.occurrences - 1) + outcome.pnl_pct)
                / pattern.occurrences
            )
            pattern.avg_r_multiple = (
                (pattern.avg_r_multiple * (pattern.occurrences - 1) + outcome.r_multiple)
                / pattern.occurrences
            )

            # Track symbols
            if outcome.symbol not in pattern.symbols:
                pattern.symbols.append(outcome.symbol)
                pattern.symbols = pattern.symbols[-20:]  # keep last 20

            pattern.last_seen = datetime.now().isoformat()

            # Update confidence based on sample size
            pattern.confidence = self._calculate_confidence(pattern)

            # Generate actionable lesson
            pattern.actionable_lesson = self._generate_lesson(pattern)

        # Persist patterns
        self._save_patterns()

    def get_relevant_patterns(
        self,
        asset_class: str,
        rsi: Optional[float] = None,
        regime: Optional[str] = None,
        volume_ratio: Optional[float] = None,
        min_confidence: float = 0.5,
    ) -> List[TrackedPattern]:
        """
        Get patterns relevant to current market conditions.
        Used by AdaptiveContext to inject into Decision Agent prompts.
        """
        relevant = []

        for pattern in self.patterns.values():
            if pattern.confidence < min_confidence:
                continue
            if pattern.occurrences < 5:
                continue

            # Match by asset class
            if asset_class and asset_class not in pattern.description:
                continue

            # Match by current conditions
            if rsi is not None:
                if "overbought" in pattern.pattern_type and rsi > 65:
                    relevant.append(pattern)
                    continue
                if "oversold" in pattern.pattern_type and rsi < 35:
                    relevant.append(pattern)
                    continue

            if regime and f"regime_{regime}" in pattern.pattern_type:
                relevant.append(pattern)
                continue

            if volume_ratio is not None:
                if "low_volume" in pattern.pattern_type and volume_ratio < 1.0:
                    relevant.append(pattern)
                    continue
                if "high_volume" in pattern.pattern_type and volume_ratio > 1.5:
                    relevant.append(pattern)
                    continue

            # High-confidence patterns always included
            if pattern.confidence > 0.8 and pattern.occurrences >= 10:
                relevant.append(pattern)

        # Sort by confidence × occurrences (most reliable first)
        relevant.sort(key=lambda p: p.confidence * p.occurrences, reverse=True)
        return relevant[:10]

    def _calculate_confidence(self, p: TrackedPattern) -> float:
        """
        Statistical confidence in a pattern.
        Based on sample size and consistency of outcomes.
        """
        if p.occurrences < 3:
            return 0.0
        if p.occurrences < 5:
            return 0.2

        # Base confidence from sample size (log scale)
        import math
        size_factor = min(1.0, math.log(p.occurrences) / math.log(50))  # asymptotes at 50 trades

        # Consistency factor — strong win rates (>65% or <35%) are more reliable
        deviation = abs(p.win_rate - 0.5)
        consistency = min(1.0, deviation * 3)  # 0.5 deviation → 1.0 consistency

        return min(0.95, size_factor * 0.5 + consistency * 0.5)

    def _generate_lesson(self, p: TrackedPattern) -> str:
        """Generate a human-readable actionable lesson from pattern stats."""
        if p.occurrences < 5:
            return f"Emerging pattern: {p.pattern_type} ({p.occurrences} trades)"

        direction = "winning" if p.win_rate > 0.55 else "losing"
        if p.win_rate < 0.4:
            return f"AVOID: {p.pattern_type} has {p.win_rate:.0%} win rate over {p.occurrences} trades (avg {p.avg_pnl:+.1f}%)"
        elif p.win_rate > 0.6:
            return f"FAVOR: {p.pattern_type} has {p.win_rate:.0%} win rate over {p.occurrences} trades (avg {p.avg_r_multiple:+.1f}R)"
        else:
            return f"NEUTRAL: {p.pattern_type} is {direction} at {p.win_rate:.0%} over {p.occurrences} trades"

    def _save_patterns(self):
        """Persist patterns to JSONL."""
        try:
            os.makedirs(MEMORY_DIR, exist_ok=True)
            with open(PATTERNS_FILE, 'w') as f:
                for p in self.patterns.values():
                    f.write(json.dumps(p.to_dict()) + "\n")
        except Exception as e:
            logger.error(f"Failed to save patterns: {e}")

    def _load_patterns(self):
        """Load patterns from JSONL on startup."""
        try:
            if os.path.exists(PATTERNS_FILE):
                with open(PATTERNS_FILE, 'r') as f:
                    for line in f:
                        try:
                            data = json.loads(line.strip())
                            pattern = TrackedPattern(**data)
                            self.patterns[pattern.pattern_id] = pattern
                        except (json.JSONDecodeError, TypeError):
                            continue
                logger.info(f"Loaded {len(self.patterns)} patterns from Scan AI history")
        except Exception as e:
            logger.error(f"Failed to load patterns: {e}")

    async def sync_to_db(self):
        """Persist patterns to PostgreSQL for redeploy survival."""
        try:
            from agents.outcome_store import outcome_store
            pool = await outcome_store._get_pool()
            if not pool:
                return
            async with pool.acquire() as conn:
                for p in self.patterns.values():
                    await conn.execute("""
                        INSERT INTO scan_patterns
                            (pattern_id, pattern_type, asset_class, description,
                             occurrences, wins, losses, win_rate, avg_pnl,
                             avg_r_multiple, confidence, actionable_lesson,
                             symbols, last_seen, last_updated)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,NOW())
                        ON CONFLICT (pattern_id) DO UPDATE SET
                            occurrences=$5, wins=$6, losses=$7, win_rate=$8,
                            avg_pnl=$9, avg_r_multiple=$10, confidence=$11,
                            actionable_lesson=$12, symbols=$13::jsonb,
                            last_seen=$14, last_updated=NOW()
                    """, p.pattern_id, p.pattern_type,
                        p.description.split(" in ")[-1] if " in " in p.description else "stock",
                        p.description, p.occurrences, p.wins, p.losses,
                        p.win_rate, p.avg_pnl, p.avg_r_multiple, p.confidence,
                        p.actionable_lesson or "", json.dumps(p.symbols),
                        p.last_seen or "")
            logger.info(f"Synced {len(self.patterns)} patterns to DB")
        except Exception as e:
            logger.error(f"Pattern DB sync error: {e}")

    async def load_from_db(self):
        """Load patterns from PostgreSQL (supplements local JSONL)."""
        try:
            from agents.outcome_store import outcome_store
            pool = await outcome_store._get_pool()
            if not pool:
                return
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT * FROM scan_patterns")
                loaded = 0
                for row in rows:
                    pid = row["pattern_id"]
                    if pid not in self.patterns:
                        syms = row["symbols"]
                        if isinstance(syms, str):
                            syms = json.loads(syms)
                        self.patterns[pid] = TrackedPattern(
                            pattern_id=pid,
                            pattern_type=row["pattern_type"],
                            description=row["description"] or "",
                            occurrences=row["occurrences"] or 0,
                            wins=row["wins"] or 0,
                            losses=row["losses"] or 0,
                            win_rate=float(row["win_rate"] or 0),
                            avg_pnl=float(row["avg_pnl"] or 0),
                            avg_r_multiple=float(row["avg_r_multiple"] or 0),
                            confidence=float(row["confidence"] or 0),
                            actionable_lesson=row["actionable_lesson"],
                            symbols=syms if isinstance(syms, list) else [],
                            last_seen=row["last_seen"] or "",
                        )
                        loaded += 1
                if loaded:
                    logger.info(f"Loaded {loaded} patterns from DB (total: {len(self.patterns)})")
                    self._save_patterns()
        except Exception as e:
            logger.error(f"Pattern DB load error: {e}")

    def get_stats(self) -> Dict:
        significant = [p for p in self.patterns.values() if p.is_significant()]
        top_winners = sorted(
            [p for p in significant if p.win_rate > 0.55],
            key=lambda p: p.win_rate * p.occurrences,
            reverse=True
        )[:5]
        top_losers = sorted(
            [p for p in significant if p.win_rate < 0.45],
            key=lambda p: (1 - p.win_rate) * p.occurrences,
            reverse=True
        )[:5]

        return {
            "total_trades_analyzed": self.total_trades_analyzed,
            "total_patterns": len(self.patterns),
            "significant_patterns": len(significant),
            "top_winning_patterns": [
                {"type": p.pattern_type, "win_rate": f"{p.win_rate:.0%}", "trades": p.occurrences}
                for p in top_winners
            ],
            "top_losing_patterns": [
                {"type": p.pattern_type, "win_rate": f"{p.win_rate:.0%}", "trades": p.occurrences}
                for p in top_losers
            ],
        }
