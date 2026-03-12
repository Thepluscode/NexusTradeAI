"""
Post-Loss Autopsy Agent
========================

After every losing trade, runs 5 parallel analysis agents to diagnose what went wrong.

Agents:
    1. Entry Timing — Was entry at a local top? RSI overextended?
    2. News Sentiment — Was there adverse news? (reuses SentimentAgent if available)
    3. Stop Distance — Was stop too tight vs ATR?
    4. Regime Mismatch — Was direction wrong for the market regime?
    5. Synthesis — Claude-powered final diagnosis combining all findings

Usage:
    outcome = TradeOutcome(...)  # a losing trade
    report = await run_autopsy(outcome, claude_client)
    await save_to_db(report, db_pool)
"""

import asyncio
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional, List, Dict, Any

from agents.base import TradeOutcome

logger = logging.getLogger(__name__)


# ========================================
# DATA STRUCTURES
# ========================================

@dataclass
class AutopsyFinding:
    """Single finding from one autopsy analysis agent."""
    agent_name: str           # "entry_timing", "news_sentiment", "stop_distance", "regime_mismatch", "synthesis"
    verdict: str              # "likely_cause", "contributing_factor", "not_a_factor"
    detail: str               # One sentence
    confidence: float         # 0-1
    suggested_fix: str        # Actionable one-liner

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class AutopsyReport:
    """Aggregated report from all autopsy agents."""
    trade_symbol: str
    trade_direction: str
    trade_pnl_pct: float
    trade_exit_reason: str
    trade_asset_class: str
    trade_tier: str
    findings: List[AutopsyFinding] = field(default_factory=list)
    primary_failure_mode: str = "unknown"    # bad_entry_timing, adverse_news, stop_too_tight, regime_mismatch, bad_luck, multiple_factors
    actionable_lesson: str = ""
    severity: str = "minor"                  # minor, moderate, severe
    synthesis_confidence: float = 0.0
    timestamp: str = ""

    def to_dict(self) -> Dict:
        d = asdict(self)
        d["findings"] = [f.to_dict() if isinstance(f, AutopsyFinding) else f for f in self.findings]
        return d


# ========================================
# SYNTHESIS TOOL (for Claude structured output)
# ========================================

AUTOPSY_SYNTHESIS_TOOL = {
    "name": "submit_autopsy_synthesis",
    "description": "Submit your synthesis of the post-loss autopsy findings. Combine all agent analyses into a final diagnosis.",
    "input_schema": {
        "type": "object",
        "properties": {
            "primary_failure_mode": {
                "type": "string",
                "enum": ["bad_entry_timing", "adverse_news", "stop_too_tight", "regime_mismatch", "bad_luck", "multiple_factors"],
                "description": "The main reason this trade lost money"
            },
            "actionable_lesson": {
                "type": "string",
                "description": "One concise sentence the trading system should remember to avoid this loss pattern"
            },
            "confidence": {
                "type": "number",
                "description": "0.0-1.0 confidence in this diagnosis"
            },
            "severity": {
                "type": "string",
                "enum": ["minor", "moderate", "severe"],
                "description": "How serious this failure pattern is"
            }
        },
        "required": ["primary_failure_mode", "actionable_lesson", "confidence", "severity"]
    }
}


# ========================================
# ANALYSIS AGENTS (run in parallel)
# ========================================

