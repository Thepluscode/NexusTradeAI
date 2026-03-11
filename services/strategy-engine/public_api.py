"""
Public API Key Manager
======================

Handles API key creation, validation, rate limiting, and usage tracking
for the public /api/v1/* endpoints.

Keys are SHA-256 hashed before storage (raw key returned once on creation).
Format: ntai_live_ + 32 hex chars  (e.g. ntai_live_a1b2c3d4e5f6...)
"""

import os
import secrets
import hashlib
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)

# Tier → monthly call limit
TIER_LIMITS = {
    "free": 100,
    "pro": 5000,
    "enterprise": 999_999_999,
}

KEY_PREFIX = "ntai_live_"


class PublicAPIKeyManager:
    def __init__(self):
        self._pool = None
        self._db_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")

    # ── Pool management ───────────────────────────────────────────────

    async def _get_pool(self):
        if self._pool is None and self._db_url:
            try:
                import asyncpg
                # Railway DB requires SSL; detect from URL or env
                needs_ssl = (
                    "sslmode=require" in (self._db_url or "")
                    or os.environ.get("PGSSLMODE") == "require"
                    or os.environ.get("RAILWAY_ENVIRONMENT")  # Railway always needs SSL
                )
                # Strip sslmode from URL (asyncpg doesn't parse it)
                clean_url = self._db_url
                for param in ["?sslmode=require", "&sslmode=require", "?sslmode=prefer", "&sslmode=prefer"]:
                    clean_url = clean_url.replace(param, "?" if param.startswith("?") else "")
                clean_url = clean_url.rstrip("?&")
                self._pool = await asyncpg.create_pool(
                    clean_url,
                    min_size=1,
                    max_size=3,
                    ssl="require" if needs_ssl else None,
                )
                await self._ensure_tables()
                logger.info("Public API DB pool created")
            except Exception as e:
                logger.error(f"Public API pool creation failed: {e}")
                self._pool = None
        return self._pool

    async def _ensure_tables(self):
        """Create api_keys + usage_events tables if they don't exist."""
        pool = await self._get_pool() if self._pool else None
        if not pool:
            return
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    id              SERIAL PRIMARY KEY,
                    user_id         INTEGER NOT NULL,
                    name            VARCHAR(100) NOT NULL DEFAULT 'default',
                    key_hash        VARCHAR(64) NOT NULL,
                    prefix          VARCHAR(50) NOT NULL,
                    scopes          JSONB DEFAULT '["evaluate"]',
                    tier            VARCHAR(20) DEFAULT 'free',
                    rate_limit      INTEGER DEFAULT 100,
                    calls_today     INTEGER DEFAULT 0,
                    calls_month     INTEGER DEFAULT 0,
                    last_used_at    TIMESTAMPTZ,
                    is_active       BOOLEAN DEFAULT TRUE,
                    created_at      TIMESTAMPTZ DEFAULT NOW(),
                    revoked_at      TIMESTAMPTZ
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
                CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

                CREATE TABLE IF NOT EXISTS usage_events (
                    id              SERIAL PRIMARY KEY,
                    api_key_id      INTEGER REFERENCES api_keys(id),
                    user_id         INTEGER NOT NULL,
                    endpoint        VARCHAR(100) NOT NULL,
                    symbol          VARCHAR(20),
                    asset_class     VARCHAR(10),
                    latency_ms      DECIMAL(8,2),
                    status          VARCHAR(20) NOT NULL,
                    error_detail    TEXT,
                    created_at      TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_usage_events_key ON usage_events(api_key_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_usage_events_user_month ON usage_events(user_id, created_at);

                -- Migrate: widen prefix column if it was created too small
                ALTER TABLE api_keys ALTER COLUMN prefix TYPE VARCHAR(50);
            """)
        logger.info("Public API tables ensured")

    # ── Key generation ────────────────────────────────────────────────

    @staticmethod
    def _hash_key(raw_key: str) -> str:
        return hashlib.sha256(raw_key.encode()).hexdigest()

    @staticmethod
    def _generate_key() -> tuple:
        """Returns (raw_key, key_hash, prefix)."""
        random_part = secrets.token_hex(16)  # 32 hex chars
        raw_key = f"{KEY_PREFIX}{random_part}"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        prefix = f"ntai_{random_part[:8]}..."
        return raw_key, key_hash, prefix

    # ── CRUD operations ───────────────────────────────────────────────

    async def create_key(self, user_id: int, name: str = "default", tier: str = "free") -> Optional[Dict]:
        pool = await self._get_pool()
        if not pool:
            return None

        raw_key, key_hash, prefix = self._generate_key()
        rate_limit = TIER_LIMITS.get(tier, 100)

        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO api_keys (user_id, name, key_hash, prefix, tier, rate_limit)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, created_at
            """, user_id, name, key_hash, prefix, tier, rate_limit)

        return {
            "id": row["id"],
            "key": raw_key,  # Only returned ONCE
            "prefix": prefix,
            "name": name,
            "tier": tier,
            "rate_limit": rate_limit,
            "created_at": row["created_at"].isoformat(),
        }

    async def validate_key(self, raw_key: str) -> Optional[Dict]:
        """Validate an API key. Returns key record or None."""
        if not raw_key or not raw_key.startswith(KEY_PREFIX):
            return None

        pool = await self._get_pool()
        if not pool:
            return None

        key_hash = self._hash_key(raw_key)
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, user_id, name, prefix, tier, rate_limit,
                       calls_today, calls_month, is_active, created_at
                FROM api_keys WHERE key_hash = $1
            """, key_hash)

        if not row:
            return None
        if not row["is_active"]:
            return None

        return dict(row)

    async def check_rate_limit(self, key_record: Dict) -> bool:
        """Returns True if under limit, False if rate-limited."""
        return key_record["calls_month"] < key_record["rate_limit"]

    async def increment_usage(self, key_id: int):
        """Increment calls_today and calls_month, update last_used_at."""
        pool = await self._get_pool()
        if not pool:
            return
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    UPDATE api_keys
                    SET calls_today = calls_today + 1,
                        calls_month = calls_month + 1,
                        last_used_at = NOW()
                    WHERE id = $1
                """, key_id)
        except Exception as e:
            logger.error(f"Failed to increment usage for key {key_id}: {e}")

    async def log_usage(self, api_key_id: int, user_id: int, endpoint: str,
                        symbol: str = None, asset_class: str = None,
                        latency_ms: float = 0, status: str = "success",
                        error_detail: str = None):
        """Fire-and-forget usage event logging."""
        pool = await self._get_pool()
        if not pool:
            return
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO usage_events
                        (api_key_id, user_id, endpoint, symbol, asset_class, latency_ms, status, error_detail)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """, api_key_id, user_id, endpoint, symbol, asset_class,
                     latency_ms, status, error_detail)
        except Exception as e:
            logger.error(f"Failed to log usage event: {e}")

    async def list_keys(self, user_id: int) -> List[Dict]:
        pool = await self._get_pool()
        if not pool:
            return []
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, name, prefix, tier, rate_limit, calls_today, calls_month,
                       last_used_at, is_active, created_at
                FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC
            """, user_id)
        return [dict(r) for r in rows]

    async def revoke_key(self, key_id: int, user_id: int) -> bool:
        pool = await self._get_pool()
        if not pool:
            return False
        async with pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE api_keys SET is_active = FALSE, revoked_at = NOW()
                WHERE id = $1 AND user_id = $2
            """, key_id, user_id)
        return "UPDATE 1" in result

    async def get_usage_summary(self, user_id: int) -> Dict:
        pool = await self._get_pool()
        if not pool:
            return {"calls_today": 0, "calls_month": 0, "keys": 0}
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT COALESCE(SUM(calls_today), 0) AS calls_today,
                       COALESCE(SUM(calls_month), 0) AS calls_month,
                       COALESCE(SUM(rate_limit), 0) AS monthly_limit,
                       COUNT(*) FILTER (WHERE is_active) AS active_keys
                FROM api_keys WHERE user_id = $1
            """, user_id)
        return {
            "calls_today": int(row["calls_today"]),
            "calls_month": int(row["calls_month"]),
            "monthly_limit": int(row["monthly_limit"]),
            "active_keys": int(row["active_keys"]),
        }

    async def reset_daily_counters(self):
        """Reset calls_today for all keys. Called by background task at midnight UTC."""
        pool = await self._get_pool()
        if not pool:
            return
        async with pool.acquire() as conn:
            await conn.execute("UPDATE api_keys SET calls_today = 0")
        logger.info("Daily API key counters reset")

    async def reset_monthly_counters(self):
        """Reset calls_month for all keys. Called on 1st of each month."""
        pool = await self._get_pool()
        if not pool:
            return
        async with pool.acquire() as conn:
            await conn.execute("UPDATE api_keys SET calls_month = 0")
        logger.info("Monthly API key counters reset")


# Singleton
key_manager = PublicAPIKeyManager()
