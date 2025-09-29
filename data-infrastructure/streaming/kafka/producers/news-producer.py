#!/usr/bin/env python3
"""
News Producer for Nexus Trade AI
Streams financial news and sentiment data to Kafka topics for real-time analysis.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import hashlib
import re

import aiohttp
import aiokafka
import feedparser
from bs4 import BeautifulSoup
import nltk
from textblob import TextBlob

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class NewsArticle:
    """News article data structure"""
    article_id: str
    title: str
    content: str
    summary: str
    source: str
    author: Optional[str]
    published_at: int
    url: str
    category: str
    tags: List[str]
    sentiment_score: float
    sentiment_label: str  # 'positive', 'negative', 'neutral'
    relevance_score: float
    symbols_mentioned: List[str]
    language: str = 'en'
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)

class NewsProducer:
    """Financial news producer with sentiment analysis"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.producer = None
        self.session = None
        self.running = False
        self.processed_articles = set()  # Deduplication
        self.stats = {
            'articles_processed': 0,
            'articles_sent': 0,
            'errors': 0,
            'start_time': time.time()
        }
        
        # Financial keywords for relevance scoring
        self.financial_keywords = {
            'market', 'stock', 'trading', 'investment', 'earnings', 'revenue',
            'profit', 'loss', 'dividend', 'merger', 'acquisition', 'ipo',
            'cryptocurrency', 'bitcoin', 'ethereum', 'forex', 'commodity',
            'oil', 'gold', 'inflation', 'interest', 'rate', 'fed', 'central',
            'bank', 'economy', 'gdp', 'unemployment', 'retail', 'sales'
        }
        
        # News sources configuration
        self.news_sources = config.get('news_sources', {
            'reuters': 'http://feeds.reuters.com/reuters/businessNews',
            'bloomberg': 'https://feeds.bloomberg.com/markets/news.rss',
            'cnbc': 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
            'marketwatch': 'http://feeds.marketwatch.com/marketwatch/marketpulse/',
            'yahoo_finance': 'https://feeds.finance.yahoo.com/rss/2.0/headline'
        })
    
    async def initialize(self):
        """Initialize producer and HTTP session"""
        try:
            # Initialize Kafka producer
            self.producer = aiokafka.AIOKafkaProducer(
                bootstrap_servers=self.config['kafka']['bootstrap_servers'],
                value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
                key_serializer=lambda k: k.encode('utf-8') if k else None,
                acks=1,
                retries=3,
                compression_type='gzip',
                batch_size=16384,
                linger_ms=100
            )
            
            await self.producer.start()
            
            # Initialize HTTP session
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30),
                headers={'User-Agent': 'NexusTradeAI-NewsBot/1.0'}
            )
            
            logger.info("News producer initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize news producer: {e}")
            raise
    
    async def start_streaming(self):
        """Start streaming news from all sources"""
        self.running = True
        logger.info("Starting news streaming...")
        
        # Create tasks for each news source
        tasks = []
        for source_name, source_url in self.news_sources.items():
            task = asyncio.create_task(
                self._stream_from_source(source_name, source_url)
            )
            tasks.append(task)
        
        # Add statistics reporting task
        tasks.append(asyncio.create_task(self._report_statistics()))
        
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Error in news streaming: {e}")
        finally:
            await self.cleanup()
    
    async def _stream_from_source(self, source_name: str, source_url: str):
        """Stream news from a specific RSS source"""
        while self.running:
            try:
                logger.debug(f"Fetching news from {source_name}")
                
                # Fetch RSS feed
                async with self.session.get(source_url) as response:
                    if response.status == 200:
                        content = await response.text()
                        feed = feedparser.parse(content)
                        
                        # Process each article
                        for entry in feed.entries:
                            if not self.running:
                                break
                                
                            article = await self._process_article(entry, source_name)
                            if article:
                                await self._send_article(article)
                    else:
                        logger.warning(f"Failed to fetch from {source_name}: {response.status}")
                
                # Wait before next fetch
                await asyncio.sleep(self.config.get('fetch_interval', 300))  # 5 minutes
                
            except Exception as e:
                logger.error(f"Error streaming from {source_name}: {e}")
                await asyncio.sleep(60)  # Wait 1 minute on error
    
    async def _process_article(self, entry, source: str) -> Optional[NewsArticle]:
        """Process RSS entry into NewsArticle"""
        try:
            # Generate article ID for deduplication
            article_id = hashlib.md5(
                f"{entry.get('link', '')}{entry.get('title', '')}".encode()
            ).hexdigest()
            
            if article_id in self.processed_articles:
                return None
            
            self.processed_articles.add(article_id)
            
            # Extract content
            title = entry.get('title', '')
            content = self._extract_content(entry)
            summary = entry.get('summary', '')[:500]  # Limit summary length
            
            # Parse published date
            published_at = self._parse_published_date(entry)
            
            # Perform sentiment analysis
            sentiment_score, sentiment_label = self._analyze_sentiment(title + ' ' + content)
            
            # Calculate relevance score
            relevance_score = self._calculate_relevance(title + ' ' + content)
            
            # Extract mentioned symbols
            symbols_mentioned = self._extract_symbols(title + ' ' + content)
            
            # Categorize article
            category = self._categorize_article(title + ' ' + content)
            
            # Extract tags
            tags = self._extract_tags(entry)
            
            article = NewsArticle(
                article_id=article_id,
                title=title,
                content=content,
                summary=summary,
                source=source,
                author=entry.get('author'),
                published_at=published_at,
                url=entry.get('link', ''),
                category=category,
                tags=tags,
                sentiment_score=sentiment_score,
                sentiment_label=sentiment_label,
                relevance_score=relevance_score,
                symbols_mentioned=symbols_mentioned
            )
            
            self.stats['articles_processed'] += 1
            return article
            
        except Exception as e:
            logger.error(f"Error processing article: {e}")
            return None
    
    def _extract_content(self, entry) -> str:
        """Extract clean text content from RSS entry"""
        content = entry.get('content', [{}])
        if content and isinstance(content, list):
            text = content[0].get('value', '')
        else:
            text = entry.get('summary', '')
        
        # Clean HTML
        if text:
            soup = BeautifulSoup(text, 'html.parser')
            return soup.get_text().strip()
        
        return ''
    
    def _parse_published_date(self, entry) -> int:
        """Parse published date to timestamp"""
        try:
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                return int(dt.timestamp() * 1000)
        except:
            pass
        
        return int(time.time() * 1000)
    
    def _analyze_sentiment(self, text: str) -> tuple[float, str]:
        """Analyze sentiment of text"""
        try:
            blob = TextBlob(text)
            polarity = blob.sentiment.polarity
            
            if polarity > 0.1:
                label = 'positive'
            elif polarity < -0.1:
                label = 'negative'
            else:
                label = 'neutral'
            
            return polarity, label
            
        except Exception as e:
            logger.warning(f"Sentiment analysis failed: {e}")
            return 0.0, 'neutral'
    
    def _calculate_relevance(self, text: str) -> float:
        """Calculate relevance score based on financial keywords"""
        text_lower = text.lower()
        matches = sum(1 for keyword in self.financial_keywords if keyword in text_lower)
        return min(matches / 10.0, 1.0)  # Normalize to 0-1
    
    def _extract_symbols(self, text: str) -> List[str]:
        """Extract stock symbols from text"""
        # Simple regex for stock symbols (3-5 uppercase letters)
        pattern = r'\b[A-Z]{3,5}\b'
        symbols = re.findall(pattern, text)
        
        # Filter common false positives
        false_positives = {'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'BUT', 'WILL', 'NEW', 'WHO', 'OIL', 'CEO', 'CFO', 'IPO', 'SEC', 'FDA', 'GDP', 'CPI'}
        
        return [s for s in symbols if s not in false_positives][:10]  # Limit to 10 symbols
    
    def _categorize_article(self, text: str) -> str:
        """Categorize article based on content"""
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['crypto', 'bitcoin', 'ethereum', 'blockchain']):
            return 'cryptocurrency'
        elif any(word in text_lower for word in ['stock', 'equity', 'share', 'nasdaq', 'nyse']):
            return 'stocks'
        elif any(word in text_lower for word in ['forex', 'currency', 'dollar', 'euro', 'yen']):
            return 'forex'
        elif any(word in text_lower for word in ['commodity', 'oil', 'gold', 'silver', 'copper']):
            return 'commodities'
        elif any(word in text_lower for word in ['fed', 'central bank', 'interest rate', 'monetary']):
            return 'monetary_policy'
        elif any(word in text_lower for word in ['earnings', 'revenue', 'profit', 'quarterly']):
            return 'earnings'
        else:
            return 'general'
    
    def _extract_tags(self, entry) -> List[str]:
        """Extract tags from RSS entry"""
        tags = []
        
        if hasattr(entry, 'tags'):
            tags.extend([tag.term for tag in entry.tags])
        
        if hasattr(entry, 'category'):
            tags.append(entry.category)
        
        return tags[:5]  # Limit to 5 tags
    
    async def _send_article(self, article: NewsArticle):
        """Send article to appropriate Kafka topic"""
        try:
            # Determine topic based on category
            topic = f"news-{article.category}"
            
            # Send to Kafka
            await self.producer.send(
                topic=topic,
                value=article.to_dict(),
                key=article.article_id,
                timestamp_ms=article.published_at
            )
            
            self.stats['articles_sent'] += 1
            logger.debug(f"Article {article.article_id} sent to {topic}")
            
        except Exception as e:
            logger.error(f"Failed to send article {article.article_id}: {e}")
            self.stats['errors'] += 1
    
    async def _report_statistics(self):
        """Report statistics periodically"""
        while self.running:
            await asyncio.sleep(300)  # Every 5 minutes
            
            uptime = time.time() - self.stats['start_time']
            rate = self.stats['articles_sent'] / uptime if uptime > 0 else 0
            
            logger.info(
                f"News Producer Stats - "
                f"Processed: {self.stats['articles_processed']}, "
                f"Sent: {self.stats['articles_sent']}, "
                f"Errors: {self.stats['errors']}, "
                f"Rate: {rate:.2f} articles/sec"
            )
    
    async def cleanup(self):
        """Cleanup resources"""
        self.running = False
        
        if self.producer:
            await self.producer.stop()
        
        if self.session:
            await self.session.close()
        
        logger.info("News producer stopped")

# Example usage
async def main():
    config = {
        'kafka': {
            'bootstrap_servers': ['localhost:9092']
        },
        'fetch_interval': 300
    }
    
    producer = NewsProducer(config)
    await producer.initialize()
    
    try:
        await producer.start_streaming()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await producer.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
