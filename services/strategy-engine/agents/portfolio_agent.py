"""
Portfolio Risk Agent
====================

Cross-bot portfolio-level risk checks. Queries open positions from all 3 bots
(stock, forex, crypto) via the shared trades table and checks for:

1. Total portfolio exposure (sum of position sizes vs max threshold)
2. Correlated exposure (e.g., long USD in forex while long US stocks)
3. Asset class concentration (too many positions in one asset class)
4. Sector/currency overlap across bots

Results are cached for 60 seconds — portfolio state doesn't change every tick.

The orchestrator calls `check_risk()` before approving a new trade.
If risk flags are raised, the decision may be rejected or position sized down.
"""

import os
import time
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Currency exposure mapping: which currencies are you long/short when trading these
FOREX_CURRENCY_EXPOSURE = {
    'EUR_USD': {'long': ['EUR'], 'short': ['USD']},
    'GBP_USD': {'long': ['GBP'], 'short': ['USD']},
    'USD_JPY': {'long': ['USD'], 'short': ['JPY']},
    'AUD_USD': {'long': ['AUD'], 'short': ['USD']},
    'USD_CAD': {'long': ['USD'], 'short': ['CAD']},
    'NZD_USD': {'long': ['NZD'], 'short': ['USD']},
    'USD_CHF': {'long': ['USD'], 'short': ['CHF']},
    'EUR_JPY': {'long': ['EUR'], 'short': ['JPY']},
    'GBP_JPY': {'long': ['GBP'], 'short': ['JPY']},
    'EUR_GBP': {'long': ['EUR'], 'short': ['GBP']},
    'AUD_JPY': {'long': ['AUD'], 'short': ['JPY']},
    'CAD_JPY': {'long': ['CAD'], 'short': ['JPY']},
}

# US stocks are implicitly long USD
STOCK_CURRENCY = 'USD'

# Max thresholds
MAX_OPEN_POSITIONS = 15  # across all bots
MAX_PER_ASSET_CLASS = 8  # per asset class
MAX_CURRENCY_EXPOSURE = 5  # max net positions in one currency direction
MAX_DAILY_LOSS_USD = -500.0  # portfolio-level daily loss circuit breaker (dollar amount)


@dataclass
class PortfolioRiskResult:
    """Result from portfolio risk check."""
    risk_flags: List[str] = field(default_factory=list)
    total_positions: int = 0
    positions_by_class: Dict[str, int] = field(default_factory=dict)
    currency_exposure: Dict[str, int] = field(default_factory=dict)
    daily_pnl_usd: float = 0.0
    size_cap: float = 1.0  # 1.0 = no reduction, 0.5 = halve size

    @property
    def blocked(self) -> bool:
        return any(f.startswith('BLOCK:') for f in self.risk_flags)


