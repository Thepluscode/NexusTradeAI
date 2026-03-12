"""
Sentiment Agent
===============

Fetches financial news headlines via free RSS feeds and scores sentiment
using keyword-based analysis. No LLM calls needed for basic scoring.

Pipeline position: Between MarketAgent and DecisionAgent in the orchestrator.

Features:
- Yahoo Finance + Google News RSS feeds
- ~50 bullish and ~50 bearish keywords
- 5-minute TTL cache per symbol
- Fail-open: returns neutral (0.0) if feeds unreachable
- Async HTTP via aiohttp
- RSS XML parsing via feedparser
"""

import logging
import time
import re
from dataclasses import dataclass, field
from typing import Dict, Optional

import aiohttp
import feedparser

logger = logging.getLogger(__name__)


# ========================================
# SENTIMENT RESULT
# ========================================

@dataclass
class SentimentResult:
    sentiment_score: float       # -1.0 to 1.0
    sentiment_label: str         # very_bearish, bearish, neutral, bullish, very_bullish
    headline_count: int
    top_headlines: list[str]     # top 5 most relevant
    bullish_count: int
    bearish_count: int
    cached: bool


# ========================================
# KEYWORD DICTIONARIES
# ========================================

BULLISH_KEYWORDS = [
    "surge", "surges", "surging", "soar", "soars", "soaring",
    "rally", "rallies", "rallying", "breakout", "breakthrough",
    "beats", "beat expectations", "exceeds", "tops estimates",
    "upgrade", "upgraded", "buy rating", "outperform",
    "record high", "all-time high", "new high", "52-week high",
    "bullish", "optimistic", "positive outlook", "strong buy",
    "growth", "growing", "accelerating", "expanding",
    "profit", "profitable", "earnings beat", "revenue beat",
    "dividend increase", "buyback", "share repurchase",
    "partnership", "acquisition", "deal", "contract win",
    "approval", "fda approval", "regulatory approval",
    "innovation", "launch", "new product", "expansion",
    "momentum", "uptrend", "recovery", "rebound",
    "demand", "strong demand", "outperformance",
    "analyst raises", "price target raised", "price target increase",
    "insider buying", "institutional buying",
]

BEARISH_KEYWORDS = [
    "crash", "crashes", "crashing", "plunge", "plunges", "plunging",
    "selloff", "sell-off", "selling", "tumble", "tumbles",
    "misses", "missed expectations", "falls short", "disappoints",
    "downgrade", "downgraded", "sell rating", "underperform",
    "record low", "52-week low", "new low", "lowest",
    "bearish", "pessimistic", "negative outlook", "warning",
    "loss", "losses", "losing", "unprofitable", "write-down",
    "earnings miss", "revenue miss", "guidance cut", "forecast cut",
    "dividend cut", "suspension", "delisting",
    "investigation", "sec investigation", "lawsuit", "fraud",
    "recall", "safety concern", "defect",
    "layoff", "layoffs", "restructuring", "job cuts",
    "debt", "bankruptcy", "default", "credit downgrade",
    "decline", "declining", "downturn", "recession",
    "volatility", "uncertainty", "risk", "headwind",
    "analyst lowers", "price target cut", "price target lowered",
    "insider selling", "institutional selling",
]

# Pre-compile patterns for efficient matching
_BULLISH_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(kw) for kw in BULLISH_KEYWORDS) + r')\b',
    re.IGNORECASE,
)
_BEARISH_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(kw) for kw in BEARISH_KEYWORDS) + r')\b',
    re.IGNORECASE,
)


# ========================================
# SENTIMENT AGENT
# ========================================

