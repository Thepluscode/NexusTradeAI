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
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    print("FastAPI not installed. Run: pip install fastapi uvicorn")

import pandas as pd
import numpy as np

# Import strategies
from RegimeBasedMomentumStrategy import RegimeBasedMomentumStrategy, create_regime_momentum_strategy
from PairsTradingStrategy import PairsTradingStrategy, get_recommended_pairs
from VolatilityArbitrageStrategy import VolatilityArbitrageStrategy, create_volatility_strategy

# Import base types
from strategy_framework import MarketData, SignalType

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

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "strategy-bridge",
            "strategies": ["regime_momentum", "volatility_arbitrage", "pairs_trading"],
            "timestamp": datetime.now().isoformat()
        }

    @app.post("/signal", response_model=EnsembleResponse)
    def get_ensemble_signal(req: SignalRequest):
        """Get ensemble signal from all Python strategies"""
        if len(req.prices) < 30:
            raise HTTPException(status_code=400, detail="Need at least 30 price bars")

        market_data = prices_to_market_data(req.prices, req.symbol)
        strategies_results = []

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
                    reason=mom_signal.reason or "Regime momentum signal",
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
                    reason=vol_signal.reason or "Volatility signal",
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

        # Ensemble: weighted voting
        buy_score = 0
        sell_score = 0
        weights = {"regime_momentum": 0.6, "volatility_arbitrage": 0.4}

        for s in strategies_results:
            w = weights.get(s.strategy, 0.5)
            if s.signal == "BUY":
                buy_score += s.confidence * w
            elif s.signal == "SELL":
                sell_score += s.confidence * w

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
# STANDALONE SERVER
# ========================================

if __name__ == "__main__":
    if not FASTAPI_AVAILABLE:
        print("ERROR: FastAPI not installed. Run: pip install fastapi uvicorn")
        sys.exit(1)

    import uvicorn
    port = int(os.environ.get("STRATEGY_BRIDGE_PORT", 3010))
    print(f"\n🐍 Python Strategy Bridge starting on port {port}")
    print(f"   Strategies: regime_momentum, volatility_arbitrage, pairs_trading")
    print(f"   Health: http://localhost:{port}/health")
    print(f"   Signal: POST http://localhost:{port}/signal")
    print(f"   Pairs:  POST http://localhost:{port}/pairs/analyze\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
