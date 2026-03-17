"""
Institutional Flow Agent
========================

Tracks SEC 13F filings from major hedge funds via Edgar Tools to provide
per-symbol institutional positioning signals. 13F filings update quarterly
(45 days after quarter end), so data is cached 24 hours.

Pipeline position: Between SentimentAgent and DecisionAgent (stock-only).

Features:
- Tracks top 20 hedge funds by AUM
- Compares current vs previous quarter holdings
- Net buying/selling score per symbol
- 24-hour TTL cache per symbol
- PostgreSQL persistence for cross-deploy survival
- Fail-open: returns neutral if Edgar Tools fails
"""

import logging
import time
import os
from dataclasses import dataclass, field, asdict
from typing import Dict, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

# ========================================
# INSTITUTIONAL RESULT
# ========================================

@dataclass
class InstitutionalFlowResult:
    symbol: str
    net_sentiment: float           # -1.0 to 1.0
    sentiment_label: str           # heavy_selling, selling, neutral, buying, heavy_buying
    total_funds_holding: int       # How many tracked funds hold this
    total_funds_increasing: int    # How many increased position
    total_funds_decreasing: int    # How many decreased position
    total_funds_new: int           # How many opened new position
    total_funds_exited: int        # How many fully exited
    top_holders: List[Dict]        # [{fund, shares, value_usd, change_pct}]
    filing_quarter: str            # e.g. "2025-Q4"
    cached: bool
    last_updated: str

    def to_dict(self) -> Dict:
        return asdict(self)


# ========================================
# TRACKED HEDGE FUNDS (Top 20 by AUM)
# ========================================

TRACKED_FUNDS = [
    {"name": "Berkshire Hathaway", "cik": "0001067983"},
    {"name": "Bridgewater Associates", "cik": "0001350694"},
    {"name": "Citadel Advisors", "cik": "0001423053"},
    {"name": "Renaissance Technologies", "cik": "0001037389"},
    {"name": "Two Sigma Investments", "cik": "0001179392"},
    {"name": "DE Shaw", "cik": "0001009207"},
    {"name": "Millennium Management", "cik": "0001273087"},
    {"name": "Point72 Asset Management", "cik": "0001603466"},
    {"name": "AQR Capital Management", "cik": "0001167557"},
    {"name": "Tiger Global Management", "cik": "0001167483"},
    {"name": "Baupost Group", "cik": "0001061768"},
    {"name": "Elliott Management", "cik": "0001048445"},
    {"name": "Third Point", "cik": "0001040273"},
    {"name": "Pershing Square Capital", "cik": "0001336528"},
    {"name": "Appaloosa Management", "cik": "0001656456"},
    {"name": "Lone Pine Capital", "cik": "0001061165"},
    {"name": "Viking Global Investors", "cik": "0001103804"},
    {"name": "Coatue Management", "cik": "0001535392"},
    {"name": "Dragoneer Investment", "cik": "0001579712"},
    {"name": "Greenlight Capital", "cik": "0001079114"},
]


# ========================================
# INSTITUTIONAL AGENT
# ========================================

