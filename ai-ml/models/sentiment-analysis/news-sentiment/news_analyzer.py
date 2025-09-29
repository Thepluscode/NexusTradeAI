import pandas as pd
import numpy as np
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
from typing import Dict, List, Tuple
import logging
import re
from datetime import datetime, timedelta

class FinancialNewsAnalyzer:
    """
    Advanced financial news sentiment analyzer using transformer models
    """
    
    def __init__(self, model_name: str = "ProsusAI/finbert"):
        """
        Initialize news sentiment analyzer
        
        Args:
            model_name: Pre-trained model for financial sentiment analysis
        """
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self.sentiment_pipeline = pipeline(
            "sentiment-analysis",
            model=self.model,
            tokenizer=self.tokenizer,
            device=0 if torch.cuda.is_available() else -1
        )
        self.logger = logging.getLogger(__name__)
        
    def preprocess_text(self, text: str) -> str:
        """
        Preprocess news text for sentiment analysis
        
        Args:
            text: Raw news text
            
        Returns:
            Preprocessed text
        """
        # Remove URLs
        text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
        
        # Remove special characters but keep financial symbols
        text = re.sub(r'[^\w\s$%\-\.]', ' ', text)
        
        # Handle financial symbols and numbers
        text = re.sub(r'\$([A-Z]{1,5})\b', r'STOCK_\1', text)  # Stock symbols
        text = re.sub(r'(\d+\.?\d*)%', r'\1 percent', text)  # Percentages
        
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        return text.strip()
    
    def analyze_sentiment(self, text: str) -> Dict:
        """
        Analyze sentiment of financial news text
        
        Args:
            text: News article text
            
        Returns:
            Dictionary with sentiment scores
        """
        # Preprocess text
        processed_text = self.preprocess_text(text)
        
        # Truncate if too long
        max_length = self.tokenizer.model_max_length - 2  # Account for special tokens
        if len(processed_text.split()) > max_length:
            processed_text = ' '.join(processed_text.split()[:max_length])
        
        try:
            # Get sentiment prediction
            result = self.sentiment_pipeline(processed_text)[0]
            
            # Map labels to scores
            label_mapping = {
                'positive': 1,
                'negative': -1,
                'neutral': 0,
                'POSITIVE': 1,
                'NEGATIVE': -1,
                'NEUTRAL': 0
            }
            
            sentiment_score = label_mapping.get(result['label'], 0)
            confidence = result['score']
            
            # Extract financial entities and keywords
            financial_entities = self.extract_financial_entities(text)
            
            return {
                'sentiment_score': sentiment_score,
                'confidence': confidence,
                'label': result['label'],
                'financial_entities': financial_entities,
                'processed_text': processed_text
            }
            
        except Exception as e:
            self.logger.error(f"Error analyzing sentiment: {e}")
            return {
                'sentiment_score': 0,
                'confidence': 0,
                'label': 'neutral',
                'financial_entities': [],
                'processed_text': processed_text
            }
    
    def extract_financial_entities(self, text: str) -> List[str]:
        """
        Extract financial entities from text
        
        Args:
            text: Input text
            
        Returns:
            List of financial entities
        """
        entities = []
        
        # Stock symbols
        stock_pattern = r'\$([A-Z]{1,5})\b'
        stocks = re.findall(stock_pattern, text)
        entities.extend([f"${stock}" for stock in stocks])
        
        # Company names (simple pattern)
        company_pattern = r'\b([A-Z][a-z]+ (?:Inc|Corp|Ltd|LLC|Company|Group)\.?)\b'
        companies = re.findall(company_pattern, text)
        entities.extend(companies)
        
        # Financial terms
        financial_terms = [
            'earnings', 'revenue', 'profit', 'loss', 'quarterly', 'annual',
            'dividend', 'market', 'trading', 'stock', 'share', 'price',
            'investment', 'portfolio', 'fund', 'bond', 'equity', 'debt'
        ]
        
        for term in financial_terms:
            if term.lower() in text.lower():
                entities.append(term)
        
        return list(set(entities))
    
    def batch_analyze(self, news_data: pd.DataFrame) -> pd.DataFrame:
        """
        Batch analyze sentiment for multiple news articles
        
        Args:
            news_data: DataFrame with news articles
            
        Returns:
            DataFrame with sentiment analysis results
        """
        results = []
        
        for idx, row in news_data.iterrows():
            text = row.get('content', '') or row.get('text', '')
            if not text:
                continue
                
            sentiment_result = self.analyze_sentiment(text)
            
            result_row = {
                'id': row.get('id', idx),
                'timestamp': row.get('timestamp', datetime.now()),
                'title': row.get('title', ''),
                'symbol': row.get('symbol', ''),
                **sentiment_result
            }
            
            results.append(result_row)
        
        return pd.DataFrame(results)
    
    def calculate_sentiment_indicators(self, 
                                     sentiment_data: pd.DataFrame,
                                     symbol: str = None,
                                     window: int = 24) -> Dict:
        """
        Calculate sentiment indicators for trading signals
        
        Args:
            sentiment_data: DataFrame with sentiment scores
            symbol: Stock symbol to filter by
            window: Time window in hours
            
        Returns:
            Dictionary with sentiment indicators
        """
        # Filter by symbol if provided
        if symbol:
            data = sentiment_data[sentiment_data['symbol'] == symbol].copy()
        else:
            data = sentiment_data.copy()
        
        if data.empty:
            return {}
        
        # Ensure timestamp is datetime
        data['timestamp'] = pd.to_datetime(data['timestamp'])
        data = data.sort_values('timestamp')
        
        # Filter by time window
        cutoff_time = datetime.now() - timedelta(hours=window)
        recent_data = data[data['timestamp'] >= cutoff_time]
        
        if recent_data.empty:
            return {}
        
        # Calculate indicators
        avg_sentiment = recent_data['sentiment_score'].mean()
        sentiment_volatility = recent_data['sentiment_score'].std()
        news_volume = len(recent_data)
        
        # Weighted sentiment (more recent news has higher weight)
        time_weights = np.exp(-0.1 * (
            (datetime.now() - recent_data['timestamp']).dt.total_seconds() / 3600
        ))
        weighted_sentiment = np.average(
            recent_data['sentiment_score'], 
            weights=time_weights
        )
        
        # Sentiment momentum (trend)
        if len(recent_data) >= 5:
            recent_sentiment = recent_data.tail(5)['sentiment_score'].mean()
            older_sentiment = recent_data.head(5)['sentiment_score'].mean()
            sentiment_momentum = recent_sentiment - older_sentiment
        else:
            sentiment_momentum = 0
        
        return {
            'avg_sentiment': avg_sentiment,
            'weighted_sentiment': weighted_sentiment,
            'sentiment_volatility': sentiment_volatility,
            'sentiment_momentum': sentiment_momentum,
            'news_volume': news_volume,
            'last_updated': datetime.now()
        }