class SentimentAgent:
    """
    Fetches news headlines from free RSS feeds and scores sentiment
    using keyword-based analysis. 5-minute cache per symbol.
    """

    CACHE_TTL = 300  # 5 minutes

    def __init__(self):
        self._cache: Dict[str, Dict] = {}  # symbol -> {result: SentimentResult, ts: float}
        self.total_analyses = 0
        self.total_cache_hits = 0
        self.total_errors = 0

    async def analyze(self, symbol: str, asset_class: str = "stock") -> SentimentResult:
        """
        Analyze sentiment for a symbol by fetching RSS headlines.
        Returns SentimentResult. Fail-open: neutral on any error.
        """
        # Check cache first
        cache_key = f"{symbol}:{asset_class}"
        cached = self._get_cached(cache_key)
        if cached:
            self.total_cache_hits += 1
            return cached

        self.total_analyses += 1

        try:
            headlines = await self._fetch_headlines(symbol, asset_class)
            result = self._score_headlines(headlines)
            self._set_cache(cache_key, result)
            return result
        except Exception as e:
            self.total_errors += 1
            logger.error(f"[SentimentAgent] Error analyzing {symbol}: {e}")
            return self._neutral_result()

    async def _fetch_headlines(self, symbol: str, asset_class: str) -> list[str]:
        """Fetch headlines from multiple RSS feeds."""
        urls = self._build_feed_urls(symbol, asset_class)
        headlines = []

        timeout = aiohttp.ClientTimeout(total=10)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                for url in urls:
                    try:
                        async with session.get(url, headers={
                            "User-Agent": "NexusTradeAI/1.0 (RSS Reader)"
                        }) as resp:
                            if resp.status == 200:
                                text = await resp.text()
                                feed = feedparser.parse(text)
                                for entry in feed.entries[:20]:
                                    title = entry.get("title", "").strip()
                                    if title:
                                        headlines.append(title)
                    except Exception as e:
                        logger.debug(f"[SentimentAgent] Feed fetch error ({url}): {e}")
                        continue
        except Exception as e:
            logger.debug(f"[SentimentAgent] Session error: {e}")

        # Deduplicate while preserving order
        seen = set()
        unique = []
        for h in headlines:
            h_lower = h.lower()
            if h_lower not in seen:
                seen.add(h_lower)
                unique.append(h)

        return unique

    def _build_feed_urls(self, symbol: str, asset_class: str) -> list[str]:
        """Build RSS feed URLs based on asset class."""
        urls = []

        if asset_class == "forex":
            # Convert EUR_USD -> "EUR USD forex"
            pair = symbol.replace("_", " ").replace("/", " ")
            search_term = f"{pair} forex"
            urls.append(
                f"https://news.google.com/rss/search?q={search_term.replace(' ', '+')}&hl=en-US&gl=US&ceid=US:en"
            )
        elif asset_class == "crypto":
            # Map common symbols to readable names
            crypto_names = {
                "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
                "ADA": "cardano", "DOT": "polkadot", "AVAX": "avalanche",
                "MATIC": "polygon", "LINK": "chainlink", "XRP": "ripple",
                "DOGE": "dogecoin", "BNB": "binance coin", "LTC": "litecoin",
            }
            # Strip USD/USDT suffix
            base = symbol.replace("USDT", "").replace("USD", "").replace("/", "")
            name = crypto_names.get(base, base)
            search_term = f"{name} crypto"
            urls.append(
                f"https://news.google.com/rss/search?q={search_term.replace(' ', '+')}&hl=en-US&gl=US&ceid=US:en"
            )
        else:
            # Stocks: Yahoo Finance + Google News
            urls.append(
                f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US"
            )
            urls.append(
                f"https://news.google.com/rss/search?q={symbol}+stock&hl=en-US&gl=US&ceid=US:en"
            )

        return urls

    def _score_headlines(self, headlines: list[str]) -> SentimentResult:
        """Score a list of headlines using keyword matching."""
        if not headlines:
            return self._neutral_result()

        total_bullish = 0
        total_bearish = 0

        # Score each headline and track relevance
        scored_headlines = []
        for h in headlines:
            bull = len(_BULLISH_PATTERN.findall(h))
            bear = len(_BEARISH_PATTERN.findall(h))
            total_bullish += bull
            total_bearish += bear
            relevance = bull + bear
            scored_headlines.append((h, relevance))

        # Sort by relevance (most keyword matches first), then take top 5
        scored_headlines.sort(key=lambda x: x[1], reverse=True)
        top_headlines = [h for h, _ in scored_headlines[:5]]

        # Calculate score
        total_found = total_bullish + total_bearish
        if total_found == 0:
            score = 0.0
        else:
            score = (total_bullish - total_bearish) / total_found
            score = max(-1.0, min(1.0, score))

        # Label
        label = self._score_to_label(score)

        return SentimentResult(
            sentiment_score=round(score, 3),
            sentiment_label=label,
            headline_count=len(headlines),
            top_headlines=top_headlines,
            bullish_count=total_bullish,
            bearish_count=total_bearish,
            cached=False,
        )

    @staticmethod
    def _score_to_label(score: float) -> str:
        if score <= -0.6:
            return "very_bearish"
        elif score <= -0.2:
            return "bearish"
        elif score < 0.2:
            return "neutral"
        elif score < 0.6:
            return "bullish"
        else:
            return "very_bullish"

    @staticmethod
    def _neutral_result() -> SentimentResult:
        """Fail-open neutral result."""
        return SentimentResult(
            sentiment_score=0.0,
            sentiment_label="neutral",
            headline_count=0,
            top_headlines=[],
            bullish_count=0,
            bearish_count=0,
            cached=False,
        )

    def _get_cached(self, key: str) -> Optional[SentimentResult]:
        entry = self._cache.get(key)
        if entry and (time.time() - entry["ts"]) < self.CACHE_TTL:
            result = entry["result"]
            # Return a copy with cached=True
            return SentimentResult(
                sentiment_score=result.sentiment_score,
                sentiment_label=result.sentiment_label,
                headline_count=result.headline_count,
                top_headlines=result.top_headlines,
                bullish_count=result.bullish_count,
                bearish_count=result.bearish_count,
                cached=True,
            )
        return None

    def _set_cache(self, key: str, result: SentimentResult):
        self._cache[key] = {"result": result, "ts": time.time()}

    def get_stats(self) -> Dict:
        return {
            "total_analyses": self.total_analyses,
            "total_cache_hits": self.total_cache_hits,
            "total_errors": self.total_errors,
            "cache_size": len(self._cache),
        }
