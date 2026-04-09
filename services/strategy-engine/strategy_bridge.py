"""
NexusTradeAI - Python Strategy Bridge (FastAPI)
================================================

Exposes Python strategy signals via REST API for JavaScript bots.
Bridges: RegimeBasedMomentumStrategy, PairsTradingStrategy, VolatilityArbitrageStrategy

Usage:
    cd services/strategy-engine
    pip install fastapi uvicorn pandas numpy
    uvicorn strategy_bridge:app --port 3010

Endpoints:
    POST /signal         - Get ensemble signal from all Python strategies
    POST /pairs/analyze  - Analyze a pair for cointegration
    GET  /health         - Health check
"""

import sys
import os
import json
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    print("FastAPI not installed. Run: pip install fastapi uvicorn")

import pandas as pd
import numpy as np
from typing import Dict, List

# Import strategies
from RegimeBasedMomentumStrategy import RegimeBasedMomentumStrategy, create_regime_momentum_strategy
from PairsTradingStrategy import PairsTradingStrategy, get_recommended_pairs
from VolatilityArbitrageStrategy import VolatilityArbitrageStrategy, create_volatility_strategy
from ou_estimator import fit_ou_to_pair

# Import base types
from strategy_framework import MarketData, SignalType

# Import AI advisor (basic — kept for backward compat)
from ai_advisor import ai_advisor

# Import Agentic AI system (v4.1 — full multi-agent pipeline)
from agents.orchestrator import orchestrator as agent_orchestrator
from agents.base import MarketSnapshot, TradeOutcome, AgentDecision
from agents.sentiment_agent import SentimentAgent
from agents.supervisor_bandit import supervisor as agent_supervisor
from agents.backfill import backfill_from_db, backfill_from_json
from agents.analyst_rankings import analyst_rankings
from agents.portfolio_agent import portfolio_agent
from agents.macro_agent import macro_agent
from agents.institutional_agent import institutional_agent
from agents.autopsy_agent import get_recent_autopsies, get_failure_mode_patterns

# Import Public API (v6.0 — monetization layer)
from public_api_routes import router as public_api_router
from public_api import key_manager

# Import Stripe Billing (v6.1 — payments)
from stripe_billing import router as billing_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ========================================
# REQUEST / RESPONSE MODELS
# ========================================

