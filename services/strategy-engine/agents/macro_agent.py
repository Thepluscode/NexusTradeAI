"""
Macro Regime Agent
==================

Fetches macro indicators (VIX, yield curve, DXY) and computes a macro regime
score that influences trade decisions. Uses yfinance for US market data
and AKShare for broader international/macro data.

Pipeline position: Between SentimentAgent and DecisionAgent in the orchestrator.

Features:
- VIX level + percentile scoring
- 10Y-2Y yield curve spread (recession signal)
- DXY dollar index trend (impacts forex/crypto)
- 1-hour TTL cache (macro moves slowly)
- Fail-open: returns neutral if data sources fail
- Asset-class-aware weighting
"""

import logging
import time
import os
from dataclasses import dataclass, field, asdict
from typing import Dict, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

# ========================================
# MACRO RESULT
# ========================================

@dataclass
class MacroRegimeResult:
    regime: str                # risk_on, neutral, risk_off
    regime_score: float        # -1.0 (extreme risk-off) to 1.0 (extreme risk-on)
    vix: float                 # Current VIX level
    vix_percentile: float      # 0-100 where VIX sits vs recent history
    yield_spread_10y2y: float  # 10Y-2Y spread (negative = inverted)
    dxy: float                 # Dollar index level
    dxy_trend: str             # strengthening, stable, weakening
    components: Dict[str, float]  # Individual indicator scores
    cached: bool
    last_updated: str          # ISO timestamp

    def to_dict(self) -> Dict:
        return asdict(self)


# ========================================
# MACRO AGENT
# ========================================