async def analyze_entry_timing(outcome: TradeOutcome) -> AutopsyFinding:
    """
    Was entry at a local top? Was RSI overextended?
    - Long entry with RSI > 70 = overextended
    - Short entry with RSI < 30 = overextended
    - Entry at momentum exhaustion (high momentum + reversal)
    """
    try:
        rsi = outcome.entry_rsi
        direction = outcome.direction
        momentum = outcome.entry_momentum

        # Check RSI overextension
        rsi_overextended = False
        if rsi is not None:
            if direction == "long" and rsi > 70:
                rsi_overextended = True
            elif direction == "short" and rsi < 30:
                rsi_overextended = True

        # Check momentum exhaustion (high momentum at entry often means buying the top)
        momentum_exhausted = False
        if momentum is not None:
            if direction == "long" and momentum > 8:
                momentum_exhausted = True
            elif direction == "short" and momentum < -8:
                momentum_exhausted = True

        if rsi_overextended and momentum_exhausted:
            return AutopsyFinding(
                agent_name="entry_timing",
                verdict="likely_cause",
                detail=f"Entry at exhaustion: RSI={rsi:.1f} with {momentum:.1f}% momentum — classic top/bottom chase.",
                confidence=0.85,
                suggested_fix=f"Skip {direction} entries when RSI {'> 70' if direction == 'long' else '< 30'} and momentum is extreme.",
            )
        elif rsi_overextended:
            return AutopsyFinding(
                agent_name="entry_timing",
                verdict="contributing_factor",
                detail=f"RSI was overextended at {rsi:.1f} for a {direction} entry — higher reversal probability.",
                confidence=0.70,
                suggested_fix=f"Wait for RSI pullback before entering {direction} when RSI {'> 70' if direction == 'long' else '< 30'}.",
            )
        elif momentum_exhausted:
            return AutopsyFinding(
                agent_name="entry_timing",
                verdict="contributing_factor",
                detail=f"Momentum at {momentum:.1f}% suggests entry near price exhaustion.",
                confidence=0.60,
                suggested_fix="Enter on pullbacks rather than chasing extended moves.",
            )
        else:
            rsi_str = f"RSI={rsi:.1f}" if rsi is not None else "RSI=N/A"
            mom_str = f"momentum={momentum:.1f}%" if momentum is not None else "momentum=N/A"
            return AutopsyFinding(
                agent_name="entry_timing",
                verdict="not_a_factor",
                detail=f"Entry timing was reasonable ({rsi_str}, {mom_str}).",
                confidence=0.65,
                suggested_fix="No timing adjustment needed.",
            )
    except Exception as e:
        logger.error(f"Entry timing analysis error: {e}")
        return AutopsyFinding(
            agent_name="entry_timing",
            verdict="not_a_factor",
            detail=f"Analysis error: {e}",
            confidence=0.0,
            suggested_fix="Ensure entry indicators are available for analysis.",
        )


async def analyze_news_sentiment(outcome: TradeOutcome, sentiment_agent=None) -> AutopsyFinding:
    """
    Was there adverse news during the trade?
    Uses SentimentAgent if available, otherwise returns a neutral finding.
    """
    try:
        if sentiment_agent is not None:
            try:
                sentiment = await sentiment_agent.analyze(
                    symbol=outcome.symbol,
                    asset_class=outcome.asset_class,
                )
                if sentiment:
                    score = sentiment.sentiment_score
                    headlines = sentiment.top_headlines
                    headline = headlines[0] if headlines else ""

                    # Adverse news: negative sentiment for long, positive for short
                    adverse = (
                        (outcome.direction == "long" and score < -0.3) or
                        (outcome.direction == "short" and score > 0.3)
                    )
                    if adverse:
                        return AutopsyFinding(
                            agent_name="news_sentiment",
                            verdict="likely_cause",
                            detail=f"Adverse sentiment detected (score={score:.2f}): {headline[:80]}",
                            confidence=0.75,
                            suggested_fix="Check news sentiment before entry; skip trades with adverse headlines.",
                        )
                    else:
                        return AutopsyFinding(
                            agent_name="news_sentiment",
                            verdict="not_a_factor",
                            detail=f"Sentiment was neutral/favorable (score={score:.2f}).",
                            confidence=0.60,
                            suggested_fix="No sentiment adjustment needed.",
                        )
            except Exception as e:
                logger.warning(f"Sentiment agent call failed: {e}")

        # No sentiment agent available — return inconclusive
        return AutopsyFinding(
            agent_name="news_sentiment",
            verdict="not_a_factor",
            detail="Sentiment data unavailable for this trade; cannot determine news impact.",
            confidence=0.20,
            suggested_fix="Integrate news sentiment feed for better post-loss diagnosis.",
        )
    except Exception as e:
        logger.error(f"News sentiment analysis error: {e}")
        return AutopsyFinding(
            agent_name="news_sentiment",
            verdict="not_a_factor",
            detail=f"Analysis error: {e}",
            confidence=0.0,
            suggested_fix="Fix sentiment analysis pipeline.",
        )


