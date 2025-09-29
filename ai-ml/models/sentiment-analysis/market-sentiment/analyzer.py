""
Market Sentiment Analysis Module

This module provides functionality to analyze market sentiment from various sources
including news articles, social media, and financial reports.
"""

import re
import json
import logging
from typing import Dict, List, Optional, Tuple, Union
from datetime import datetime
import numpy as np
import pandas as pd
from dataclasses import dataclass, asdict
from transformers import pipeline, AutoModelForSequenceClassification, AutoTokenizer
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logger = logging.getLogger(__name__)

@dataclass
class SentimentResult:
    """Container for sentiment analysis results."""
    text: str
    label: str
    score: float
    timestamp: str
    source: str = "unknown"
    metadata: Optional[Dict] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        result = asdict(self)
        if self.metadata is None:
            result['metadata'] = {}
        return result
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())

class MarketSentimentAnalyzer:
    """
    A class for performing market sentiment analysis on financial text data.
    Supports multiple sentiment analysis models and aggregation methods.
    """
    
    def __init__(
        self,
        model_name: str = "ProsusAI/finbert",
        use_gpu: bool = False,
        cache_dir: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize the MarketSentimentAnalyzer.
        
        Args:
            model_name: Name of the pre-trained model to use for sentiment analysis.
                       Can be a HuggingFace model name or path to a local model.
            use_gpu: Whether to use GPU for inference if available.
            cache_dir: Directory to cache the pre-trained models.
            **kwargs: Additional arguments to pass to the model.
        """
        self.model_name = model_name
        self.use_gpu = use_gpu
        self.cache_dir = cache_dir
        self.kwargs = kwargs
        
        # Initialize VADER for rule-based sentiment analysis
        self.vader = SentimentIntensityAnalyzer()
        
        # Initialize transformer-based model
        self._init_model()
        
        # Initialize tokenizer
        self._init_tokenizer()
    
    def _init_model(self):
        """Initialize the sentiment analysis model."""
        try:
            self.model = AutoModelForSequenceClassification.from_pretrained(
                self.model_name,
                cache_dir=self.cache_dir,
                **self.kwargs
            )
            
            if self.use_gpu:
                self.model = self.model.cuda()
                
            logger.info(f"Loaded model: {self.model_name}")
            
        except Exception as e:
            logger.error(f"Failed to load model {self.model_name}: {e}")
            raise
    
    def _init_tokenizer(self):
        """Initialize the tokenizer."""
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                cache_dir=self.cache_dir
            )
            logger.info(f"Loaded tokenizer for: {self.model_name}")
            
        except Exception as e:
            logger.error(f"Failed to load tokenizer for {self.model_name}: {e}")
            raise
    
    def preprocess_text(self, text: str) -> str:
        """
        Preprocess the input text before sentiment analysis.
        
        Args:
            text: Input text to preprocess.
            
        Returns:
            Preprocessed text.
        """
        if not isinstance(text, str):
            return ""
            
        # Remove URLs
        text = re.sub(r'http\S+|www\.\S+', '', text)
        # Remove special characters and numbers
        text = re.sub(r'[^a-zA-Z\s]', '', text)
        # Convert to lowercase
        text = text.lower()
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        return text
    
    def analyze_sentiment(
        self,
        text: str,
        source: str = "unknown",
        model_type: str = "transformer",
        return_all_scores: bool = False,
        **kwargs
    ) -> Union[SentimentResult, Dict]:
        """
        Analyze the sentiment of a given text.
        
        Args:
            text: Input text to analyze.
            source: Source of the text (e.g., 'news', 'twitter', 'reddit').
            model_type: Type of model to use ('transformer' or 'vader').
            return_all_scores: Whether to return scores for all labels.
            **kwargs: Additional arguments for the model.
            
        Returns:
            SentimentResult object or dictionary with sentiment analysis results.
        """
        if not text or not isinstance(text, str):
            logger.warning("Empty or invalid text provided for sentiment analysis.")
            return SentimentResult(
                text=text,
                label="neutral",
                score=0.0,
                timestamp=datetime.utcnow().isoformat(),
                source=source
            )
        
        try:
            if model_type.lower() == "vader":
                return self._analyze_with_vader(text, source, return_all_scores, **kwargs)
            else:
                return self._analyze_with_transformer(text, source, return_all_scores, **kwargs)
                
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {e}")
            return SentimentResult(
                text=text,
                label="error",
                score=0.0,
                timestamp=datetime.utcnow().isoformat(),
                source=source,
                metadata={"error": str(e)}
            )
    
    def _analyze_with_vader(
        self,
        text: str,
        source: str,
        return_all_scores: bool = False,
        **kwargs
    ) -> Union[SentimentResult, Dict]:
        """
        Analyze sentiment using VADER sentiment analysis.
        
        Args:
            text: Input text to analyze.
            source: Source of the text.
            return_all_scores: Whether to return scores for all labels.
            **kwargs: Additional arguments for VADER.
            
        Returns:
            Sentiment analysis results.
        """
        scores = self.vader.polarity_scores(text)
        
        if return_all_scores:
            return scores
            
        # Determine the sentiment label
        if scores['compound'] >= 0.05:
            label = "positive"
        elif scores['compound'] <= -0.05:
            label = "negative"
        else:
            label = "neutral"
        
        return SentimentResult(
            text=text,
            label=label,
            score=scores['compound'],
            timestamp=datetime.utcnow().isoformat(),
            source=source,
            metadata={"scores": scores}
        )
    
    def _analyze_with_transformer(
        self,
        text: str,
        source: str,
        return_all_scores: bool = False,
        **kwargs
    ) -> Union[SentimentResult, Dict]:
        """
        Analyze sentiment using a transformer-based model.
        
        Args:
            text: Input text to analyze.
            source: Source of the text.
            return_all_scores: Whether to return scores for all labels.
            **kwargs: Additional arguments for the model.
            
        Returns:
            Sentiment analysis results.
        """
        # Tokenize the input text
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        )
        
        # Move to GPU if available
        if self.use_gpu:
            inputs = {k: v.cuda() for k, v in inputs.items()}
        
        # Get model predictions
        with torch.no_grad():
            outputs = self.model(**inputs)
        
        # Get predicted probabilities
        probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
        
        # Get predicted label and score
        scores, indices = torch.max(probs, dim=1)
        label_idx = indices.item()
        score = scores.item()
        
        # Map label index to label name
        if hasattr(self.model.config, 'id2label'):
            label = self.model.config.id2label.get(label_idx, str(label_idx))
        else:
            # Default mapping for common sentiment analysis models
            label_map = {0: "negative", 1: "neutral", 2: "positive"}
            label = label_map.get(label_idx, str(label_idx))
        
        if return_all_scores:
            # Return scores for all labels
            all_scores = {
                self.model.config.id2label.get(i, str(i)): probs[0][i].item()
                for i in range(probs.shape[1])
            }
            return all_scores
        
        return SentimentResult(
            text=text,
            label=label,
            score=score,
            timestamp=datetime.utcnow().isoformat(),
            source=source,
            metadata={
                "model": self.model_name,
                "all_scores": {
                    self.model.config.id2label.get(i, str(i)): probs[0][i].item()
                    for i in range(probs.shape[1])
                }
            }
        )
    
    def batch_analyze(
        self,
        texts: List[str],
        sources: Optional[List[str]] = None,
        model_type: str = "transformer",
        batch_size: int = 32,
        **kwargs
    ) -> List[SentimentResult]:
        """
        Analyze sentiment for a batch of texts.
        
        Args:
            texts: List of texts to analyze.
            sources: List of sources for each text.
            model_type: Type of model to use ('transformer' or 'vader').
            batch_size: Number of texts to process in each batch.
            **kwargs: Additional arguments for the model.
            
        Returns:
            List of SentimentResult objects.
        """
        if not texts:
            return []
            
        if sources is None:
            sources = ["unknown"] * len(texts)
        elif len(sources) != len(texts):
            raise ValueError("Length of sources must match length of texts.")
        
        results = []
        
        if model_type.lower() == "vader":
            # Process one by one for VADER
            for text, source in zip(texts, sources):
                result = self.analyze_sentiment(
                    text=text,
                    source=source,
                    model_type=model_type,
                    **kwargs
                )
                results.append(result)
        else:
            # Process in batches for transformer models
            for i in range(0, len(texts), batch_size):
                batch_texts = texts[i:i + batch_size]
                batch_sources = sources[i:i + batch_size]
                
                # Tokenize batch
                inputs = self.tokenizer(
                    batch_texts,
                    return_tensors="pt",
                    truncation=True,
                    max_length=512,
                    padding=True
                )
                
                # Move to GPU if available
                if self.use_gpu:
                    inputs = {k: v.cuda() for k, v in inputs.items()}
                
                # Get model predictions
                with torch.no_grad():
                    outputs = self.model(**inputs)
                
                # Get predicted probabilities
                probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
                
                # Process each result in the batch
                for j in range(len(batch_texts)):
                    score, label_idx = torch.max(probs[j], dim=0)
                    label_idx = label_idx.item()
                    score = score.item()
                    
                    # Map label index to label name
                    if hasattr(self.model.config, 'id2label'):
                        label = self.model.config.id2label.get(label_idx, str(label_idx))
                    else:
                        # Default mapping for common sentiment analysis models
                        label_map = {0: "negative", 1: "neutral", 2: "positive"}
                        label = label_map.get(label_idx, str(label_idx))
                    
                    result = SentimentResult(
                        text=batch_texts[j],
                        label=label,
                        score=score,
                        timestamp=datetime.utcnow().isoformat(),
                        source=batch_sources[j],
                        metadata={
                            "model": self.model_name,
                            "all_scores": {
                                self.model.config.id2label.get(k, str(k)): v.item()
                                for k, v in enumerate(probs[j])
                            }
                        }
                    )
                    results.append(result)
        
        return results
    
    def aggregate_sentiment(
        self,
        results: List[SentimentResult],
        method: str = "mean"
    ) -> Dict[str, float]:
        """
        Aggregate sentiment scores from multiple results.
        
        Args:
            results: List of SentimentResult objects.
            method: Aggregation method ('mean', 'median', or 'majority_vote').
            
        Returns:
            Dictionary with aggregated sentiment scores.
        """
        if not results:
            return {}
        
        # Convert sentiment labels to numerical scores
        label_to_score = {"negative": -1, "neutral": 0, "positive": 1}
        
        if method == "mean":
            # Calculate mean sentiment score
            scores = [r.score * (1 if r.label == "positive" else -1 if r.label == "negative" else 0) 
                     for r in results]
            avg_score = sum(scores) / len(scores)
            
            # Map back to label
            if avg_score > 0.33:
                label = "positive"
            elif avg_score < -0.33:
                label = "negative"
            else:
                label = "neutral"
                
            return {
                "label": label,
                "score": avg_score,
                "count": len(results),
                "positive": sum(1 for r in results if r.label == "positive"),
                "neutral": sum(1 for r in results if r.label == "neutral"),
                "negative": sum(1 for r in results if r.label == "negative")
            }
            
        elif method == "median":
            # Calculate median sentiment score
            scores = [r.score * (1 if r.label == "positive" else -1 if r.label == "negative" else 0) 
                     for r in results]
            median_score = sorted(scores)[len(scores) // 2]
            
            # Map back to label
            if median_score > 0.33:
                label = "positive"
            elif median_score < -0.33:
                label = "negative"
            else:
                label = "neutral"
                
            return {
                "label": label,
                "score": median_score,
                "count": len(results)
            }
            
        elif method == "majority_vote":
            # Count occurrences of each label
            label_counts = {"positive": 0, "neutral": 0, "negative": 0}
            for r in results:
                if r.label in label_counts:
                    label_counts[r.label] += 1
                else:
                    label_counts["neutral"] += 1
            
            # Find the label with the most votes
            label = max(label_counts.items(), key=lambda x: x[1])[0]
            
            # Calculate average score for the majority label
            majority_scores = [r.score for r in results if r.label == label]
            avg_score = sum(majority_scores) / len(majority_scores) if majority_scores else 0.0
            
            return {
                "label": label,
                "score": avg_score,
                "count": len(results),
                **label_counts
            }
            
        else:
            raise ValueError(f"Unknown aggregation method: {method}")

# Example usage
if __name__ == "__main__":
    # Initialize the analyzer
    analyzer = MarketSentimentAnalyzer(use_gpu=False)
    
    # Example text
    texts = [
        "The stock market is performing exceptionally well this quarter.",
        "The company's earnings report was disappointing.",
        "The new product launch was met with mixed reviews."
    ]
    
    # Analyze sentiment
    results = analyzer.batch_analyze(
        texts=texts,
        sources=["news", "earnings", "product_reviews"]
    )
    
    # Print results
    for result in results:
        print(f"Text: {result.text[:50]}...")
        print(f"  Sentiment: {result.label} (Score: {result.score:.4f})")
        print(f"  Source: {result.source}")
        print()
    
    # Aggregate results
    aggregated = analyzer.aggregate_sentiment(results)
    print("\nAggregated Sentiment:")
    print(f"  Overall: {aggregated['label']} (Score: {aggregated['score']:.4f})")
    print(f"  Positive: {aggregated['positive']}, Neutral: {aggregated['neutral']}, "
          f"Negative: {aggregated['negative']}")
