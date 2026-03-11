"""
Trade Backfill
==============

Reads closed trades from the bots' `trades` table and feeds them into
the outcome store + supervisor bandit to bootstrap the learning system.

Supports two modes:
1. Direct DB read (if bridge shares the same DATABASE_URL as bots)
2. Accept trades as JSON via API (bots push their data)
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict, List

from agents.base import TradeOutcome
from agents.outcome_store import outcome_store
from agents.supervisor_bandit import supervisor
from agents.reward_calculator import calculate_reward

logger = logging.getLogger(__name__)


def _map_close_reason(reason: str) -> str:
    """Normalize bot close reasons to standard exit_reason."""
    reason = (reason or "unknown").lower().strip()
    if "stop" in reason and "trail" in reason:
        return "trailing_stop"
    if "stop" in reason:
        return "stop_loss"
    if "profit" in reason or "target" in reason:
        return "take_profit"
    if "end" in reason or "eod" in reason or "day" in reason:
        return "time_exit"
    if "circuit" in reason:
        return "circuit_breaker"
    if "manual" in reason or "close all" in reason:
        return "manual"
    if "early" in reason or "cut" in reason:
        return "early_exit"
    return reason


def _calc_r_multiple(entry_price: float, exit_price: float, stop_loss: float, direction: str) -> float:
    """Calculate R-multiple from trade prices."""
    if not entry_price or not stop_loss or entry_price == stop_loss:
        return 0.0
    if direction == "short":
        risk = entry_price - stop_loss  # positive if stop above entry (wrong), negative otherwise
        reward = entry_price - exit_price
    else:
        risk = entry_price - stop_loss  # positive = distance to stop
        reward = exit_price - entry_price
    if abs(risk) < 0.0001:
        return 0.0
    return reward / abs(risk)


def _calc_hold_minutes(entry_time, exit_time) -> float:
    """Calculate hold duration in minutes."""
    if not entry_time or not exit_time:
        return 0.0
    try:
        if isinstance(entry_time, str):
            entry_time = datetime.fromisoformat(entry_time.replace('Z', '+00:00'))
        if isinstance(exit_time, str):
            exit_time = datetime.fromisoformat(exit_time.replace('Z', '+00:00'))
        delta = exit_time - entry_time
        return max(0.0, delta.total_seconds() / 60.0)
    except Exception:
        return 0.0


def trade_row_to_outcome(row: Dict) -> Optional[TradeOutcome]:
    """Convert a trades table row to a TradeOutcome."""
    try:
        entry_price = float(row.get("entry_price") or 0)
        exit_price = float(row.get("exit_price") or 0)
        pnl = float(row.get("pnl_usd") or 0)
        pnl_pct = float(row.get("pnl_pct") or 0)

        if not entry_price or not exit_price:
            return None

        stop_loss = float(row.get("stop_loss") or 0)
        direction = row.get("direction", "long")
        bot = row.get("bot", "stock")

        # Map bot name to asset_class
        asset_class_map = {"stock": "stock", "forex": "forex", "crypto": "crypto"}
        asset_class = asset_class_map.get(bot, "stock")

        r_multiple = _calc_r_multiple(entry_price, exit_price, stop_loss, direction)
        hold_mins = _calc_hold_minutes(row.get("entry_time"), row.get("exit_time"))

        # Extract context fields
        context = row.get("entry_context") or {}
        if isinstance(context, str):
            try:
                context = json.loads(context)
            except json.JSONDecodeError:
                context = {}

        rsi = float(row.get("rsi") or context.get("rsi") or 0) or None
        volume_ratio = float(row.get("volume_ratio") or context.get("volumeRatio") or 0) or None
        momentum = float(row.get("momentum_pct") or context.get("momentum") or context.get("percentChange") or 0) or None
        atr_pct = float(context.get("atrPct") or 0) or None
        regime_quality = float(context.get("regimeQuality") or 0) or None
        score = float(row.get("signal_score") or context.get("score") or 0) or None

        return TradeOutcome(
            symbol=row.get("symbol", ""),
            asset_class=asset_class,
            direction=direction,
            tier=row.get("tier") or "tier1",
            entry_price=entry_price,
            exit_price=exit_price,
            pnl=pnl,
            pnl_pct=pnl_pct,
            r_multiple=r_multiple,
            hold_duration_minutes=hold_mins,
            exit_reason=_map_close_reason(row.get("close_reason", "")),
            entry_rsi=rsi,
            entry_regime=row.get("regime"),
            entry_regime_quality=regime_quality,
            entry_momentum=momentum,
            entry_volume_ratio=volume_ratio,
            entry_atr_pct=atr_pct,
            entry_score=score,
            timestamp=str(row.get("exit_time") or row.get("entry_time") or ""),
        )
    except Exception as e:
        logger.error(f"Failed to convert trade row: {e}")
        return None


async def backfill_from_db(
    bot_db_url: Optional[str] = None,
    limit: int = 500,
    since_days: int = 90,
    scan_engine=None,
    learning_agent=None,
) -> Dict:
    """
    Read closed trades from the trades table and feed into outcome store + bandit.

    Args:
        bot_db_url: Database URL to read trades from. If None, uses DATABASE_URL.
        limit: Max trades to backfill.
        since_days: Only backfill trades from the last N days.

    Returns:
        Summary dict with counts.
    """
    db_url = bot_db_url or os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if not db_url:
        return {"error": "No DATABASE_URL configured", "trades_processed": 0}

    try:
        import asyncpg
    except ImportError:
        return {"error": "asyncpg not installed", "trades_processed": 0}

    stats = {
        "trades_found": 0,
        "trades_processed": 0,
        "trades_skipped": 0,
        "rewards_calculated": 0,
        "bandit_updates": 0,
        "patterns_ingested": 0,
        "lessons_extracted": 0,
        "errors": 0,
    }

    try:
        ssl_mode = os.environ.get("PGSSLMODE", "prefer")
        conn = await asyncpg.connect(
            db_url,
            ssl='require' if ssl_mode == 'require' else None,
        )

        rows = await conn.fetch("""
            SELECT *
            FROM trades
            WHERE status = 'closed'
              AND pnl_pct IS NOT NULL
              AND exit_price IS NOT NULL
              AND entry_time > NOW() - INTERVAL '%s days'
            ORDER BY exit_time ASC
            LIMIT $1
        """ % since_days, limit)

        await conn.close()

        stats["trades_found"] = len(rows)
        logger.info(f"[Backfill] Found {len(rows)} closed trades to process")

        for row in rows:
            row_dict = dict(row)
            outcome = trade_row_to_outcome(row_dict)
            if not outcome:
                stats["trades_skipped"] += 1
                continue

            try:
                # Feed to scan engine (cheap, in-memory pattern tracking)
                if scan_engine:
                    try:
                        scan_engine.ingest_trade(outcome)
                        stats["patterns_ingested"] += 1
                    except Exception as e:
                        logger.error(f"[Backfill] Scan engine error for {outcome.symbol}: {e}")

                # Feed to learning agent (Claude calls — only for subset)
                lesson = None
                if learning_agent and stats["lessons_extracted"] < 20:
                    try:
                        lesson = await learning_agent.analyze_trade(outcome)
                        if lesson:
                            stats["lessons_extracted"] += 1
                    except Exception as e:
                        logger.error(f"[Backfill] Learning agent error for {outcome.symbol}: {e}")

                # Log to outcome store (calculates reward)
                reward = await outcome_store.log_outcome(
                    outcome=outcome,
                    pattern_type=lesson.get("pattern_type", "") if lesson else "",
                    actionable_lesson=lesson.get("actionable_lesson", "") if lesson else "",
                    lesson_confidence=lesson.get("confidence_in_lesson", 0) if lesson else 0.0,
                )
                stats["trades_processed"] += 1

                if reward:
                    stats["rewards_calculated"] += 1
                    # Feed to supervisor bandit
                    supervisor.update(
                        regime=outcome.entry_regime or "unknown",
                        asset_class=outcome.asset_class,
                        tier=outcome.tier,
                        arm="moderate",  # Historical trades used default strategy
                        reward_score=reward.reward_score,
                    )
                    stats["bandit_updates"] += 1

            except Exception as e:
                logger.error(f"[Backfill] Error processing {outcome.symbol}: {e}")
                stats["errors"] += 1

        # Save bandit state
        supervisor._save_state()
        try:
            await supervisor.sync_to_db()
        except Exception:
            pass

        # Sync scan engine and learning agent to DB (v5.1: redeploy persistence)
        if scan_engine:
            try:
                await scan_engine.sync_to_db()
            except Exception as e:
                logger.error(f"[Backfill] Scan engine DB sync error: {e}")
        if learning_agent:
            try:
                await learning_agent.sync_to_db()
            except Exception as e:
                logger.error(f"[Backfill] Learning agent DB sync error: {e}")

        logger.info(
            f"[Backfill] Complete: {stats['trades_processed']}/{stats['trades_found']} trades, "
            f"{stats['rewards_calculated']} rewards, {stats['bandit_updates']} bandit updates, "
            f"{stats['patterns_ingested']} patterns, {stats['lessons_extracted']} lessons"
        )

    except Exception as e:
        logger.error(f"[Backfill] DB error: {e}")
        stats["error"] = str(e)

    return stats


async def backfill_from_json(trades: List[Dict]) -> Dict:
    """
    Backfill from a list of trade dicts (pushed from bots via API).
    Each dict should match the trades table columns.
    """
    stats = {
        "trades_received": len(trades),
        "trades_processed": 0,
        "trades_skipped": 0,
        "rewards_calculated": 0,
        "bandit_updates": 0,
        "errors": 0,
    }

    for row in trades:
        outcome = trade_row_to_outcome(row)
        if not outcome:
            stats["trades_skipped"] += 1
            continue

        try:
            reward = await outcome_store.log_outcome(
                outcome=outcome,
                pattern_type="",
                actionable_lesson="",
                lesson_confidence=0.0,
            )
            stats["trades_processed"] += 1

            if reward:
                stats["rewards_calculated"] += 1
                supervisor.update(
                    regime=outcome.entry_regime or "unknown",
                    asset_class=outcome.asset_class,
                    tier=outcome.tier,
                    arm="moderate",
                    reward_score=reward.reward_score,
                )
                stats["bandit_updates"] += 1

        except Exception as e:
            logger.error(f"[Backfill] Error: {e}")
            stats["errors"] += 1

    supervisor._save_state()

    return stats