async def analyze_stop_distance(outcome: TradeOutcome) -> AutopsyFinding:
    """
    Was stop too tight vs ATR?
    Rule: if stop_pct < atr_pct * 1.5, the stop was too tight.
    """
    try:
        atr_pct = outcome.entry_atr_pct
        entry_price = outcome.entry_price
        exit_price = outcome.exit_price
        exit_reason = outcome.exit_reason

        # Calculate actual loss percentage
        if entry_price and entry_price > 0:
            if outcome.direction == "long":
                loss_pct = abs((exit_price - entry_price) / entry_price * 100)
            else:
                loss_pct = abs((entry_price - exit_price) / entry_price * 100)
        else:
            loss_pct = abs(outcome.pnl_pct) if outcome.pnl_pct else 0

        # If we have ATR data, compare stop distance to ATR
        if atr_pct is not None and atr_pct > 0:
            stop_pct = loss_pct  # approximate: loss ~= stop distance if stopped out
            threshold = atr_pct * 1.5

            if exit_reason in ("stop_loss", "trailing_stop") and stop_pct < threshold:
                return AutopsyFinding(
                    agent_name="stop_distance",
                    verdict="likely_cause",
                    detail=f"Stop was too tight: {stop_pct:.1f}% vs ATR {atr_pct:.1f}% (need >= {threshold:.1f}%).",
                    confidence=0.80,
                    suggested_fix=f"Widen stop to at least {threshold:.1f}% (1.5x ATR) for this volatility level.",
                )
            elif stop_pct < atr_pct:
                return AutopsyFinding(
                    agent_name="stop_distance",
                    verdict="contributing_factor",
                    detail=f"Stop distance ({stop_pct:.1f}%) was less than 1x ATR ({atr_pct:.1f}%) — noise could trigger it.",
                    confidence=0.65,
                    suggested_fix=f"Use at least 1.5x ATR ({threshold:.1f}%) for stop distance.",
                )
            else:
                return AutopsyFinding(
                    agent_name="stop_distance",
                    verdict="not_a_factor",
                    detail=f"Stop distance ({stop_pct:.1f}%) was adequate vs ATR ({atr_pct:.1f}%).",
                    confidence=0.70,
                    suggested_fix="Stop distance was appropriate.",
                )
        else:
            return AutopsyFinding(
                agent_name="stop_distance",
                verdict="not_a_factor",
                detail=f"ATR data unavailable; cannot assess stop distance adequacy (loss: {loss_pct:.1f}%).",
                confidence=0.20,
                suggested_fix="Track ATR at entry for stop distance analysis.",
            )
    except Exception as e:
        logger.error(f"Stop distance analysis error: {e}")
        return AutopsyFinding(
            agent_name="stop_distance",
            verdict="not_a_factor",
            detail=f"Analysis error: {e}",
            confidence=0.0,
            suggested_fix="Ensure ATR data is available at entry.",
        )


