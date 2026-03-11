"""
Learning Agent
==============

Post-trade analysis agent. When a trade closes, this agent:
1. Analyzes what happened and why
2. Extracts actionable lessons using Claude
3. Feeds lessons to the Scan Engine for pattern tracking
4. Lessons are injected into future Decision Agent prompts

This is the feedback loop that makes the system truly agentic.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict, List

from agents.base import TradeOutcome, TrackedPattern
from agents.claude_client import ClaudeClient, LESSON_EXTRACTION_TOOL

logger = logging.getLogger(__name__)

MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
LESSONS_FILE = os.path.join(MEMORY_DIR, "agent_lessons.jsonl")

LEARNING_SYSTEM = """You are a trading performance analyst reviewing completed trades. Your job is to extract ONE clear, actionable lesson from each trade outcome.

Focus on:
- WHY did this trade win or lose? Was it setup quality, timing, market regime, or execution?
- What PATTERN does this represent? (e.g., "overbought entries in ranging markets tend to fail")
- Should position sizing be adjusted for similar setups?

Be specific and data-driven. Vague lessons like "be more careful" are useless.
Good lessons: "RSI above 70 entries in ranging regime lost 4 of 5 times — reduce size or skip"
Bad lessons: "Markets are unpredictable" """


class LearningAgent:
    """Extracts lessons from completed trades to improve future decisions."""

    def __init__(self, client: ClaudeClient):
        self.client = client
        self.total_lessons = 0
        self._recent_lessons: List[Dict] = []
        self._load_recent_lessons()

    async def analyze_trade(self, outcome: TradeOutcome) -> Optional[Dict]:
        """
        Analyze a completed trade and extract lessons.
        Returns lesson dict or None.
        """
        if not self.client.available:
            return self._rule_based_lesson(outcome)

        prompt = self._build_prompt(outcome)
        result = await self.client.call_with_tool(
            system=LEARNING_SYSTEM,
            user_message=prompt,
            tool=LESSON_EXTRACTION_TOOL,
            timeout_seconds=12
        )

        if result:
            lesson = {
                "timestamp": datetime.now().isoformat(),
                "symbol": outcome.symbol,
                "asset_class": outcome.asset_class,
                "pnl": outcome.pnl,
                "pnl_pct": outcome.pnl_pct,
                "r_multiple": outcome.r_multiple,
                "exit_reason": outcome.exit_reason,
                **result
            }
            self._save_lesson(lesson)
            self.total_lessons += 1
            return lesson

        return self._rule_based_lesson(outcome)

    def get_applicable_lessons(
        self,
        symbol: str = "",
        asset_class: str = "",
        regime: str = "",
        max_lessons: int = 5
    ) -> List[str]:
        """
        Get relevant lessons for the Decision Agent prompt.
        Prioritizes: symbol-specific > regime-specific > recent.
        """
        applicable = []

        # Symbol-specific lessons
        for l in reversed(self._recent_lessons):
            if l.get("symbol") == symbol:
                applicable.append(l.get("actionable_lesson", ""))
            if len(applicable) >= 2:
                break

        # Asset-class lessons
        for l in reversed(self._recent_lessons):
            if l.get("asset_class") == asset_class and l.get("actionable_lesson") not in applicable:
                applicable.append(l.get("actionable_lesson", ""))
            if len(applicable) >= 4:
                break

        # Fill with recent lessons
        for l in reversed(self._recent_lessons):
            lesson_text = l.get("actionable_lesson", "")
            if lesson_text and lesson_text not in applicable:
                applicable.append(lesson_text)
            if len(applicable) >= max_lessons:
                break

        return [l for l in applicable if l]

    def _build_prompt(self, o: TradeOutcome) -> str:
        result = "WIN" if o.pnl > 0 else "LOSS"
        lines = [
            f"TRADE REVIEW: {o.symbol} ({o.asset_class}) — {result}",
            f"Direction: {o.direction}",
            f"Entry: {o.entry_price} → Exit: {o.exit_price}",
            f"P&L: {o.pnl_pct:+.2f}% (R-multiple: {o.r_multiple:+.2f}R)",
            f"Hold duration: {o.hold_duration_minutes:.0f} minutes",
            f"Exit reason: {o.exit_reason}",
        ]
        if o.entry_rsi is not None: lines.append(f"Entry RSI: {o.entry_rsi:.1f}")
        if o.entry_regime: lines.append(f"Entry regime: {o.entry_regime}")
        if o.entry_regime_quality is not None: lines.append(f"Regime quality: {o.entry_regime_quality:.2f}")
        if o.entry_momentum is not None: lines.append(f"Entry momentum: {o.entry_momentum}%")
        if o.entry_volume_ratio is not None: lines.append(f"Entry volume: {o.entry_volume_ratio}x")
        if o.entry_atr_pct is not None: lines.append(f"Entry ATR: {o.entry_atr_pct}%")
        if o.agent_approved is not None:
            lines.append(f"Agent decision at entry: {'APPROVED' if o.agent_approved else 'REJECTED'} (conf: {o.agent_confidence:.2f})")
            if o.agent_reason: lines.append(f"Agent reason: {o.agent_reason}")
        return "\n".join(lines)

    def _rule_based_lesson(self, o: TradeOutcome) -> Optional[Dict]:
        """Extract basic lesson without Claude."""
        pattern_type = "unknown"
        lesson = ""

        if o.pnl < 0:
            if o.exit_reason == "stop_loss":
                if o.entry_rsi and o.entry_rsi > 70:
                    pattern_type = "overbought_entry"
                    lesson = f"Overbought entry (RSI {o.entry_rsi:.0f}) hit stop on {o.symbol}"
                elif o.entry_volume_ratio and o.entry_volume_ratio < 1.0:
                    pattern_type = "low_volume_trap"
                    lesson = f"Low volume entry ({o.entry_volume_ratio:.1f}x) stopped out on {o.symbol}"
                else:
                    pattern_type = "stop_loss_hit"
                    lesson = f"Stop hit on {o.symbol} after {o.hold_duration_minutes:.0f}min hold"
            elif o.exit_reason == "trailing_stop":
                pattern_type = "trend_exhaustion"
                lesson = f"Trend exhausted on {o.symbol} — gave back gains"
        else:
            if o.r_multiple > 2.0:
                pattern_type = "strong_momentum"
                lesson = f"Strong {o.r_multiple:.1f}R winner on {o.symbol} in {o.entry_regime or 'unknown'} regime"
            else:
                pattern_type = "good_setup"
                lesson = f"Clean {o.pnl_pct:+.1f}% win on {o.symbol}"

        if not lesson:
            return None

        result = {
            "timestamp": datetime.now().isoformat(),
            "symbol": o.symbol,
            "asset_class": o.asset_class,
            "pnl": o.pnl,
            "pnl_pct": o.pnl_pct,
            "r_multiple": o.r_multiple,
            "exit_reason": o.exit_reason,
            "pattern_type": pattern_type,
            "actionable_lesson": lesson,
            "should_adjust_sizing": o.pnl < 0 and o.r_multiple < -1.5,
            "sizing_direction": "decrease" if o.pnl < 0 else "unchanged",
            "confidence_in_lesson": 0.4,
        }
        self._save_lesson(result)
        self.total_lessons += 1
        return result

    def _save_lesson(self, lesson: Dict):
        """Append lesson to JSONL file and keep in memory."""
        try:
            os.makedirs(os.path.dirname(LESSONS_FILE), exist_ok=True)
            with open(LESSONS_FILE, 'a') as f:
                f.write(json.dumps(lesson) + "\n")
        except Exception as e:
            logger.error(f"Failed to save lesson: {e}")

        self._recent_lessons.append(lesson)
        # Keep last 100 in memory
        if len(self._recent_lessons) > 100:
            self._recent_lessons = self._recent_lessons[-100:]

    def _load_recent_lessons(self):
        """Load recent lessons from JSONL file on startup."""
        try:
            if os.path.exists(LESSONS_FILE):
                with open(LESSONS_FILE, 'r') as f:
                    lines = f.readlines()
                    for line in lines[-100:]:  # last 100
                        try:
                            self._recent_lessons.append(json.loads(line.strip()))
                        except json.JSONDecodeError:
                            continue
                logger.info(f"Loaded {len(self._recent_lessons)} lessons from history")
        except Exception as e:
            logger.error(f"Failed to load lessons: {e}")

    async def sync_to_db(self):
        """Persist recent lessons to PostgreSQL for redeploy survival."""
        try:
            from agents.outcome_store import outcome_store
            pool = await outcome_store._get_pool()
            if not pool:
                return
            async with pool.acquire() as conn:
                for l in self._recent_lessons:
                    await conn.execute("""
                        INSERT INTO agent_lessons
                            (timestamp, symbol, asset_class, direction, pnl_pct,
                             pattern_type, actionable_lesson, confidence, regime, exit_reason)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT DO NOTHING
                    """, l.get("timestamp", ""), l.get("symbol", ""),
                        l.get("asset_class", "stock"), l.get("direction", ""),
                        l.get("pnl_pct", 0), l.get("pattern_type", ""),
                        l.get("actionable_lesson", ""), l.get("confidence_in_lesson", 0),
                        l.get("regime", ""), l.get("exit_reason", ""))
            logger.info(f"Synced {len(self._recent_lessons)} lessons to DB")
        except Exception as e:
            logger.error(f"Lesson DB sync error: {e}")

    async def load_from_db(self):
        """Load recent lessons from PostgreSQL (supplements local JSONL)."""
        try:
            from agents.outcome_store import outcome_store
            pool = await outcome_store._get_pool()
            if not pool:
                return
            async with pool.acquire() as conn:
                rows = await conn.fetch("""
                    SELECT * FROM agent_lessons
                    ORDER BY timestamp DESC LIMIT 100
                """)
                if rows and len(self._recent_lessons) == 0:
                    for row in reversed(rows):  # oldest first
                        self._recent_lessons.append({
                            "timestamp": str(row["timestamp"]),
                            "symbol": row["symbol"],
                            "asset_class": row["asset_class"],
                            "direction": row["direction"],
                            "pnl_pct": float(row["pnl_pct"] or 0),
                            "pattern_type": row["pattern_type"],
                            "actionable_lesson": row["actionable_lesson"],
                            "confidence_in_lesson": float(row["confidence"] or 0),
                            "regime": row["regime"],
                            "exit_reason": row["exit_reason"],
                        })
                    self.total_lessons = len(self._recent_lessons)
                    logger.info(f"Loaded {len(self._recent_lessons)} lessons from DB")
                    # Save locally too
                    try:
                        os.makedirs(os.path.dirname(LESSONS_FILE), exist_ok=True)
                        with open(LESSONS_FILE, 'w') as f:
                            for l in self._recent_lessons:
                                f.write(json.dumps(l) + "\n")
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Lesson DB load error: {e}")

    def get_stats(self) -> Dict:
        return {
            "total_lessons": self.total_lessons,
            "lessons_in_memory": len(self._recent_lessons),
            "recent_patterns": self._pattern_summary(),
        }

    def _pattern_summary(self) -> Dict:
        counts: Dict[str, int] = {}
        for l in self._recent_lessons[-50:]:
            pt = l.get("pattern_type", "unknown")
            counts[pt] = counts.get(pt, 0) + 1
        return counts