class InstitutionalAgent:
    """
    Fetches 13F filings from SEC via Edgar Tools and scores
    institutional positioning per symbol. 24-hour cache.
    Fail-open: returns neutral on any error. Stock-only.
    """

    CACHE_TTL = 86400  # 24 hours (13F data is quarterly)

    def __init__(self):
        self._cache: Dict[str, Dict] = {}  # symbol -> {result, ts}
        self._holdings_cache: Dict[str, Dict] = {}  # fund_cik -> {holdings_df, quarter, ts}
        self._holdings_cache_ttl = 86400  # 24 hours for raw holdings
        self.total_analyses = 0
        self.total_cache_hits = 0
        self.total_errors = 0
        self._edgar = None
        self._db_url = os.environ.get('DATABASE_URL') or os.environ.get('POSTGRES_URL')
        self._pool = None
        self._init_libs()

    def _init_libs(self):
        """Try to import edgar tools."""
        try:
            import edgar
            # Set identity for SEC (required by Edgar Tools)
            edgar.set_identity("NexusTradeAI research@nexustradeai.com")
            self._edgar = edgar
            logger.info("[InstitutionalAgent] Edgar Tools initialized")
        except ImportError:
            logger.warning("[InstitutionalAgent] edgartools not installed — institutional data unavailable")
        except Exception as e:
            logger.warning(f"[InstitutionalAgent] Edgar init error: {e}")

    async def _get_pool(self):
        """Get or create DB pool for caching."""
        if self._pool is None and self._db_url:
            try:
                import asyncpg
                ssl_mode = os.environ.get('PGSSLMODE', 'prefer')
                self._pool = await asyncpg.create_pool(
                    self._db_url,
                    min_size=1,
                    max_size=2,
                    ssl='require' if ssl_mode == 'require' else None,
                )
                # Ensure table exists
                async with self._pool.acquire() as conn:
                    await conn.execute("""
                        CREATE TABLE IF NOT EXISTS institutional_holdings (
                            id              SERIAL PRIMARY KEY,
                            symbol          VARCHAR(20) NOT NULL,
                            fund_name       VARCHAR(100) NOT NULL,
                            fund_cik        VARCHAR(20) NOT NULL,
                            filing_quarter  VARCHAR(10) NOT NULL,
                            shares_current  BIGINT,
                            shares_previous BIGINT,
                            shares_change   BIGINT,
                            value_usd       DECIMAL(16,2),
                            pct_change      DECIMAL(8,4),
                            fetched_at      TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE(symbol, fund_cik, filing_quarter)
                        )
                    """)
                    await conn.execute("""
                        CREATE INDEX IF NOT EXISTS idx_institutional_symbol
                        ON institutional_holdings(symbol)
                    """)
            except Exception as e:
                logger.error(f"[InstitutionalAgent] DB pool error: {e}")
        return self._pool

    async def analyze(self, symbol: str) -> InstitutionalFlowResult:
        """
        Analyze institutional positioning for a stock symbol.
        Returns InstitutionalFlowResult. Fail-open: neutral on any error.
        """
        symbol = symbol.upper()

        # Check memory cache
        cached = self._get_cached(symbol)
        if cached:
            self.total_cache_hits += 1
            return cached

        # Check DB cache
        db_result = await self._load_from_db(symbol)
        if db_result:
            self.total_cache_hits += 1
            self._set_cache(symbol, db_result)
            return db_result

        self.total_analyses += 1

        try:
            result = self._fetch_and_score(symbol)
            self._set_cache(symbol, result)
            await self._save_to_db(result)
            return result
        except Exception as e:
            self.total_errors += 1
            logger.error(f"[InstitutionalAgent] Error analyzing {symbol}: {e}")
            return self._neutral_result(symbol)

    async def warmup(self):
        """Pre-warm by ensuring DB table exists and loading any cached data."""
        try:
            await self._get_pool()
            logger.info("[InstitutionalAgent] DB pool ready for institutional data")
        except Exception as e:
            logger.error(f"[InstitutionalAgent] Warmup error: {e}")

    def _fetch_and_score(self, symbol: str) -> InstitutionalFlowResult:
        """Fetch 13F data for all tracked funds and score a symbol."""
        if not self._edgar:
            return self._neutral_result(symbol)

        holdings_data = []
        quarter = ""

        for fund in TRACKED_FUNDS:
            try:
                fund_holdings = self._get_fund_holdings(fund["cik"], fund["name"])
                if fund_holdings is None:
                    continue

                quarter = fund_holdings.get("quarter", "")
                current = fund_holdings.get("current", {})
                previous = fund_holdings.get("previous", {})

                current_shares = current.get(symbol, 0)
                previous_shares = previous.get(symbol, 0)

                if current_shares > 0 or previous_shares > 0:
                    if previous_shares == 0 and current_shares > 0:
                        change_pct = 100.0  # New position
                        status = "new"
                    elif current_shares == 0 and previous_shares > 0:
                        change_pct = -100.0  # Exited
                        status = "exited"
                    else:
                        change_pct = ((current_shares - previous_shares) / previous_shares) * 100
                        status = "increased" if change_pct > 0 else "decreased" if change_pct < 0 else "unchanged"

                    holdings_data.append({
                        "fund": fund["name"],
                        "shares": current_shares,
                        "previous_shares": previous_shares,
                        "change_pct": round(change_pct, 2),
                        "status": status,
                    })
            except Exception as e:
                logger.debug(f"[InstitutionalAgent] Error fetching {fund['name']}: {e}")
                continue

        return self._score_holdings(symbol, holdings_data, quarter)

    def _get_fund_holdings(self, cik: str, fund_name: str) -> Optional[Dict]:
        """Get current and previous quarter holdings for a fund. Cached 24h."""
        cache_key = cik
        cached = self._holdings_cache.get(cache_key)
        if cached and (time.time() - cached["ts"]) < self._holdings_cache_ttl:
            return cached["data"]

        try:
            company = self._edgar.Company(cik)
            filings = company.get_filings(form="13F-HR")

            if not filings or len(filings) < 1:
                return None

            # Get latest filing
            latest = filings[0]
            current_holdings = {}
            previous_holdings = {}
            quarter = ""

            try:
                report = latest.obj()
                if hasattr(report, 'infotable') and report.infotable is not None:
                    df = report.infotable.to_pandas() if hasattr(report.infotable, 'to_pandas') else None
                    if df is not None and not df.empty:
                        # Map CUSIP/name to ticker if possible, or use nameOfIssuer
                        for _, row in df.iterrows():
                            name = str(row.get('nameOfIssuer', '')).upper()
                            shares = int(row.get('value', 0)) if 'value' in row else 0
                            # Try to match by name (imperfect but workable)
                            current_holdings[name] = shares

                quarter = getattr(latest, 'period_of_report', '') or ''
                if hasattr(quarter, 'strftime'):
                    quarter = quarter.strftime('%Y-Q%q') if hasattr(quarter, 'quarter') else str(quarter)
                else:
                    quarter = str(quarter)
            except Exception as e:
                logger.debug(f"[InstitutionalAgent] Parse error for {fund_name}: {e}")

            # Get previous filing for comparison
            if len(filings) >= 2:
                try:
                    prev = filings[1]
                    prev_report = prev.obj()
                    if hasattr(prev_report, 'infotable') and prev_report.infotable is not None:
                        prev_df = prev_report.infotable.to_pandas() if hasattr(prev_report.infotable, 'to_pandas') else None
                        if prev_df is not None and not prev_df.empty:
                            for _, row in prev_df.iterrows():
                                name = str(row.get('nameOfIssuer', '')).upper()
                                shares = int(row.get('value', 0)) if 'value' in row else 0
                                previous_holdings[name] = shares
                except Exception:
                    pass

            data = {
                "current": current_holdings,
                "previous": previous_holdings,
                "quarter": quarter,
            }

            self._holdings_cache[cache_key] = {"data": data, "ts": time.time()}
            return data

        except Exception as e:
            logger.debug(f"[InstitutionalAgent] Holdings fetch error for {fund_name}: {e}")
            return None

    def _score_holdings(
        self,
        symbol: str,
        holdings: List[Dict],
        quarter: str,
    ) -> InstitutionalFlowResult:
        """Score institutional positioning from holdings data."""
        if not holdings:
            return self._neutral_result(symbol, quarter=quarter)

        total_holding = len(holdings)
        increasing = sum(1 for h in holdings if h["status"] == "increased")
        decreasing = sum(1 for h in holdings if h["status"] == "decreased")
        new_pos = sum(1 for h in holdings if h["status"] == "new")
        exited = sum(1 for h in holdings if h["status"] == "exited")

        # Net sentiment: weighted by magnitude of change
        if total_holding == 0:
            net_score = 0.0
        else:
            buyers = increasing + new_pos
            sellers = decreasing + exited
            net_score = (buyers - sellers) / total_holding
            net_score = max(-1.0, min(1.0, net_score))

        # Label
        if net_score >= 0.5:
            label = "heavy_buying"
        elif net_score >= 0.15:
            label = "buying"
        elif net_score > -0.15:
            label = "neutral"
        elif net_score > -0.5:
            label = "selling"
        else:
            label = "heavy_selling"

        # Top holders sorted by current shares
        top = sorted(holdings, key=lambda h: h.get("shares", 0), reverse=True)[:5]
        top_holders = [
            {
                "fund": h["fund"],
                "shares": h["shares"],
                "change_pct": h["change_pct"],
                "status": h["status"],
            }
            for h in top
        ]

        return InstitutionalFlowResult(
            symbol=symbol,
            net_sentiment=round(net_score, 3),
            sentiment_label=label,
            total_funds_holding=total_holding,
            total_funds_increasing=increasing,
            total_funds_decreasing=decreasing,
            total_funds_new=new_pos,
            total_funds_exited=exited,
            top_holders=top_holders,
            filing_quarter=quarter,
            cached=False,
            last_updated=datetime.now().isoformat(),
        )

    async def _load_from_db(self, symbol: str) -> Optional[InstitutionalFlowResult]:
        """Load cached institutional data from DB."""
        pool = await self._get_pool()
        if not pool:
            return None
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch("""
                    SELECT fund_name, shares_current, shares_previous, shares_change,
                           pct_change, filing_quarter, fetched_at
                    FROM institutional_holdings
                    WHERE symbol = $1
                      AND fetched_at > NOW() - INTERVAL '7 days'
                    ORDER BY fetched_at DESC
                """, symbol)

                if not rows:
                    return None

                quarter = str(rows[0]['filing_quarter'])
                holdings = []
                for r in rows:
                    current = int(r['shares_current'] or 0)
                    previous = int(r['shares_previous'] or 0)
                    change_pct = float(r['pct_change'] or 0)

                    if previous == 0 and current > 0:
                        status = "new"
                    elif current == 0 and previous > 0:
                        status = "exited"
                    elif change_pct > 0:
                        status = "increased"
                    elif change_pct < 0:
                        status = "decreased"
                    else:
                        status = "unchanged"

                    holdings.append({
                        "fund": r['fund_name'],
                        "shares": current,
                        "previous_shares": previous,
                        "change_pct": change_pct,
                        "status": status,
                    })

                result = self._score_holdings(symbol, holdings, quarter)
                result.cached = True
                return result
        except Exception as e:
            logger.debug(f"[InstitutionalAgent] DB load error for {symbol}: {e}")
            return None

    async def _save_to_db(self, result: InstitutionalFlowResult):
        """Save institutional data to DB for cross-deploy persistence."""
        pool = await self._get_pool()
        if not pool or not result.top_holders:
            return
        try:
            async with pool.acquire() as conn:
                for h in result.top_holders:
                    prev_shares = h.get("previous_shares", 0)
                    curr_shares = h.get("shares", 0)
                    await conn.execute("""
                        INSERT INTO institutional_holdings
                            (symbol, fund_name, fund_cik, filing_quarter,
                             shares_current, shares_previous, shares_change,
                             value_usd, pct_change)
                        VALUES ($1, $2, '', $3, $4, $5, $6, 0, $7)
                        ON CONFLICT (symbol, fund_cik, filing_quarter)
                        DO UPDATE SET shares_current = $4, shares_previous = $5,
                                      shares_change = $6, pct_change = $7,
                                      fetched_at = NOW()
                    """,
                        result.symbol,
                        h["fund"],
                        result.filing_quarter,
                        curr_shares,
                        prev_shares,
                        curr_shares - prev_shares,
                        h["change_pct"],
                    )
        except Exception as e:
            logger.debug(f"[InstitutionalAgent] DB save error: {e}")

    @staticmethod
    def _neutral_result(symbol: str = "", quarter: str = "") -> InstitutionalFlowResult:
        """Fail-open neutral result."""
        return InstitutionalFlowResult(
            symbol=symbol,
            net_sentiment=0.0,
            sentiment_label="neutral",
            total_funds_holding=0,
            total_funds_increasing=0,
            total_funds_decreasing=0,
            total_funds_new=0,
            total_funds_exited=0,
            top_holders=[],
            filing_quarter=quarter,
            cached=False,
            last_updated=datetime.now().isoformat(),
        )

    def _get_cached(self, symbol: str) -> Optional[InstitutionalFlowResult]:
        entry = self._cache.get(symbol)
        if entry and (time.time() - entry["ts"]) < self.CACHE_TTL:
            result = entry["result"]
            result.cached = True
            return result
        return None

    def _set_cache(self, symbol: str, result: InstitutionalFlowResult):
        self._cache[symbol] = {"result": result, "ts": time.time()}

    def get_stats(self) -> Dict:
        return {
            "total_analyses": self.total_analyses,
            "total_cache_hits": self.total_cache_hits,
            "total_errors": self.total_errors,
            "cache_size": len(self._cache),
            "edgar_available": self._edgar is not None,
            "tracked_funds": len(TRACKED_FUNDS),
        }


# Singleton
institutional_agent = InstitutionalAgent()