async def analyze_regime_mismatch(outcome: TradeOutcome) -> AutopsyFinding:
    """
    Was the trade direction wrong for the market regime?
    Long in bearish regime = mismatch. Short in bullish regime = mismatch.
    """
    try:
        regime = outcome.entry_regime
        direction = outcome.direction

        if regime is None:
            return AutopsyFinding(
                agent_name="regime_mismatch",
                verdict="not_a_factor",
                detail="No regime data at entry; cannot assess regime alignment.",
                confidence=0.20,
                suggested_fix="Ensure regime detection is active before entry.",
            )

        regime_lower = regime.lower()

        # Define bearish regimes
        bearish_regimes = ["trending_down", "bearish", "volatile", "breakdown"]
        bullish_regimes = ["trending_up", "bullish", "breakout"]
        neutral_regimes = ["ranging", "quiet", "transitioning"]

        mismatched = False
        if direction == "long" and any(r in regime_lower for r in bearish_regimes):
            mismatched = True
        elif direction == "short" and any(r in regime_lower for r in bullish_regimes):
            mismatched = True

        if mismatched:
            return AutopsyFinding(
                agent_name="regime_mismatch",
                verdict="likely_cause",
                detail=f"Direction mismatch: went {direction} in {regime} regime — fighting the trend.",
                confidence=0.85,
                suggested_fix=f"Do not enter {direction} trades when regime is {regime}.",
            )
        elif any(r in regime_lower for r in neutral_regimes):
            return AutopsyFinding(
                agent_name="regime_mismatch",
                verdict="contributing_factor",
                detail=f"Regime was {regime} (neutral/ranging) — directional trades have lower edge in this environment.",
                confidence=0.50,
                suggested_fix="Reduce position size or skip directional trades in ranging/neutral regimes.",
            )
        else:
            return AutopsyFinding(
                agent_name="regime_mismatch",
                verdict="not_a_factor",
                detail=f"Direction ({direction}) aligned with regime ({regime}).",
                confidence=0.75,
                suggested_fix="Regime alignment was correct.",
            )
    except Exception as e:
        logger.error(f"Regime mismatch analysis error: {e}")
        return AutopsyFinding(
            agent_name="regime_mismatch",
            verdict="not_a_factor",
            detail=f"Analysis error: {e}",
            confidence=0.0,
            suggested_fix="Fix regime detection pipeline.",
        )


async def synthesize_findings(
    outcome: TradeOutcome,
    findings: List[AutopsyFinding],
    claude_client,
) -> AutopsyFinding:
    """
    Uses ONE Claude call to produce a final diagnosis from all agent findings.
    Falls back to rule-based synthesis if Claude is unavailable.
    """
    try:
        # Build context for Claude
        findings_text = "\n".join([
            f"- {f.agent_name}: {f.verdict} (conf={f.confidence:.2f}) — {f.detail}"
            for f in findings
        ])

        system_prompt = (
            "You are a post-loss trade autopsy analyst. Given the trade details and "
            "findings from 4 specialist agents, synthesize a final diagnosis. "
            "Identify the primary failure mode and provide one actionable lesson."
        )

        user_message = (
            f"LOSING TRADE:\n"
            f"  Symbol: {outcome.symbol} ({outcome.asset_class})\n"
            f"  Direction: {outcome.direction}\n"
            f"  P&L: {outcome.pnl_pct:.2f}%\n"
            f"  Exit reason: {outcome.exit_reason}\n"
            f"  Entry RSI: {outcome.entry_rsi}\n"
            f"  Entry regime: {outcome.entry_regime}\n"
            f"  Entry ATR%: {outcome.entry_atr_pct}\n"
            f"  Entry momentum: {outcome.entry_momentum}\n\n"
            f"AGENT FINDINGS:\n{findings_text}\n\n"
            f"Synthesize these into a final diagnosis."
        )

        if claude_client and claude_client.available:
            result = await claude_client.call_with_tool(
                system=system_prompt,
                user_message=user_message,
                tool=AUTOPSY_SYNTHESIS_TOOL,
                timeout_seconds=15,
            )
            if result:
                return AutopsyFinding(
                    agent_name="synthesis",
                    verdict="likely_cause",
                    detail=f"{result['primary_failure_mode']}: {result['actionable_lesson']}",
                    confidence=result.get("confidence", 0.5),
                    suggested_fix=result["actionable_lesson"],
                )

        # Fallback: rule-based synthesis
        return _rule_based_synthesis(outcome, findings)

    except Exception as e:
        logger.error(f"Synthesis error: {e}")
        return _rule_based_synthesis(outcome, findings)