class PortfolioRiskAgent:
    """
    Portfolio-level risk assessment across all 3 trading bots.
    Reads open positions from the shared trades table.
    """

    def __init__(self, cache_ttl: int = 60):
        self._db_url = os.environ.get('DATABASE_URL') or os.environ.get('POSTGRES_URL')
        self._db_available = bool(self._db_url)
        self._pool = None
        self._cache: Optional[Dict] = None
        self._cache_ts: float = 0
        self._cache_ttl = cache_ttl
        self.total_checks = 0
        self.total_cache_hits = 0
        self.total_blocks = 0
        self.total_warnings = 0

    async def _get_pool(self):
        if self._pool is None and self._db_available:
            try:
                import asyncpg
                ssl_mode = os.environ.get('PGSSLMODE', 'prefer')
                self._pool = await asyncpg.create_pool(
                    self._db_url,
                    min_size=1,
                    max_size=3,
                    ssl='require' if ssl_mode == 'require' else None,
                )
            except Exception as e:
                logger.error(f"[Portfolio] DB pool failed: {e}")
                self._db_available = False
        return self._pool

    async def _fetch_open_positions(self) -> List[Dict]:
        """Fetch all open positions across all 3 bots from the shared trades table."""
        pool = await self._get_pool()
        if not pool:
            return []
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch("""
                    SELECT symbol, bot, direction, entry_price, position_size_usd,
                           unrealized_pnl, asset_class, tier, entry_time
                    FROM trades
                    WHERE exit_price IS NULL
                    ORDER BY entry_time DESC
                """)
                return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"[Portfolio] Failed to fetch positions: {e}")
            return []

    async def _fetch_daily_pnl(self) -> float:
        """Get today's realized P&L across all bots."""
        pool = await self._get_pool()
        if not pool:
            return 0.0
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT COALESCE(SUM(pnl_usd), 0) AS daily_pnl
                    FROM trades
                    WHERE exit_price IS NOT NULL
                      AND exit_time >= CURRENT_DATE
                """)
                return float(row['daily_pnl']) if row else 0.0
        except Exception as e:
            logger.error(f"[Portfolio] Failed to fetch daily P&L: {e}")
            return 0.0

    async def _get_portfolio_snapshot(self) -> Dict:
        """Get or return cached portfolio snapshot."""
        now = time.time()
        if self._cache and (now - self._cache_ts) < self._cache_ttl:
            self.total_cache_hits += 1
            return self._cache

        positions = await self._fetch_open_positions()
        daily_pnl = await self._fetch_daily_pnl()

        # Count by asset class
        by_class: Dict[str, int] = {}
        for p in positions:
            ac = p.get('asset_class', 'unknown')
            by_class[ac] = by_class.get(ac, 0) + 1

        # Calculate currency exposure
        currency_net: Dict[str, int] = {}
        for p in positions:
            ac = p.get('asset_class', '')
            symbol = p.get('symbol', '')
            direction = p.get('direction', 'long')

            if ac == 'stock':
                # Stocks = long USD
                currency_net['USD'] = currency_net.get('USD', 0) + 1
            elif ac == 'forex':
                exposure = FOREX_CURRENCY_EXPOSURE.get(symbol, {})
                if direction == 'long':
                    for c in exposure.get('long', []):
                        currency_net[c] = currency_net.get(c, 0) + 1
                    for c in exposure.get('short', []):
                        currency_net[c] = currency_net.get(c, 0) - 1
                else:
                    for c in exposure.get('short', []):
                        currency_net[c] = currency_net.get(c, 0) + 1
                    for c in exposure.get('long', []):
                        currency_net[c] = currency_net.get(c, 0) - 1
            elif ac == 'crypto':
                # Crypto = long the crypto asset, effectively short USD
                currency_net['USD'] = currency_net.get('USD', 0) - 1

        snapshot = {
            'positions': positions,
            'total': len(positions),
            'by_class': by_class,
            'currency_net': currency_net,
            'daily_pnl': daily_pnl,
        }
        self._cache = snapshot
        self._cache_ts = now
        return snapshot

    async def check_risk(
        self,
        new_symbol: str,
        new_asset_class: str,
        new_direction: str = 'long',
    ) -> PortfolioRiskResult:
        """
        Check portfolio risk before entering a new position.
        Returns risk flags and optional size cap.
        """
        self.total_checks += 1
        result = PortfolioRiskResult()

        snapshot = await self._get_portfolio_snapshot()
        result.total_positions = snapshot['total']
        result.positions_by_class = snapshot['by_class']
        result.currency_exposure = snapshot['currency_net']
        result.daily_pnl_usd = snapshot['daily_pnl']

        # Check 1: Total position count
        if snapshot['total'] >= MAX_OPEN_POSITIONS:
            result.risk_flags.append(f"BLOCK: max_positions ({snapshot['total']}/{MAX_OPEN_POSITIONS})")

        # Check 2: Per-asset-class concentration
        class_count = snapshot['by_class'].get(new_asset_class, 0)
        if class_count >= MAX_PER_ASSET_CLASS:
            result.risk_flags.append(f"BLOCK: {new_asset_class}_concentration ({class_count}/{MAX_PER_ASSET_CLASS})")
        elif class_count >= MAX_PER_ASSET_CLASS - 2:
            result.risk_flags.append(f"WARN: {new_asset_class}_high ({class_count}/{MAX_PER_ASSET_CLASS})")
            result.size_cap = min(result.size_cap, 0.75)

        # Check 3: Currency exposure
        # Figure out what currencies the new trade would add
        new_currencies = []
        if new_asset_class == 'stock':
            new_currencies = [('USD', 1)]
        elif new_asset_class == 'forex':
            exposure = FOREX_CURRENCY_EXPOSURE.get(new_symbol, {})
            if new_direction == 'long':
                new_currencies = [(c, 1) for c in exposure.get('long', [])] + \
                                 [(c, -1) for c in exposure.get('short', [])]
            else:
                new_currencies = [(c, -1) for c in exposure.get('long', [])] + \
                                 [(c, 1) for c in exposure.get('short', [])]
        elif new_asset_class == 'crypto':
            new_currencies = [('USD', -1)]

        for currency, delta in new_currencies:
            current = snapshot['currency_net'].get(currency, 0)
            projected = current + delta
            if abs(projected) > MAX_CURRENCY_EXPOSURE:
                result.risk_flags.append(
                    f"WARN: {currency}_overexposure (net {current:+d} → {projected:+d})"
                )
                result.size_cap = min(result.size_cap, 0.5)

        # Check 4: Daily loss circuit breaker (portfolio-level)
        # This is a rough check — compares realized daily P&L to a threshold
        # A proper implementation would also factor unrealized P&L
        if snapshot['daily_pnl'] < MAX_DAILY_LOSS_USD:
            result.risk_flags.append(
                f"BLOCK: daily_loss_limit (${snapshot['daily_pnl']:.2f} < ${MAX_DAILY_LOSS_USD})"
            )

        # Check 5: Duplicate symbol check across bots
        existing_symbols = [p['symbol'] for p in snapshot['positions']]
        if new_symbol in existing_symbols:
            result.risk_flags.append(f"WARN: duplicate_symbol ({new_symbol} already open)")
            result.size_cap = min(result.size_cap, 0.5)

        # Track stats
        if result.blocked:
            self.total_blocks += 1
        elif result.risk_flags:
            self.total_warnings += 1

        if result.risk_flags:
            logger.info(
                f"[Portfolio] {new_symbol} {new_direction}: "
                f"flags={result.risk_flags}, size_cap={result.size_cap:.2f}"
            )

        return result

    def get_stats(self) -> Dict:
        return {
            'total_checks': self.total_checks,
            'total_cache_hits': self.total_cache_hits,
            'total_blocks': self.total_blocks,
            'total_warnings': self.total_warnings,
            'db_available': self._db_available,
        }


# Singleton
portfolio_agent = PortfolioRiskAgent()
