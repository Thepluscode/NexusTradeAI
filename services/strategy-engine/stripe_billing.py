"""
Stripe Billing Integration
===========================

Handles checkout sessions, webhooks, and tier upgrades for the public API.

Requires:
    pip install stripe

Environment variables:
    STRIPE_SECRET_KEY       — Stripe secret key (sk_test_... or sk_live_...)
    STRIPE_WEBHOOK_SECRET   — Webhook signing secret (whsec_...)
    STRIPE_PRO_PRICE_ID     — Price ID for Pro tier ($49/mo)
    STRIPE_ENT_PRICE_ID     — Price ID for Enterprise tier ($499/mo)
    NEXUS_API_SECRET        — Admin auth for internal endpoints
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["Billing"])

# ── Stripe lazy init ─────────────────────────────────────────────────

_stripe = None

def _get_stripe():
    global _stripe
    if _stripe is None:
        try:
            import stripe
            stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
            if not stripe.api_key:
                logger.warning("STRIPE_SECRET_KEY not set — billing disabled")
                return None
            _stripe = stripe
            logger.info("Stripe initialized")
        except ImportError:
            logger.warning("stripe package not installed — billing disabled")
            return None
    return _stripe


# ── Config ───────────────────────────────────────────────────────────

PRICE_IDS = {
    "pro": os.environ.get("STRIPE_PRO_PRICE_ID", ""),
    "enterprise": os.environ.get("STRIPE_ENT_PRICE_ID", ""),
}

DASHBOARD_URL = os.environ.get(
    "DASHBOARD_URL",
    "https://nexus-dashboard-production-e6e6.up.railway.app"
)


# ── Request models ───────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    user_id: int
    tier: str = Field(..., pattern="^(pro|enterprise)$")
    email: Optional[str] = None


class PortalRequest(BaseModel):
    user_id: int


# ── Admin auth ───────────────────────────────────────────────────────

def _verify_admin(api_secret: Optional[str] = None):
    expected = os.environ.get("NEXUS_API_SECRET", "")
    if not expected:
        raise HTTPException(503, "Billing not configured")
    if api_secret != expected:
        raise HTTPException(401, "Invalid admin secret")


# ── Checkout session ─────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(
    req: CheckoutRequest,
    x_api_secret: str = Header(..., alias="X-API-Secret"),
):
    """Create a Stripe Checkout session for Pro or Enterprise subscription."""
    _verify_admin(x_api_secret)

    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(503, "Stripe not configured (set STRIPE_SECRET_KEY)")

    price_id = PRICE_IDS.get(req.tier)
    if not price_id:
        raise HTTPException(400, f"No price ID configured for tier '{req.tier}' (set STRIPE_{req.tier.upper()}_PRICE_ID)")

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{DASHBOARD_URL}/api?checkout=success&tier={req.tier}",
            cancel_url=f"{DASHBOARD_URL}/api?checkout=cancelled",
            client_reference_id=str(req.user_id),
            customer_email=req.email,
            metadata={
                "user_id": str(req.user_id),
                "tier": req.tier,
            },
        )
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(502, f"Stripe error: {str(e)}")

    return {"checkout_url": session.url, "session_id": session.id}


# ── Customer portal ──────────────────────────────────────────────────

@router.post("/portal")
async def create_portal_session(
    req: PortalRequest,
    x_api_secret: str = Header(..., alias="X-API-Secret"),
):
    """Create a Stripe Customer Portal session for managing subscription."""
    _verify_admin(x_api_secret)

    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(503, "Stripe not configured")

    # Find customer by metadata
    from public_api import key_manager
    pool = await key_manager._get_pool()
    if not pool:
        raise HTTPException(503, "Database unavailable")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT stripe_customer_id FROM api_keys WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1",
            req.user_id,
        )

    if not row or not row["stripe_customer_id"]:
        raise HTTPException(404, "No billing account found. Subscribe to a plan first.")

    try:
        session = stripe.billing_portal.Session.create(
            customer=row["stripe_customer_id"],
            return_url=f"{DASHBOARD_URL}/api",
        )
    except Exception as e:
        raise HTTPException(502, f"Stripe portal error: {str(e)}")

    return {"portal_url": session.url}


# ── Webhook handler ──────────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (subscription lifecycle)."""
    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(503, "Stripe not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    if webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        except stripe.error.SignatureVerificationError:
            raise HTTPException(400, "Invalid webhook signature")
        except Exception as e:
            raise HTTPException(400, f"Webhook error: {str(e)}")
    else:
        # No webhook secret — parse raw (dev mode only)
        import json
        event = json.loads(payload)
        logger.warning("STRIPE_WEBHOOK_SECRET not set — accepting unverified webhook")

    event_type = event.get("type", "") if isinstance(event, dict) else event.type
    data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object

    logger.info(f"Stripe webhook: {event_type}")

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(data)
    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        await _handle_subscription_change(data, event_type)
    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(data)

    return {"received": True}


# ── Webhook handlers ─────────────────────────────────────────────────

async def _handle_checkout_completed(session):
    """Upgrade user tier after successful checkout."""
    user_id = int(session.get("client_reference_id", 0) or session.get("metadata", {}).get("user_id", 0))
    tier = session.get("metadata", {}).get("tier", "pro")
    customer_id = session.get("customer", "")
    subscription_id = session.get("subscription", "")

    if not user_id:
        logger.error(f"Checkout completed but no user_id in metadata: {session}")
        return

    logger.info(f"Checkout completed: user={user_id}, tier={tier}, customer={customer_id}")

    from public_api import key_manager, TIER_LIMITS
    pool = await key_manager._get_pool()
    if not pool:
        logger.error("Cannot upgrade tier — DB unavailable")
        return

    new_limit = TIER_LIMITS.get(tier, 5000)

    async with pool.acquire() as conn:
        # Upgrade all active keys for this user
        await conn.execute("""
            UPDATE api_keys
            SET tier = $1, rate_limit = $2, stripe_customer_id = $3, stripe_subscription_id = $4
            WHERE user_id = $5 AND is_active = TRUE
        """, tier, new_limit, customer_id, subscription_id, user_id)

        # Also add stripe columns if they don't exist yet (migration)
        try:
            await conn.execute("""
                ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
                ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
            """)
        except Exception:
            pass  # columns already exist

    logger.info(f"User {user_id} upgraded to {tier} ({new_limit} calls/month)")


async def _handle_subscription_change(subscription, event_type):
    """Handle subscription updates (upgrade/downgrade/cancel)."""
    customer_id = subscription.get("customer", "")
    status = subscription.get("status", "")

    from public_api import key_manager
    pool = await key_manager._get_pool()
    if not pool:
        return

    if event_type == "customer.subscription.deleted" or status in ("canceled", "unpaid"):
        # Downgrade to free
        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE api_keys SET tier = 'free', rate_limit = 100
                WHERE stripe_customer_id = $1 AND is_active = TRUE
            """, customer_id)
        logger.info(f"Customer {customer_id} downgraded to free (subscription {status})")


async def _handle_payment_failed(invoice):
    """Log payment failure — don't immediately downgrade (Stripe retries)."""
    customer_id = invoice.get("customer", "")
    logger.warning(f"Payment failed for customer {customer_id} — Stripe will retry")