class PriceBar(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = 0

class SignalRequest(BaseModel):
    symbol: str
    prices: List[PriceBar]
    asset_class: Optional[str] = "stock"

class PairAnalysisRequest(BaseModel):
    symbol_1: str
    symbol_2: str
    prices_1: List[PriceBar]
    prices_2: List[PriceBar]

class AIEvaluationRequest(BaseModel):
    symbol: str
    direction: str = "long"
    tier: str = "tier1"
    asset_class: str = "stock"
    price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
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
    bridge_direction: Optional[str] = None
    bridge_confidence: Optional[float] = None

class TradeOutcomeRequest(BaseModel):
    symbol: str
    asset_class: str = "stock"
    direction: str = "long"
    tier: str = "tier1"
    entry_price: float
    exit_price: float
    pnl: float
    pnl_pct: float
    r_multiple: float = 0.0
    hold_duration_minutes: float = 0.0
    exit_reason: str = "unknown"
    entry_rsi: Optional[float] = None
    entry_regime: Optional[str] = None
    entry_regime_quality: Optional[float] = None
    entry_momentum: Optional[float] = None
    entry_volume_ratio: Optional[float] = None
    entry_atr_pct: Optional[float] = None
    entry_score: Optional[float] = None
    agent_approved: Optional[bool] = None
    agent_confidence: Optional[float] = None
    agent_reason: Optional[str] = None
    decision_run_id: Optional[int] = None  # Links back to the agent decision
    bandit_arm: Optional[str] = None  # For supervisor bandit reward attribution

class TradeExecutionRequest(BaseModel):
    symbol: str
    asset_class: str = "stock"
    direction: str = "long"
    tier: str = "tier1"
    decision_run_id: Optional[int] = None
    fill_price: float
    intended_price: Optional[float] = None
    quantity: float = 0.0
    position_size_usd: float = 0.0
    strategy: str = ""
    agent_approved: Optional[bool] = None
    agent_confidence: Optional[float] = None

class StrategySignalResponse(BaseModel):
    strategy: str
    signal: str  # BUY, SELL, NEUTRAL
    confidence: float
    reason: str
    metadata: Dict[str, Any] = {}

class EnsembleResponse(BaseModel):
    symbol: str
    should_enter: bool
    direction: str  # long, short, neutral
    confidence: float
    reason: str
    strategies: List[StrategySignalResponse]
    timestamp: str

# ========================================
# STRATEGY INSTANCES
# ========================================

momentum_strategy = create_regime_momentum_strategy(use_pretrained_detector=False)
volatility_strategy = create_volatility_strategy(conservative=True)
pairs_strategy = PairsTradingStrategy()

# Price cache: symbol → {prices: last 100 closes, ts: epoch seconds}
# Entries older than CACHE_TTL_SECONDS are considered stale (e.g. after restart / redeploy)
CACHE_TTL_SECONDS = 3600  # 1 hour
_price_cache: Dict[str, Dict] = {}

# Known cointegrated pairs for ensemble voting.
# Each symbol maps to its companion — both directions listed so either symbol lookup works.
# Pairs selected for documented long-run cointegration and similar business exposure.
KNOWN_PAIRS = {
    # Energy — same commodity exposure (crude oil)
    'XOM': 'CVX', 'CVX': 'XOM',
    # Banks — same US macro exposure
    'JPM': 'BAC', 'BAC': 'JPM',
    # Big Tech — similar revenue mix
    'AAPL': 'MSFT', 'MSFT': 'AAPL',
    # Consumer staples — direct beverage competitors
    'KO': 'PEP', 'PEP': 'KO',
    # Home improvement retail — identical TAM
    'HD': 'LOW', 'LOW': 'HD',
    # Payment networks — same transaction infrastructure
    'V': 'MA', 'MA': 'V',
    # Investment banks — same market-making exposure
    'GS': 'MS', 'MS': 'GS',
    # Telecom — same US wireless duopoly
    'T': 'VZ', 'VZ': 'T',
    # Retail mass-market — same consumer base
    'WMT': 'TGT', 'TGT': 'WMT',
    # Precious metals ETFs — same underlying (gold/silver ratio mean-reverts)
    'GLD': 'SLV', 'SLV': 'GLD',
    # Index ETFs — QQQ/SPY spread is a classic mean-reverting risk-on/off spread
    'SPY': 'QQQ', 'QQQ': 'SPY',
    # Airlines — same fuel cost / demand exposure
    'DAL': 'UAL', 'UAL': 'DAL',
}

# ========================================
# HELPER FUNCTIONS
# ========================================

def prices_to_market_data(prices: List[PriceBar], symbol: str = "") -> List[MarketData]:
    """Convert API price bars to strategy framework MarketData"""
    result = []
    for p in prices:
        try:
            ts = datetime.fromisoformat(p.timestamp.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            ts = datetime.now()
        result.append(MarketData(
            symbol=symbol,
            timestamp=ts,
            open=p.open,
            high=p.high,
            low=p.low,
            close=p.close,
            volume=p.volume or 0
        ))
    return result

def signal_type_to_string(signal_type) -> str:
    """Convert SignalType enum to string"""
    if signal_type == SignalType.BUY:
        return "BUY"
    elif signal_type == SignalType.SELL:
        return "SELL"
    return "NEUTRAL"

# ========================================
# FASTAPI APP
# ========================================

if FASTAPI_AVAILABLE:
    app = FastAPI(
        title="NexusTradeAI Strategy Bridge",
        description="Python strategy signals for JavaScript trading bots",
        version="1.0.0"
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount Public API router (v6.0 — /api/v1/*)
    app.include_router(public_api_router)

    # Mount Stripe Billing router (v6.1 — /api/v1/billing/*)
    app.include_router(billing_router)

    @app.get("/health")
    def health():
        import time as _time
        cached_symbols = list(_price_cache.keys())
        pairs_ready = [
            f"{s}/{KNOWN_PAIRS[s]}"
            for s in cached_symbols
            if s in KNOWN_PAIRS and KNOWN_PAIRS[s] in _price_cache
            and (_time.time() - _price_cache[KNOWN_PAIRS[s]].get("ts", 0)) < CACHE_TTL_SECONDS
        ]
        # Deduplicate (XOM/CVX and CVX/XOM are the same pair)
        seen = set()
        unique_pairs = []
        for p in pairs_ready:
            key = tuple(sorted(p.split('/')))
            if key not in seen:
                seen.add(key)
                unique_pairs.append(p)
        return {
            "status": "ok",
            "service": "strategy-bridge",
            "strategies": ["regime_momentum", "volatility_arbitrage", "pairs_trading"],
            "ai_advisor": {"available": ai_advisor.is_available, "model": ai_advisor.model},
            "pairs_cache": {
                "symbols_cached": len(cached_symbols),
                "symbols": sorted(cached_symbols),
                "pairs_active": len(unique_pairs),
                "pairs": unique_pairs,
                "known_pairs_total": len(KNOWN_PAIRS) // 2,
            },
            "timestamp": datetime.now().isoformat()
        }

    @app.post("/signal", response_model=EnsembleResponse)
    def get_ensemble_signal(req: SignalRequest):
        """Get ensemble signal from all Python strategies"""
        if len(req.prices) < 30:
            raise HTTPException(status_code=400, detail="Need at least 30 price bars")

        market_data = prices_to_market_data(req.prices, req.symbol)
        strategies_results = []

        # Cache closes for pairs trading (with timestamp for TTL validation)
        import time as _time
        closes = [p.close for p in req.prices]
        _price_cache[req.symbol] = {"prices": closes[-100:], "ts": _time.time()}

        # Strategy 1: Regime-Based Momentum
        try:
            prices_series = pd.Series([p.close for p in market_data])
            momentum_strategy.update_regime(prices_series)
            mom_signal = momentum_strategy.generate_signal(market_data)

            if mom_signal:
                strategies_results.append(StrategySignalResponse(
                    strategy="regime_momentum",
                    signal=signal_type_to_string(mom_signal.signal_type),
                    confidence=mom_signal.confidence,
                    reason=getattr(mom_signal, 'reason', None) or "Regime momentum signal",
                    metadata={
                        "regime": str(momentum_strategy.current_regime),
                        "position_multiplier": momentum_strategy.get_position_size_multiplier()
                    }
                ))
            else:
                strategies_results.append(StrategySignalResponse(
                    strategy="regime_momentum",
                    signal="NEUTRAL",
                    confidence=0,
                    reason="No momentum signal"
                ))
        except Exception as e:
            logger.error(f"Momentum strategy error: {e}")
            strategies_results.append(StrategySignalResponse(
                strategy="regime_momentum",
                signal="NEUTRAL",
                confidence=0,
                reason=f"Error: {str(e)}"
            ))

        # Strategy 2: Volatility Arbitrage
        try:
            vol_signal = volatility_strategy.generate_signal(market_data)
            if vol_signal:
                strategies_results.append(StrategySignalResponse(
                    strategy="volatility_arbitrage",
                    signal=signal_type_to_string(vol_signal.signal_type),
                    confidence=vol_signal.confidence,
                    reason=getattr(vol_signal, 'reason', None) or "Volatility signal",
                    metadata={}
                ))
            else:
                strategies_results.append(StrategySignalResponse(
                    strategy="volatility_arbitrage",
                    signal="NEUTRAL",
                    confidence=0,
                    reason="No volatility signal"
                ))
        except Exception as e:
            logger.error(f"Volatility strategy error: {e}")
            strategies_results.append(StrategySignalResponse(
                strategy="volatility_arbitrage",
                signal="NEUTRAL",
                confidence=0,
                reason=f"Error: {str(e)}"
            ))

        # Strategy 3: Pairs Trading (only when companion price data is cached and fresh)
        companion = KNOWN_PAIRS.get(req.symbol)
        import time as _time
        companion_entry = _price_cache.get(companion) if companion else None
        companion_fresh = (
            companion_entry is not None and
            isinstance(companion_entry, dict) and
            (_time.time() - companion_entry.get("ts", 0)) < CACHE_TTL_SECONDS
        )
        if companion and companion_fresh:
            try:
                s1 = pd.Series(closes)
                s2 = pd.Series(companion_entry["prices"])
                min_len = min(len(s1), len(s2))
                if min_len >= 30:
                    ou = fit_ou_to_pair(s1.tail(min_len).reset_index(drop=True),
                                        s2.tail(min_len).reset_index(drop=True))
                    if ou['status'] == 'fitted' and ou['is_mean_reverting']:
                        half_life = ou['half_life']
                        # Only act on pairs that revert within 45 days — longer half-lives
                        # mean the spread may never close within our hold period.
                        # 45d allows pairs that revert in ~6 weeks while still filtering
                        # pairs that are effectively non-stationary (>45d half-life).
                        if half_life > 45:
                            strategies_results.append(StrategySignalResponse(
                                strategy="pairs_trading", signal="NEUTRAL", confidence=0,
                                reason=f"Half-life {half_life:.1f}d too long (>45d) — spread unlikely to close"
                            ))
                        else:
                            z = ou['z_score']
                            sig = 'BUY' if ou['trade_signal'] == 'LONG_SPREAD' else \
                                  'SELL' if ou['trade_signal'] == 'SHORT_SPREAD' else 'NEUTRAL'
                            # Confidence: z-score strength × half-life speed factor
                            # Short half-life + large z-score → high confidence
                            hl_factor = min(1.0, 15.0 / max(half_life, 1))
                            conf = min(0.85, (0.5 + abs(z) * 0.1) * hl_factor) if sig != 'NEUTRAL' else 0
                            strategies_results.append(StrategySignalResponse(
                                strategy="pairs_trading", signal=sig, confidence=conf,
                                reason=f"OU pairs {req.symbol}/{companion}: z={z:.2f} hl={half_life:.1f}d",
                                metadata={'z_score': z, 'half_life': half_life, 'companion': companion}
                            ))
                    else:
                        strategies_results.append(StrategySignalResponse(
                            strategy="pairs_trading", signal="NEUTRAL", confidence=0,
                            reason=f"Pair not mean-reverting ({ou.get('status','')})"
                        ))
            except Exception as e:
                logger.error(f"Pairs trading error: {e}")
                strategies_results.append(StrategySignalResponse(
                    strategy="pairs_trading", signal="NEUTRAL", confidence=0, reason=f"Error: {e}"
                ))

        # Ensemble: weighted voting — skip any signal with non-finite confidence to prevent
        # a single corrupted strategy (NaN/inf from degenerate OU fit) poisoning the whole ensemble.
        import math as _math
        buy_score = 0
        sell_score = 0
        weights = {"regime_momentum": 0.50, "volatility_arbitrage": 0.30, "pairs_trading": 0.20}

        for s in strategies_results:
            conf = s.confidence or 0
            if not _math.isfinite(conf) or conf < 0 or conf > 1:
                logger.warning(f"Skipping strategy {s.strategy}: invalid confidence {conf}")
                continue
            w = weights.get(s.strategy, 0.5)
            if s.signal == "BUY":
                buy_score += conf * w
            elif s.signal == "SELL":
                sell_score += conf * w

        total = buy_score + sell_score
        if total > 0:
            buy_score /= total
            sell_score /= total

        should_enter = False
        direction = "neutral"
        confidence = 0
        reason = "No consensus"

        if buy_score > 0.55:
            should_enter = True
            direction = "long"
            confidence = buy_score
            reasons = [s.reason for s in strategies_results if s.signal == "BUY"]
            reason = f"Python Ensemble LONG: {'; '.join(reasons)}"
        elif sell_score > 0.55:
            should_enter = True
            direction = "short"
            confidence = sell_score
            reasons = [s.reason for s in strategies_results if s.signal == "SELL"]
            reason = f"Python Ensemble SHORT: {'; '.join(reasons)}"

        return EnsembleResponse(
            symbol=req.symbol,
            should_enter=should_enter,
            direction=direction,
            confidence=confidence,
            reason=reason,
            strategies=strategies_results,
            timestamp=datetime.now().isoformat()
        )

    @app.post("/pairs/analyze")
    def analyze_pair(req: PairAnalysisRequest):
        """Analyze a pair for trading opportunities"""
        if len(req.prices_1) < 30 or len(req.prices_2) < 30:
            raise HTTPException(status_code=400, detail="Need at least 30 price bars per symbol")

        prices_1 = pd.Series([p.close for p in req.prices_1])
        prices_2 = pd.Series([p.close for p in req.prices_2])

        pair_state = pairs_strategy.analyze_pair(
            req.symbol_1, prices_1,
            req.symbol_2, prices_2
        )

        if pair_state is None:
            return {
                "is_cointegrated": False,
                "reason": "Pair does not meet cointegration requirements"
            }

        return {
            "symbol_1": pair_state.symbol_1,
            "symbol_2": pair_state.symbol_2,
            "is_cointegrated": pair_state.is_cointegrated,
            "hedge_ratio": pair_state.hedge_ratio,
            "z_score": pair_state.z_score,
            "half_life": pair_state.half_life,
            "correlation": pair_state.correlation,
            "spread": pair_state.spread,
            "signal": "LONG_SPREAD" if pair_state.z_score < -2.0
                     else "SHORT_SPREAD" if pair_state.z_score > 2.0
                     else "NEUTRAL"
        }

    @app.get("/pairs/recommended")
    def recommended_pairs():
        """Get pre-defined sector pairs for trading"""
        return get_recommended_pairs()

    # ========================================
    # AI ADVISOR ENDPOINTS
    # ========================================

    @app.post("/ai/evaluate")
    async def ai_evaluate(req: AIEvaluationRequest):
        """Evaluate a trade signal using Claude AI advisor."""
        try:
            signal_dict = req.model_dump(exclude_none=True)
            result = await ai_advisor.evaluate(signal_dict)
            return {
                "symbol": req.symbol,
                "direction": req.direction,
                "tier": req.tier,
                **result,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"AI evaluate error for {req.symbol}: {e}")
            return {
                "approved": False,
                "confidence": 0.0,
                "reason": f"Agent error: {str(e)}",
                "source": "error_fallback",
                "risk_flags": ["agent_error"],
                "position_size_multiplier": 0,
            }

    @app.get("/ai/stats")
    def ai_stats():
        """Get AI advisor statistics (basic + agentic)."""
        return {
            "ai_advisor": ai_advisor.get_stats(),
            "timestamp": datetime.now().isoformat()
        }

    # ========================================
    # AGENTIC AI ENDPOINTS (v4.1)
    # ========================================

    @app.post("/agent/evaluate")
    async def agent_evaluate(req: AIEvaluationRequest):
        """
        Full agentic pipeline evaluation.
        KillSwitch → MarketAgent → DecisionAgent(+lessons) → SafetyGuardrails
        """
        try:
            snapshot = MarketSnapshot(
                symbol=req.symbol,
                asset_class=req.asset_class,
                price=req.price or 0,
                direction=req.direction,
                tier=req.tier,
                rsi=req.rsi,
                momentum=req.momentum,
                percent_change=req.percent_change,
                volume_ratio=req.volume_ratio,
                trend_strength=req.trend_strength,
                atr_pct=req.atr_pct,
                vwap=req.vwap,
                h1_trend=req.h1_trend,
                session=req.session,
                regime=req.regime,
                regime_quality=req.regime_quality,
                macd_histogram=req.macd_histogram,
                score=req.score,
                stop_loss=req.stop_loss if hasattr(req, 'stop_loss') else None,
                take_profit=req.take_profit if hasattr(req, 'take_profit') else None,
                bridge_direction=req.bridge_direction,
                bridge_confidence=req.bridge_confidence,
            )
            decision = await agent_orchestrator.evaluate_signal(snapshot)
            return {
                "symbol": req.symbol,
                "direction": req.direction,
                "tier": req.tier,
                "approved": decision.approved,
                "confidence": decision.confidence,
                "reason": decision.reason,
                "risk_flags": decision.risk_flags,
                "position_size_multiplier": decision.position_size_multiplier,
                "adjusted_stop": decision.adjusted_stop,
                "market_regime": decision.market_regime,
                "lessons_applied": decision.lessons_applied,
                "source": decision.source,
                "agents_consulted": decision.agents_consulted,
                "decision_run_id": decision.decision_run_id,  # Bots pass this back with trade-outcome
                "bandit_arm": getattr(decision, 'bandit_arm', 'moderate'),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Agent evaluate error for {req.symbol}: {e}")
            return {
                "approved": False,
                "confidence": 0.0,
                "reason": f"Agent error: {str(e)}",
                "source": "error_fallback",
                "risk_flags": ["agent_error"],
                "position_size_multiplier": 0,
            }

    @app.post("/agent/trade-outcome")
    async def agent_trade_outcome(req: TradeOutcomeRequest):
        """Report a completed trade for learning and pattern tracking."""
        try:
            outcome = TradeOutcome(
                symbol=req.symbol,
                asset_class=req.asset_class,
                direction=req.direction,
                tier=req.tier,
                entry_price=req.entry_price,
                exit_price=req.exit_price,
                pnl=req.pnl,
                pnl_pct=req.pnl_pct,
                r_multiple=req.r_multiple,
                hold_duration_minutes=req.hold_duration_minutes,
                exit_reason=req.exit_reason,
                entry_rsi=req.entry_rsi,
                entry_regime=req.entry_regime,
                entry_regime_quality=req.entry_regime_quality,
                entry_momentum=req.entry_momentum,
                entry_volume_ratio=req.entry_volume_ratio,
                entry_atr_pct=req.entry_atr_pct,
                entry_score=req.entry_score,
                agent_approved=req.agent_approved,
                agent_confidence=req.agent_confidence,
                agent_reason=req.agent_reason,
                decision_run_id=req.decision_run_id,  # Links outcome → decision
                bandit_arm=req.bandit_arm,  # For correct reward attribution
                timestamp=datetime.now().isoformat(),
            )
            await agent_orchestrator.record_trade_outcome(outcome)
            return {
                "status": "recorded",
                "symbol": req.symbol,
                "pnl_pct": req.pnl_pct,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Trade outcome recording error for {req.symbol}: {e}")
            return {
                "status": "error",
                "symbol": req.symbol,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @app.post("/agent/execution")
    async def agent_execution(req: TradeExecutionRequest):
        """Report a trade execution (bot confirmed fill from broker)."""
        try:
            snapshot = MarketSnapshot(
                symbol=req.symbol,
                asset_class=req.asset_class,
                price=req.intended_price or req.fill_price,
                direction=req.direction,
                tier=req.tier,
            )
            from agents.outcome_store import outcome_store
            execution_id = await outcome_store.log_execution(
                decision_run_id=req.decision_run_id,
                snapshot=snapshot,
                fill_price=req.fill_price,
                quantity=req.quantity,
                position_size_usd=req.position_size_usd,
                strategy=req.strategy,
            )
            return {
                "status": "recorded",
                "execution_id": execution_id,
                "symbol": req.symbol,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Execution recording error for {req.symbol}: {e}")
            return {
                "status": "error",
                "symbol": req.symbol,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

    @app.get("/agent/stats")
    def agent_stats():
        """Full agentic system statistics."""
        try:
            return {
                **agent_orchestrator.get_stats(),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"[/agent/stats] {e}", exc_info=True)
            return {"error": str(e), "fallback": True, "timestamp": datetime.now().isoformat()}

    @app.get("/agent/debug-claude")
    async def agent_debug_claude(request: Request):
        """Debug endpoint: test Claude call directly. Requires x-api-secret header."""
        api_secret = os.environ.get("NEXUS_API_SECRET", "")
        req_secret = request.headers.get("x-api-secret", "")
        if api_secret and req_secret != api_secret:
            return {"error": "Unauthorized", "detail": "Provide x-api-secret header"}
        from agents.claude_client import TRADE_DECISION_TOOL
        import traceback
        client = agent_orchestrator._client
        result = {
            "available": client.available,
            "model": client.model,
            "api_key_set": bool(client.api_key),
            "api_key_prefix": client.api_key[:12] + "..." if client.api_key else "NONE",
        }
        if client.available:
            # Test 1: Direct synchronous call (bypass async wrapper)
            try:
                import anthropic
                direct_client = anthropic.Anthropic(api_key=client.api_key)
                response = direct_client.messages.create(
                    model=client.model,
                    max_tokens=200,
                    system="You are a test. Approve the trade.",
                    messages=[{"role": "user", "content": "TEST: BUY BTCUSD at 68000. Good trade?"}],
                    tools=[TRADE_DECISION_TOOL],
                    tool_choice={"type": "tool", "name": TRADE_DECISION_TOOL["name"]}
                )
                # Extract tool_use
                tool_result = None
                for block in response.content:
                    if block.type == "tool_use":
                        tool_result = block.input
                result["direct_call_success"] = True
                result["direct_call_result"] = tool_result
                result["response_stop_reason"] = response.stop_reason
                result["response_content_types"] = [b.type for b in response.content]
            except Exception as e:
                result["direct_call_success"] = False
                result["direct_call_error"] = str(e)
                result["direct_call_traceback"] = traceback.format_exc()[-500:]

            # Test 2: Async wrapper (the actual code path)
            try:
                test_result = await client.call_with_tool(
                    system="You are a test. Approve the trade.",
                    user_message="TEST: BUY BTCUSD at 68000. Good trade?",
                    tool=TRADE_DECISION_TOOL,
                    timeout_seconds=15
                )
                result["async_call_success"] = test_result is not None
                result["async_call_result"] = test_result
            except Exception as e:
                result["async_call_success"] = False
                result["async_call_error"] = str(e)
        return result

    @app.post("/agent/kill")
    def agent_kill(reason: str = "Manual kill via API"):
        """Activate the kill switch — stops all agent approvals."""
        agent_orchestrator.kill_switch.kill(reason)
        return {"status": "killed", "reason": reason}

    @app.post("/agent/resume")
    def agent_resume():
        """Deactivate the kill switch — resume agent evaluations."""
        agent_orchestrator.kill_switch.resume()
        return {"status": "resumed"}

    # ========================================
    # SENTIMENT AGENT ENDPOINT
    # ========================================

    @app.get("/agent/sentiment/{symbol}")
    async def agent_sentiment(symbol: str, asset_class: str = "stock"):
        """
        Test endpoint: fetch and score news sentiment for a symbol.
        Query param: ?asset_class=stock|forex|crypto (default: stock)
        """
        try:
            sentiment = await agent_orchestrator.sentiment_agent.analyze(
                symbol=symbol,
                asset_class=asset_class,
            )
            return {
                "symbol": symbol,
                "asset_class": asset_class,
                "sentiment_score": sentiment.sentiment_score,
                "sentiment_label": sentiment.sentiment_label,
                "headline_count": sentiment.headline_count,
                "top_headlines": sentiment.top_headlines,
                "bullish_count": sentiment.bullish_count,
                "bearish_count": sentiment.bearish_count,
                "cached": sentiment.cached,
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/sentiment/{symbol}] {e}", exc_info=True)
            return {
                "error": str(e), "fallback": True,
                "symbol": symbol, "asset_class": asset_class,
                "sentiment_score": 0.0, "sentiment_label": "neutral",
                "headline_count": 0, "top_headlines": [],
                "bullish_count": 0, "bearish_count": 0,
                "cached": False, "timestamp": datetime.now().isoformat(),
            }

    # ========================================
    # SUPERVISOR BANDIT ENDPOINTS (v4.2)
    # ========================================

    class BanditQueryRequest(BaseModel):
        regime: str = "unknown"
        asset_class: str = "stock"
        tier: str = "tier1"

    @app.post("/agent/bandit/select")
    def bandit_select(req: BanditQueryRequest):
        """Query the supervisor bandit for the optimal arm in a given context."""
        try:
            rec = agent_supervisor.select_arm(
                regime=req.regime,
                asset_class=req.asset_class,
                tier=req.tier,
            )
            return {
                **rec.to_dict(),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/bandit/select] {e}", exc_info=True)
            return {
                "error": str(e), "fallback": True,
                "arm": "approve", "confidence": 0.5,
                "regime": req.regime, "asset_class": req.asset_class, "tier": req.tier,
                "timestamp": datetime.now().isoformat(),
            }

    @app.post("/agent/bandit/context")
    def bandit_context_detail(req: BanditQueryRequest):
        """Get detailed arm distributions for a specific context."""
        try:
            return {
                **agent_supervisor.get_context_detail(req.regime, req.asset_class, req.tier),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/bandit/context] {e}", exc_info=True)
            return {
                "error": str(e), "fallback": True,
                "regime": req.regime, "asset_class": req.asset_class, "tier": req.tier,
                "arms": {}, "timestamp": datetime.now().isoformat(),
            }

    @app.get("/agent/bandit/stats")
    def bandit_stats():
        """Full supervisor bandit statistics."""
        try:
            return {
                **agent_supervisor.get_stats(),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/bandit/stats] {e}", exc_info=True)
            return {"error": str(e), "fallback": True, "timestamp": datetime.now().isoformat()}

    @app.post("/agent/bandit/sync")
    async def bandit_sync_db():
        """Sync bandit state to PostgreSQL."""
        await agent_supervisor.sync_to_db()
        return {"status": "synced", "timestamp": datetime.now().isoformat()}

    @app.post("/agent/bandit/train")
    async def bandit_train():
        """
        Train the bandit from recent rewards in the outcome store.
        Call this periodically (e.g. daily) to update arm distributions.
        """
        from agents.outcome_store import outcome_store
        rewards = await outcome_store.get_recent_rewards(limit=100)
        updated = agent_supervisor.batch_update_from_rewards(rewards)
        await agent_supervisor.sync_to_db()
        return {
            "status": "trained",
            "rewards_processed": updated,
            "bandit_stats": agent_supervisor.get_stats(),
            "timestamp": datetime.now().isoformat(),
        }

    # ========================================
    # BACKFILL + PERIODIC TRAINING (v4.2)
    # ========================================

    class BackfillRequest(BaseModel):
        limit: int = 500
        since_days: int = 90
        bot_db_url: Optional[str] = None

    class TradeRecord(BaseModel):
        bot: str = "stock"
        symbol: str
        direction: str = "long"
        tier: Optional[str] = "tier1"
        strategy: Optional[str] = None
        regime: Optional[str] = None
        entry_price: float
        exit_price: float
        pnl_usd: Optional[float] = None
        pnl_pct: Optional[float] = None
        stop_loss: Optional[float] = None
        take_profit: Optional[float] = None
        entry_time: Optional[str] = None
        exit_time: Optional[str] = None
        close_reason: Optional[str] = None
        rsi: Optional[float] = None
        volume_ratio: Optional[float] = None
        momentum_pct: Optional[float] = None
        signal_score: Optional[float] = None
        entry_context: Optional[Dict[str, Any]] = None

    class BackfillJsonRequest(BaseModel):
        trades: List[TradeRecord]

    @app.post("/agent/backfill")
    async def agent_backfill(req: BackfillRequest):
        """
        Backfill historical trades from the DB into the outcome store + bandit.
        Reads closed trades from the bots' `trades` table.
        """
        stats = await backfill_from_db(
            bot_db_url=req.bot_db_url,
            limit=req.limit,
            since_days=req.since_days,
            scan_engine=agent_orchestrator.scan_engine,
            learning_agent=agent_orchestrator.learning_agent,
        )
        return {
            **stats,
            "bandit_stats": agent_supervisor.get_stats(),
            "timestamp": datetime.now().isoformat(),
        }

    @app.post("/agent/backfill/json")
    async def agent_backfill_json(req: BackfillJsonRequest):
        """
        Backfill trades pushed as JSON from bots.
        Use when bridge DB differs from bot DB.
        """
        trades = [t.model_dump() for t in req.trades]
        stats = await backfill_from_json(trades)
        return {
            **stats,
            "bandit_stats": agent_supervisor.get_stats(),
            "timestamp": datetime.now().isoformat(),
        }

    @app.post("/agent/daily-training")
    async def agent_daily_training():
        """
        Combined daily training routine:
        1. Backfill any new trades from DB (last 2 days)
        2. Train bandit from accumulated rewards
        3. Sync state to DB

        Call this from a cron job or Railway cron.
        """
        # Step 1: Backfill recent trades (with scan engine for pattern learning)
        backfill_stats = await backfill_from_db(
            limit=100, since_days=2,
            scan_engine=agent_orchestrator.scan_engine,
            learning_agent=agent_orchestrator.learning_agent,
        )

        # Step 2: Train bandit from all rewards
        from agents.outcome_store import outcome_store
        rewards = await outcome_store.get_recent_rewards(limit=200)
        bandit_updates = agent_supervisor.batch_update_from_rewards(rewards)

        # Step 3: Sync to DB
        await agent_supervisor.sync_to_db()

        # Step 4: Update analyst rankings
        rankings_result = await analyst_rankings.update_rankings(lookback_days=30)

        return {
            "status": "daily_training_complete",
            "backfill": backfill_stats,
            "bandit_rewards_processed": bandit_updates,
            "bandit_stats": agent_supervisor.get_stats(),
            "rankings": rankings_result,
            "timestamp": datetime.now().isoformat(),
        }

    # ========================================
    # ANALYST RANKINGS + DECISION HISTORY (v4.3)
    # ========================================

    @app.get("/agent/rankings")
    async def get_rankings():
        """Get analyst rankings by regime and asset class."""
        try:
            return {
                **analyst_rankings.get_stats(),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/rankings] {e}", exc_info=True)
            return {"error": str(e), "fallback": True, "rankings": {}, "timestamp": datetime.now().isoformat()}

    @app.post("/agent/rankings/update")
    async def update_rankings():
        """Recompute analyst rankings from the last 30 days of data."""
        result = await analyst_rankings.update_rankings(lookback_days=30)
        return {
            **result,
            "stats": analyst_rankings.get_stats(),
            "timestamp": datetime.now().isoformat(),
        }

    @app.get("/agent/decisions")
    async def get_decisions(limit: int = 50):
        """Get recent agent decisions with outcomes for dashboard display."""
        try:
            decisions = await analyst_rankings.get_recent_decisions(limit=limit)
            # Convert datetime objects to strings for JSON serialization
            for d in decisions:
                for k, v in d.items():
                    if hasattr(v, 'isoformat'):
                        d[k] = v.isoformat()
            return {
                "decisions": decisions,
                "total": len(decisions),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/decisions] {e}", exc_info=True)
            return {"error": str(e), "fallback": True, "decisions": [], "total": 0, "timestamp": datetime.now().isoformat()}

    # ========================================
    # PORTFOLIO RISK (v4.5)
    # ========================================

    @app.get("/agent/portfolio")
    async def get_portfolio_risk():
        """Get current portfolio risk snapshot across all bots."""
        try:
            snapshot = await portfolio_agent._get_portfolio_snapshot()
            return {
                "total_positions": snapshot.get('total', 0),
                "by_asset_class": snapshot.get('by_class', {}),
                "currency_exposure": snapshot.get('currency_net', {}),
                "daily_pnl": snapshot.get('daily_pnl', 0.0),
                "stats": portfolio_agent.get_stats(),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/portfolio] {e}", exc_info=True)
            return {
                "error": str(e), "fallback": True,
                "total_positions": 0, "by_asset_class": {},
                "currency_exposure": {}, "daily_pnl": 0.0,
                "stats": {}, "timestamp": datetime.now().isoformat(),
            }

    class PortfolioCheckRequest(BaseModel):
        symbol: str
        asset_class: str
        direction: str = 'long'

    @app.post("/agent/portfolio/check")
    async def check_portfolio_risk(req: PortfolioCheckRequest):
        """Check if a proposed trade passes portfolio risk checks."""
        result = await portfolio_agent.check_risk(
            new_symbol=req.symbol,
            new_asset_class=req.asset_class,
            new_direction=req.direction,
        )
        return {
            "blocked": result.blocked,
            "risk_flags": result.risk_flags,
            "size_cap": result.size_cap,
            "total_positions": result.total_positions,
            "positions_by_class": result.positions_by_class,
            "currency_exposure": result.currency_exposure,
            "timestamp": datetime.now().isoformat(),
        }

    # ========================================
    # MACRO REGIME + INSTITUTIONAL FLOW ENDPOINTS (v8.0)
    # ========================================

    @app.get("/agent/macro")
    async def get_macro_regime(asset_class: str = "stock"):
        """Get current macro regime assessment (VIX, yield curve, DXY)."""
        try:
            result = await macro_agent.analyze(asset_class)
            return result.to_dict()
        except Exception as e:
            logger.error(f"[/agent/macro] {e}", exc_info=True)
            return {
                "error": str(e), "fallback": True,
                "regime": "neutral", "confidence": 0.0,
                "asset_class": asset_class,
                "timestamp": datetime.now().isoformat(),
            }

    @app.get("/agent/institutional/{symbol}")
    async def get_institutional_flow(symbol: str):
        """Get institutional positioning for a stock symbol (13F data)."""
        try:
            result = await institutional_agent.analyze(symbol)
            return result.to_dict()
        except Exception as e:
            logger.error(f"[/agent/institutional/{symbol}] {e}", exc_info=True)
            return {
                "error": str(e), "fallback": True,
                "symbol": symbol, "flow": {},
                "timestamp": datetime.now().isoformat(),
            }

    # ========================================
    # POST-LOSS AUTOPSY ENDPOINTS (v7.1)
    # ========================================

    @app.get("/agent/autopsies")
    async def get_autopsies(limit: int = 20):
        """Get recent post-loss autopsy reports."""
        try:
            from agents.outcome_store import outcome_store
            pool = await outcome_store._get_pool()
            autopsies = await get_recent_autopsies(pool, limit=limit)
            # Convert datetime objects to strings for JSON serialization
            for a in autopsies:
                for k, v in a.items():
                    if hasattr(v, 'isoformat'):
                        a[k] = v.isoformat()
            return {
                "autopsies": autopsies,
                "total": len(autopsies),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/autopsies] {e}", exc_info=True)
            return {"error": str(e), "fallback": True, "autopsies": [], "total": 0, "timestamp": datetime.now().isoformat()}

    @app.get("/agent/autopsies/patterns")
    async def get_autopsy_patterns(since_days: int = 30):
        """Get aggregate failure mode counts from post-loss autopsies."""
        try:
            from agents.outcome_store import outcome_store
            pool = await outcome_store._get_pool()
            patterns = await get_failure_mode_patterns(pool, since_days=since_days)
            # Convert datetime objects and special types for JSON serialization
            for p in patterns:
                for k, v in p.items():
                    if hasattr(v, 'isoformat'):
                        p[k] = v.isoformat()
                    elif hasattr(v, '__float__'):
                        p[k] = float(v)
            return {
                "patterns": patterns,
                "since_days": since_days,
                "total_failure_modes": len(patterns),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"[/agent/autopsies/patterns] {e}", exc_info=True)
            return {
                "error": str(e), "fallback": True,
                "patterns": [], "since_days": since_days,
                "total_failure_modes": 0, "timestamp": datetime.now().isoformat(),
            }

    # ========================================
    # BACKGROUND DAILY TRAINING LOOP
    # ========================================

    import asyncio

    _training_task = None

    async def _daily_training_loop():
        """Run daily training every 6 hours in the background."""
        await asyncio.sleep(60)  # Wait 1 min after startup
        while True:
            try:
                logger.info("[DailyTraining] Starting scheduled training run...")
                backfill_stats = await backfill_from_db(limit=100, since_days=2)
                from agents.outcome_store import outcome_store
                rewards = await outcome_store.get_recent_rewards(limit=200)
                updated = agent_supervisor.batch_update_from_rewards(rewards)
                await agent_supervisor.sync_to_db()
                # Sync patterns + lessons to DB (persist across redeploys)
                await agent_orchestrator.scan_engine.sync_to_db()
                await agent_orchestrator.learning_agent.sync_to_db()
                # Update analyst rankings
                await analyst_rankings.update_rankings(lookback_days=30)
                # Reset API key daily counters
                await key_manager.reset_daily_counters()
                logger.info(
                    f"[DailyTraining] Done: backfilled {backfill_stats.get('trades_processed', 0)} trades, "
                    f"bandit updated {updated} rewards, "
                    f"{len(agent_orchestrator.scan_engine.patterns)} patterns synced, "
                    f"{len(agent_orchestrator.learning_agent._recent_lessons)} lessons synced, "
                    f"rankings refreshed"
                )
            except Exception as e:
                logger.error(f"[DailyTraining] Error: {e}")
            await asyncio.sleep(6 * 3600)  # Every 6 hours

    @app.on_event("startup")
    async def start_training_loop():
        global _training_task

        # v5.1: Auto-recover learning data from DB on startup (survives redeploys)
        try:
            logger.info("[Startup] Recovering learning data from DB...")
            await agent_orchestrator.learning_agent.load_from_db()
            await agent_orchestrator.scan_engine.load_from_db()
            await agent_supervisor.load_from_db()
            logger.info(
                f"[Startup] Recovery complete: "
                f"{len(agent_orchestrator.learning_agent._recent_lessons)} lessons, "
                f"{len(agent_orchestrator.scan_engine.patterns)} patterns, "
                f"{len(agent_supervisor._state)} bandit contexts"
            )
        except Exception as e:
            logger.error(f"[Startup] DB recovery error (non-fatal): {e}")

        # v6.0: Ensure public API tables exist
        try:
            await key_manager._get_pool()
            logger.info("[Startup] Public API tables ready")
        except Exception as e:
            logger.error(f"[Startup] Public API table init error (non-fatal): {e}")

        # v8.0: Warm up macro + institutional data caches (background)
        async def _warmup_data_agents():
            try:
                await macro_agent.warmup()
                logger.info("[Startup] Macro agent warmed up")
            except Exception as e:
                logger.error(f"[Startup] Macro warmup error (non-fatal): {e}")
            try:
                await institutional_agent.warmup()
                logger.info("[Startup] Institutional agent ready")
            except Exception as e:
                logger.error(f"[Startup] Institutional warmup error (non-fatal): {e}")

        asyncio.create_task(_warmup_data_agents())

        _training_task = asyncio.create_task(_daily_training_loop())
        logger.info("Background daily training loop scheduled (every 6h)")

# ========================================
# STANDALONE SERVER
# ========================================

if __name__ == "__main__":
    if not FASTAPI_AVAILABLE:
        print("ERROR: FastAPI not installed. Run: pip install fastapi uvicorn")
        sys.exit(1)

    import uvicorn
    port = int(os.environ.get("STRATEGY_BRIDGE_PORT", 3010))
    ai_status = 'ENABLED' if ai_advisor.is_available else 'DISABLED (set ANTHROPIC_API_KEY)'
    print(f"\n🐍 Python Strategy Bridge starting on port {port}")
    print(f"   Strategies:  regime_momentum, volatility_arbitrage, pairs_trading")
    print(f"   AI Advisor:  {ai_status}")
    print(f"   Agent System: ACTIVE (multi-agent pipeline with Scan AI)")
    print(f"   Health:       http://localhost:{port}/health")
    print(f"   Signal:       POST http://localhost:{port}/signal")
    print(f"   Agent Eval:   POST http://localhost:{port}/agent/evaluate")
    print(f"   Agent Learn:  POST http://localhost:{port}/agent/trade-outcome")
    print(f"   Agent Stats:  GET  http://localhost:{port}/agent/stats")
    print(f"   Agent Kill:   POST http://localhost:{port}/agent/kill")
    print(f"   Agent Resume: POST http://localhost:{port}/agent/resume")
    print(f"   Sentiment:    GET  http://localhost:{port}/agent/sentiment/{{symbol}}")
    print(f"   Bandit Select:POST http://localhost:{port}/agent/bandit/select")
    print(f"   Bandit Stats: GET  http://localhost:{port}/agent/bandit/stats")
    print(f"   Bandit Train: POST http://localhost:{port}/agent/bandit/train")
    print(f"   Backfill:     POST http://localhost:{port}/agent/backfill")
    print(f"   Daily Train:  POST http://localhost:{port}/agent/daily-training")
    print(f"   Autopsies:    GET  http://localhost:{port}/agent/autopsies")
    print(f"   Autopsy Ptns: GET  http://localhost:{port}/agent/autopsies/patterns")
    print(f"   Pairs:        POST http://localhost:{port}/pairs/analyze")
    print(f"   ─── Public API (v6.0) ───")
    print(f"   Evaluate:     POST http://localhost:{port}/api/v1/evaluate")
    print(f"   Keys:         POST http://localhost:{port}/api/v1/keys")
    print(f"   Usage:        GET  http://localhost:{port}/api/v1/usage\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
# Deploy: 20260313T161421Z
