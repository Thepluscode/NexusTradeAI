"""
Public API Routes — /api/v1/*
=============================

Public-facing REST API for AI trade signal evaluation.
Authentication via X-API-Key header (machine-to-machine).

Endpoints:
    POST /api/v1/evaluate       — AI trade signal evaluation (API key auth)
    POST /api/v1/keys           — Create API key (admin auth)
    GET  /api/v1/keys           — List user's API keys (admin auth)
    DELETE /api/v1/keys/{id}    — Revoke API key (admin auth)
    GET  /api/v1/usage          — Usage summary (admin auth)
"""

import os
import time
import asyncio
import logging
from typing import Optional, List

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from public_api import key_manager
from agents.orchestrator import orchestrator as agent_orchestrator
from agents.base import MarketSnapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Public API"])

# ── Admin auth helper ─────────────────────────────────────────────────

def _verify_admin(api_secret: Optional[str] = None):
    """Verify admin access via NEXUS_API_SECRET."""
    expected = os.environ.get("NEXUS_API_SECRET", "")
    if not expected:
        raise HTTPException(503, "API key management not configured (set NEXUS_API_SECRET)")
    if api_secret != expected:
        raise HTTPException(401, "Invalid admin secret")


# ── Request / Response models ─────────────────────────────────────────

class EvaluateRequest(BaseModel):
    """Trade signal to evaluate."""
    symbol: str = Field(..., max_length=20, description="Ticker symbol (e.g. AAPL, EUR_USD, BTC_USD)")
    direction: str = Field("long", pattern="^(long|short)$")
    asset_class: str = Field("stock", pattern="^(stock|forex|crypto)$")
    price: float = Field(..., gt=0, description="Current price")
    # Optional indicators — provide what you have, AI adapts
    rsi: Optional[float] = Field(None, ge=0, le=100)
    momentum_pct: Optional[float] = Field(None, description="% price change (e.g. 2.5 = +2.5%)")
    volume_ratio: Optional[float] = Field(None, ge=0, description="Volume relative to 20-day avg")
    regime: Optional[str] = Field(None, description="Market regime (trending_up, ranging, volatile, etc.)")
    macd_histogram: Optional[float] = None
    atr_pct: Optional[float] = Field(None, ge=0, description="ATR as % of price")
    vwap: Optional[float] = Field(None, gt=0)
    trend_strength: Optional[float] = Field(None, ge=0, le=1)
    stop_loss: Optional[float] = Field(None, gt=0)
    take_profit: Optional[float] = Field(None, gt=0)
    tier: str = Field("tier1", description="Signal tier (tier1=conservative, tier3=aggressive)")

class EvaluateResponse(BaseModel):
    should_enter: bool
    confidence: float
    direction: str
    reason: str
    risk_flags: List[str] = []
    position_size_multiplier: float = 1.0
    market_regime: Optional[str] = None
    evaluation_id: Optional[str] = None
    latency_ms: float = 0

class KeyCreateRequest(BaseModel):
    user_id: int
    name: str = "default"
    tier: str = Field("free", pattern="^(free|pro|enterprise)$")

class KeyResponse(BaseModel):
    id: int
    prefix: str
    name: str
    tier: str
    rate_limit: int
    created_at: str
    key: Optional[str] = None  # Only present on creation


# ── Public evaluate endpoint ──────────────────────────────────────────