def _rule_based_synthesis(outcome: TradeOutcome, findings: List[AutopsyFinding]) -> AutopsyFinding:
    """Fallback synthesis when Claude is unavailable."""
    likely_causes = [f for f in findings if f.verdict == "likely_cause"]
    contributing = [f for f in findings if f.verdict == "contributing_factor"]

    if len(likely_causes) == 1:
        cause = likely_causes[0]
        return AutopsyFinding(
            agent_name="synthesis",
            verdict="likely_cause",
            detail=f"Primary cause: {cause.agent_name} — {cause.detail}",
            confidence=cause.confidence * 0.9,
            suggested_fix=cause.suggested_fix,
        )
    elif len(likely_causes) > 1:
        names = ", ".join(f.agent_name for f in likely_causes)
        return AutopsyFinding(
            agent_name="synthesis",
            verdict="likely_cause",
            detail=f"Multiple factors: {names}. Most confident: {likely_causes[0].agent_name}.",
            confidence=max(f.confidence for f in likely_causes) * 0.85,
            suggested_fix=likely_causes[0].suggested_fix,
        )
    elif contributing:
        cause = max(contributing, key=lambda f: f.confidence)
        return AutopsyFinding(
            agent_name="synthesis",
            verdict="contributing_factor",
            detail=f"No clear primary cause. Top contributing factor: {cause.agent_name} — {cause.detail}",
            confidence=cause.confidence * 0.7,
            suggested_fix=cause.suggested_fix,
        )
    else:
        return AutopsyFinding(
            agent_name="synthesis",
            verdict="not_a_factor",
            detail=f"No clear failure mode identified — loss of {outcome.pnl_pct:.2f}% may be normal variance.",
            confidence=0.40,
            suggested_fix="Monitor for recurrence; this may be acceptable variance.",
        )


# ========================================
# MAIN AUTOPSY RUNNER
# ========================================

async def run_autopsy(
    outcome: TradeOutcome,
    claude_client=None,
    sentiment_agent=None,
) -> AutopsyReport:
    """
    Run the full post-loss autopsy.
    Agents 1-4 run in parallel, then synthesis combines results.
    Returns AutopsyReport.
    """
    logger.info(f"[Autopsy] Starting autopsy for {outcome.symbol} ({outcome.pnl_pct:+.2f}%)")

    # Step 1: Run agents 1-4 in parallel
    parallel_findings = await asyncio.gather(
        analyze_entry_timing(outcome),
        analyze_news_sentiment(outcome, sentiment_agent),
        analyze_stop_distance(outcome),
        analyze_regime_mismatch(outcome),
        return_exceptions=True,
    )

    # Handle any exceptions from parallel execution
    findings: List[AutopsyFinding] = []
    for i, result in enumerate(parallel_findings):
        if isinstance(result, Exception):
            agent_names = ["entry_timing", "news_sentiment", "stop_distance", "regime_mismatch"]
            logger.error(f"[Autopsy] Agent {agent_names[i]} failed: {result}")
            findings.append(AutopsyFinding(
                agent_name=agent_names[i],
                verdict="not_a_factor",
                detail=f"Agent error: {result}",
                confidence=0.0,
                suggested_fix="Fix agent analysis pipeline.",
            ))
        else:
            findings.append(result)

    # Step 2: Synthesis (combines all findings via Claude or rule-based fallback)
    synthesis = await synthesize_findings(outcome, findings, claude_client)
    findings.append(synthesis)

    # Determine primary failure mode from synthesis
    primary_failure_mode = "bad_luck"
    actionable_lesson = synthesis.suggested_fix
    severity = "minor"

    # Extract from synthesis detail if it contains a failure mode enum value
    failure_modes = ["bad_entry_timing", "adverse_news", "stop_too_tight", "regime_mismatch", "bad_luck", "multiple_factors"]
    for mode in failure_modes:
        if mode in synthesis.detail.lower().replace(" ", "_"):
            primary_failure_mode = mode
            break
    else:
        # Infer from individual findings
        likely_causes = [f for f in findings if f.verdict == "likely_cause" and f.agent_name != "synthesis"]
        if len(likely_causes) > 1:
            primary_failure_mode = "multiple_factors"
        elif len(likely_causes) == 1:
            name_to_mode = {
                "entry_timing": "bad_entry_timing",
                "news_sentiment": "adverse_news",
                "stop_distance": "stop_too_tight",
                "regime_mismatch": "regime_mismatch",
            }
            primary_failure_mode = name_to_mode.get(likely_causes[0].agent_name, "bad_luck")

    # Determine severity based on loss magnitude
    loss_pct = abs(outcome.pnl_pct) if outcome.pnl_pct else 0
    if loss_pct >= 5:
        severity = "severe"
    elif loss_pct >= 2:
        severity = "moderate"
    else:
        severity = "minor"

    report = AutopsyReport(
        trade_symbol=outcome.symbol,
        trade_direction=outcome.direction,
        trade_pnl_pct=outcome.pnl_pct,
        trade_exit_reason=outcome.exit_reason,
        trade_asset_class=outcome.asset_class,
        trade_tier=outcome.tier,
        findings=findings,
        primary_failure_mode=primary_failure_mode,
        actionable_lesson=actionable_lesson,
        severity=severity,
        synthesis_confidence=synthesis.confidence,
        timestamp=datetime.now().isoformat(),
    )

    logger.info(
        f"[Autopsy] {outcome.symbol}: {primary_failure_mode} (severity={severity}, "
        f"conf={synthesis.confidence:.2f}) — {actionable_lesson}"
    )

    return report