class MacroAgent:
    """
    Fetches macro indicators and scores the macro environment.
    1-hour cache. Fail-open: returns neutral on any error.
    """

    CACHE_TTL = 3600  # 1 hour

    # Asset-class weights for each indicator
    WEIGHTS = {
        "stock":  {"vix": 0.40, "yield_curve": 0.30, "dxy": 0.30},
        "forex":  {"vix": 0.20, "yield_curve": 0.20, "dxy": 0.60},
        "crypto": {"vix": 0.45, "yield_curve": 0.15, "dxy": 0.40},
    }

    def __init__(self):
        self._cache: Dict[str, Dict] = {}  # asset_class -> {result, ts}
        self.total_analyses = 0
        self.total_cache_hits = 0
        self.total_errors = 0
        self._yf = None
        self._ak = None
        self._init_libs()

    def _init_libs(self):
        """Try to import data libraries."""
        try:
            import yfinance
            self._yf = yfinance
        except ImportError:
            logger.warning("[MacroAgent] yfinance not installed — VIX/DXY data unavailable")

        try:
            import akshare
            self._ak = akshare
        except ImportError:
            logger.info("[MacroAgent] akshare not installed — using yfinance only")

    async def analyze(self, asset_class: str = "stock") -> MacroRegimeResult:
        """
        Analyze macro regime for the given asset class.
        Returns MacroRegimeResult. Fail-open: neutral on any error.
        """
        # Check cache
        cached = self._get_cached(asset_class)
        if cached:
            self.total_cache_hits += 1
            return cached

        self.total_analyses += 1

        try:
            vix_data = self._fetch_vix()
            yield_data = self._fetch_yield_curve()
            dxy_data = self._fetch_dxy()

            result = self._compute_regime(asset_class, vix_data, yield_data, dxy_data)
            self._set_cache(asset_class, result)
            return result
        except Exception as e:
            self.total_errors += 1
            logger.error(f"[MacroAgent] Error analyzing macro ({asset_class}): {e}")
            return self._neutral_result()

    async def warmup(self):
        """Pre-warm caches for all asset classes on startup."""
        for ac in ["stock", "forex", "crypto"]:
            try:
                await self.analyze(ac)
                logger.info(f"[MacroAgent] Warmed up cache for {ac}")
            except Exception as e:
                logger.error(f"[MacroAgent] Warmup error for {ac}: {e}")

    def _fetch_vix(self) -> Dict:
        """Fetch VIX data. Returns {level, percentile, score}."""
        if not self._yf:
            return {"level": 20.0, "percentile": 50.0, "score": 0.0}

        try:
            vix = self._yf.Ticker("^VIX")
            hist = vix.history(period="3mo")
            if hist.empty:
                return {"level": 20.0, "percentile": 50.0, "score": 0.0}

            current = float(hist["Close"].iloc[-1])

            # Percentile within 3-month range
            all_closes = hist["Close"].values
            percentile = float((all_closes < current).sum() / len(all_closes) * 100)

            # Score: lower VIX = more risk-on
            if current < 15:
                score = 0.4
            elif current < 20:
                score = 0.2
            elif current < 25:
                score = 0.0
            elif current < 30:
                score = -0.3
            elif current < 35:
                score = -0.5
            else:
                score = -0.7

            return {"level": round(current, 2), "percentile": round(percentile, 1), "score": score}
        except Exception as e:
            logger.debug(f"[MacroAgent] VIX fetch error: {e}")
            return {"level": 20.0, "percentile": 50.0, "score": 0.0}

    def _fetch_yield_curve(self) -> Dict:
        """Fetch 10Y-2Y yield spread. Returns {spread, score}."""
        if not self._yf:
            return {"spread": 0.5, "score": 0.0}

        try:
            tnx = self._yf.Ticker("^TNX")  # 10Y yield
            twoy = self._yf.Ticker("^IRX")  # 13-week T-bill (proxy for short end)

            tnx_hist = tnx.history(period="5d")
            twoy_hist = twoy.history(period="5d")

            if tnx_hist.empty or twoy_hist.empty:
                return {"spread": 0.5, "score": 0.0}

            ten_year = float(tnx_hist["Close"].iloc[-1])
            short_rate = float(twoy_hist["Close"].iloc[-1])
            spread = ten_year - short_rate

            # Score: positive spread = healthy, inverted = recession risk
            if spread > 1.0:
                score = 0.3
            elif spread > 0.5:
                score = 0.15
            elif spread > 0:
                score = 0.0
            elif spread > -0.5:
                score = -0.2
            else:
                score = -0.4  # Deeply inverted — recession signal

            return {"spread": round(spread, 3), "score": score}
        except Exception as e:
            logger.debug(f"[MacroAgent] Yield curve fetch error: {e}")
            return {"spread": 0.5, "score": 0.0}

    def _fetch_dxy(self) -> Dict:
        """Fetch DXY dollar index + 20-day trend. Returns {level, trend, score}."""
        if not self._yf:
            return {"level": 100.0, "trend": "stable", "score": 0.0}

        try:
            dxy = self._yf.Ticker("DX-Y.NYB")
            hist = dxy.history(period="1mo")
            if hist.empty or len(hist) < 5:
                return {"level": 100.0, "trend": "stable", "score": 0.0}

            current = float(hist["Close"].iloc[-1])
            avg_20d = float(hist["Close"].mean())

            # Trend: current vs 20-day average
            pct_diff = (current - avg_20d) / avg_20d * 100

            if pct_diff > 1.0:
                trend = "strengthening"
            elif pct_diff < -1.0:
                trend = "weakening"
            else:
                trend = "stable"

            # Score: strong dollar = headwind for stocks/crypto, tailwind varies for forex
            # This is the raw DXY score; asset-class weighting happens in _compute_regime
            if pct_diff > 2.0:
                score = -0.3  # Very strong dollar = risk-off
            elif pct_diff > 1.0:
                score = -0.15
            elif pct_diff > -1.0:
                score = 0.0
            elif pct_diff > -2.0:
                score = 0.15  # Weakening dollar = risk-on
            else:
                score = 0.3

            return {"level": round(current, 2), "trend": trend, "score": score}
        except Exception as e:
            logger.debug(f"[MacroAgent] DXY fetch error: {e}")
            return {"level": 100.0, "trend": "stable", "score": 0.0}

    def _compute_regime(
        self,
        asset_class: str,
        vix_data: Dict,
        yield_data: Dict,
        dxy_data: Dict,
    ) -> MacroRegimeResult:
        """Compute weighted macro regime score."""
        weights = self.WEIGHTS.get(asset_class, self.WEIGHTS["stock"])

        components = {
            "vix": vix_data["score"],
            "yield_curve": yield_data["score"],
            "dxy": dxy_data["score"],
        }

        # Weighted composite score
        regime_score = sum(components[k] * weights[k] for k in components)
        regime_score = max(-1.0, min(1.0, regime_score))

        # Map to regime label
        if regime_score > 0.2:
            regime = "risk_on"
        elif regime_score < -0.2:
            regime = "risk_off"
        else:
            regime = "neutral"

        return MacroRegimeResult(
            regime=regime,
            regime_score=round(regime_score, 3),
            vix=vix_data["level"],
            vix_percentile=vix_data["percentile"],
            yield_spread_10y2y=yield_data["spread"],
            dxy=dxy_data["level"],
            dxy_trend=dxy_data["trend"],
            components=components,
            cached=False,
            last_updated=datetime.now().isoformat(),
        )

    @staticmethod
    def _neutral_result() -> MacroRegimeResult:
        """Fail-open neutral result."""
        return MacroRegimeResult(
            regime="neutral",
            regime_score=0.0,
            vix=20.0,
            vix_percentile=50.0,
            yield_spread_10y2y=0.5,
            dxy=100.0,
            dxy_trend="stable",
            components={"vix": 0.0, "yield_curve": 0.0, "dxy": 0.0},
            cached=False,
            last_updated=datetime.now().isoformat(),
        )

    def _get_cached(self, asset_class: str) -> Optional[MacroRegimeResult]:
        entry = self._cache.get(asset_class)
        if entry and (time.time() - entry["ts"]) < self.CACHE_TTL:
            result = entry["result"]
            return MacroRegimeResult(
                regime=result.regime,
                regime_score=result.regime_score,
                vix=result.vix,
                vix_percentile=result.vix_percentile,
                yield_spread_10y2y=result.yield_spread_10y2y,
                dxy=result.dxy,
                dxy_trend=result.dxy_trend,
                components=result.components,
                cached=True,
                last_updated=result.last_updated,
            )
        return None

    def _set_cache(self, asset_class: str, result: MacroRegimeResult):
        self._cache[asset_class] = {"result": result, "ts": time.time()}

    def get_stats(self) -> Dict:
        return {
            "total_analyses": self.total_analyses,
            "total_cache_hits": self.total_cache_hits,
            "total_errors": self.total_errors,
            "cache_size": len(self._cache),
            "yfinance_available": self._yf is not None,
            "akshare_available": self._ak is not None,
        }


# Singleton
macro_agent = MacroAgent()