@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_signal(
    req: EvaluateRequest,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """
    Evaluate a trade signal using the AI pipeline.

    Send your proposed trade and get an AI-powered GO/NO-GO decision
    with confidence score, reasoning, and risk flags.
    """
    t0 = time.time()

    # 1. Validate API key
    key_record = await key_manager.validate_key(x_api_key)
    if not key_record:
        # Log failed attempt (fire-and-forget)
        asyncio.create_task(key_manager.log_usage(
            api_key_id=0, user_id=0, endpoint="/api/v1/evaluate",
            symbol=req.symbol, asset_class=req.asset_class,
            status="invalid_key",
        ))
        raise HTTPException(401, "Invalid or revoked API key")

    # 2. Check rate limit BEFORE the expensive Claude call
    if not await key_manager.check_rate_limit(key_record):
        asyncio.create_task(key_manager.log_usage(
            api_key_id=key_record["id"], user_id=key_record["user_id"],
            endpoint="/api/v1/evaluate", symbol=req.symbol,
            asset_class=req.asset_class, status="rate_limited",
        ))
        raise HTTPException(
            429,
            f"Monthly rate limit exceeded ({key_record['rate_limit']} calls/month). "
            f"Upgrade your plan at https://nexustradeai.com/pricing"
        )

    # 3. Build MarketSnapshot and run AI pipeline
    snapshot = MarketSnapshot(
        symbol=req.symbol.upper(),
        asset_class=req.asset_class,
        price=req.price,
        direction=req.direction,
        tier=req.tier,
        rsi=req.rsi,
        momentum=req.momentum_pct,
        volume_ratio=req.volume_ratio,
        regime=req.regime,
        macd_histogram=req.macd_histogram,
        atr_pct=req.atr_pct,
        vwap=req.vwap,
        trend_strength=req.trend_strength,
        stop_loss=req.stop_loss,
        take_profit=req.take_profit,
    )

    try:
        decision = await agent_orchestrator.evaluate_signal(snapshot)
    except Exception as e:
        latency_ms = (time.time() - t0) * 1000
        asyncio.create_task(key_manager.log_usage(
            api_key_id=key_record["id"], user_id=key_record["user_id"],
            endpoint="/api/v1/evaluate", symbol=req.symbol,
            asset_class=req.asset_class, latency_ms=latency_ms,
            status="error", error_detail=str(e),
        ))
        raise HTTPException(502, f"AI evaluation failed: {str(e)}")

    latency_ms = (time.time() - t0) * 1000

    # 4. Increment usage + log (fire-and-forget, non-blocking)
    asyncio.create_task(key_manager.increment_usage(key_record["id"]))
    asyncio.create_task(key_manager.log_usage(
        api_key_id=key_record["id"], user_id=key_record["user_id"],
        endpoint="/api/v1/evaluate", symbol=req.symbol,
        asset_class=req.asset_class, latency_ms=latency_ms,
        status="success",
    ))

    return EvaluateResponse(
        should_enter=decision.approved,
        confidence=round(decision.confidence, 3),
        direction=req.direction,
        reason=decision.reason,
        risk_flags=decision.risk_flags,
        position_size_multiplier=round(decision.position_size_multiplier, 2),
        market_regime=decision.market_regime,
        evaluation_id=f"eval_{key_record['id']}_{int(t0 * 1000)}",
        latency_ms=round(latency_ms, 1),
    )


# ── Key management endpoints (admin-only) ─────────────────────────────

@router.post("/keys")
async def create_key(
    req: KeyCreateRequest,
    x_api_secret: str = Header(..., alias="X-API-Secret"),
):
    """Create a new API key for a user. Returns the raw key ONCE."""
    _verify_admin(x_api_secret)

    try:
        result = await key_manager.create_key(
            user_id=req.user_id, name=req.name, tier=req.tier,
        )
    except Exception as e:
        logger.error(f"Key creation error: {e}")
        raise HTTPException(500, f"Key creation failed: {str(e)}")

    if not result:
        raise HTTPException(500, "Failed to create API key (database unavailable)")

    return result


@router.get("/keys")
async def list_keys(
    user_id: int,
    x_api_secret: str = Header(..., alias="X-API-Secret"),
):
    """List all API keys for a user (prefix only, never the raw key)."""
    _verify_admin(x_api_secret)
    keys = await key_manager.list_keys(user_id)
    return {"keys": keys, "total": len(keys)}


@router.delete("/keys/{key_id}")
async def revoke_key(
    key_id: int,
    user_id: int,
    x_api_secret: str = Header(..., alias="X-API-Secret"),
):
    """Revoke an API key."""
    _verify_admin(x_api_secret)
    revoked = await key_manager.revoke_key(key_id, user_id)
    if not revoked:
        raise HTTPException(404, "Key not found or already revoked")
    return {"revoked": True, "key_id": key_id}


@router.get("/usage")
async def get_usage(
    user_id: int,
    x_api_secret: str = Header(..., alias="X-API-Secret"),
):
    """Get usage summary for a user."""
    _verify_admin(x_api_secret)
    summary = await key_manager.get_usage_summary(user_id)
    return summary