# ========================================
# DATABASE PERSISTENCE
# ========================================

async def save_to_db(report: AutopsyReport, db_pool) -> Optional[int]:
    """
    Save autopsy report to the loss_autopsies PostgreSQL table.
    Returns the row ID, or None if save fails.
    """
    if db_pool is None:
        logger.warning("[Autopsy] No DB pool — skipping save")
        return None

    try:
        import json as _json
        findings_json = _json.dumps([f.to_dict() for f in report.findings])

        async with db_pool.acquire() as conn:
            row_id = await conn.fetchval(
                """
                INSERT INTO loss_autopsies (
                    symbol, asset_class, direction, tier,
                    pnl_pct, exit_reason,
                    primary_failure_mode, actionable_lesson, severity,
                    synthesis_confidence, findings
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
                RETURNING id
                """,
                report.trade_symbol,
                report.trade_asset_class,
                report.trade_direction,
                report.trade_tier,
                report.trade_pnl_pct,
                report.trade_exit_reason,
                report.primary_failure_mode,
                report.actionable_lesson,
                report.severity,
                report.synthesis_confidence,
                findings_json,
            )
            logger.info(f"[Autopsy] Saved to DB: id={row_id}")
            return row_id
    except Exception as e:
        logger.error(f"[Autopsy] DB save error: {e}")
        return None


async def get_recent_autopsies(db_pool, limit: int = 20) -> List[Dict]:
    """Fetch recent autopsy reports from the database."""
    if db_pool is None:
        return []
    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, symbol, asset_class, direction, tier,
                       pnl_pct, exit_reason, primary_failure_mode,
                       actionable_lesson, severity, synthesis_confidence,
                       findings, timestamp
                FROM loss_autopsies
                ORDER BY timestamp DESC
                LIMIT $1
                """,
                limit,
            )
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"[Autopsy] DB fetch error: {e}")
        return []


async def get_failure_mode_patterns(db_pool, since_days: int = 30) -> List[Dict]:
    """Aggregate failure mode counts for pattern analysis."""
    if db_pool is None:
        return []
    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT primary_failure_mode,
                       COUNT(*) as count,
                       AVG(pnl_pct) as avg_pnl_pct,
                       AVG(synthesis_confidence) as avg_confidence,
                       array_agg(DISTINCT symbol) as symbols,
                       COUNT(CASE WHEN severity = 'severe' THEN 1 END) as severe_count,
                       COUNT(CASE WHEN severity = 'moderate' THEN 1 END) as moderate_count,
                       COUNT(CASE WHEN severity = 'minor' THEN 1 END) as minor_count
                FROM loss_autopsies
                WHERE timestamp > NOW() - INTERVAL '%s days'
                GROUP BY primary_failure_mode
                ORDER BY count DESC
                """ % since_days,
            )
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"[Autopsy] DB pattern fetch error: {e}")
        return []
