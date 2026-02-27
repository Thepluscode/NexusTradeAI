# Machine Learning Architecture

**Version:** 1.0
**Date:** December 24, 2024
**Phase:** 2 - Strategy Development
**Status:** DESIGN APPROVED

---

## Executive Summary

This document defines the institutional-grade machine learning architecture for NexusTradeAI's algorithmic trading system. The architecture implements ensemble methods combining classical ML (Random Forest, XGBoost) with deep learning (LSTM, Transformer) to achieve 60%+ win rates with robust risk management.

### Architecture Objectives

- **Performance:** 60%+ win rate, Sharpe ratio > 2.0, profit factor > 2.0
- **Robustness:** Walk-forward validation, out-of-sample testing
- **Scalability:** Process 1M+ data points, train on 1000+ features
- **Reliability:** Automated retraining, model monitoring, fallback strategies
- **Maintainability:** Modular design, comprehensive logging, version control

### Success Metrics

| Metric | Minimum | Target | Excellent |
|--------|---------|--------|-----------|
| Win Rate | 55% | 60% | 65%+ |
| Sharpe Ratio | 1.5 | 2.0 | 2.5+ |
| Profit Factor | 1.5 | 2.0 | 2.5+ |
| Max Drawdown | < 15% | < 10% | < 5% |
| Calmar Ratio | 1.5 | 2.0 | 3.0+ |

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Data Pipeline](#data-pipeline)
3. [Feature Engineering](#feature-engineering)
4. [Model Ensemble](#model-ensemble)
5. [Training Pipeline](#training-pipeline)
6. [Backtesting Framework](#backtesting-framework)
7. [Deployment Strategy](#deployment-strategy)
8. [Monitoring & Retraining](#monitoring--retraining)

---

## System Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                              │
│  - Market Data API (Alpaca, Polygon)                           │
│  - Alternative Data (News, Sentiment, Economic)                │
│  - PostgreSQL (Historical OHLCV, Features, Labels)             │
│  - Redis (Real-time cache, Feature store)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Feature Engineering Layer                     │
│  - Technical Indicators (50+ indicators)                        │
│  - Statistical Features (volatility, correlation)              │
│  - Sentiment Features (news, social media)                     │
│  - Market Microstructure (order flow, volume profile)          │
│  - Feature Selection (1000+ → 200 most predictive)             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Model Training Layer                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │
│  │Random Forest│  │  XGBoost   │  │    LSTM    │  │Transform.│ │
│  │ (classical) │  │ (gradient) │  │(time-series│  │(attention│ │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘ │
│                              ↓                                   │
│                    ┌─────────────────┐                          │
│                    │ Ensemble Logic  │                          │
│                    │ (Meta-learner)  │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Backtesting & Validation                      │
│  - Walk-Forward Optimization                                    │
│  - Out-of-Sample Testing                                        │
│  - Monte Carlo Simulation                                       │
│  - Statistical Validation (p-value < 0.05)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Production Deployment                       │
│  - Model Serving API                                            │
│  - Real-time Prediction                                         │
│  - Performance Monitoring                                       │
│  - Automated Retraining                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**1. Data Pipeline**
- Collect market data from multiple sources
- Store in PostgreSQL with proper indexing
- Cache frequently accessed data in Redis
- Handle missing data and outliers

**2. Feature Engineering**
- Compute 50+ technical indicators
- Calculate statistical features
- Generate sentiment scores
- Create lagged features for time-series

**3. Model Ensemble**
- Train 4 independent models
- Combine predictions using meta-learner
- Handle model disagreement
- Provide confidence scores

**4. Backtesting Engine**
- Simulate historical trading
- Calculate performance metrics
- Detect overfitting
- Validate statistical significance

**5. Production Serving**
- Load trained models
- Generate predictions in < 100ms
- Monitor prediction drift
- Trigger retraining when needed

---

## Data Pipeline

### Data Sources

**Primary: Market Data**
- **Provider:** Alpaca Markets (primary), Polygon.io (backup)
- **Data:** OHLCV (Open, High, Low, Close, Volume)
- **Frequency:** 1-minute bars
- **History:** 5 years (for training)
- **Symbols:** 135+ liquid stocks

**Secondary: Alternative Data**
- **News Sentiment:** Finnhub, Alpha Vantage
- **Social Sentiment:** Twitter API, Reddit API
- **Economic Data:** FRED API (GDP, CPI, unemployment)
- **Options Data:** IVolatility (implied volatility, greeks)

### Data Collection Architecture

```python
# ai-ml/data/data_collector.py

class MarketDataCollector:
    """
    Collects and stores market data from multiple sources.

    Features:
    - Multi-source redundancy (Alpaca, Polygon)
    - Automatic gap filling
    - Data quality validation
    - PostgreSQL storage with partitioning
    """

    def __init__(self):
        self.alpaca = AlpacaClient()
        self.polygon = PolygonClient()
        self.db = DatabaseClient()
        self.redis = RedisClient()

    async def collect_historical_data(self, symbol: str, start_date: str, end_date: str):
        """
        Collect historical OHLCV data.

        Steps:
        1. Query primary source (Alpaca)
        2. Validate data quality
        3. Fill gaps from secondary source (Polygon)
        4. Store in PostgreSQL
        5. Cache recent data in Redis
        """
        pass

    async def collect_realtime_data(self, symbols: List[str]):
        """
        Stream real-time market data.

        Updates:
        - PostgreSQL (every 1 minute)
        - Redis (every tick)
        - WebSocket broadcast to clients
        """
        pass
```

### Database Schema

```sql
-- Market data (partitioned by date for performance)
CREATE TABLE market_data (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    open DECIMAL(12,4) NOT NULL,
    high DECIMAL(12,4) NOT NULL,
    low DECIMAL(12,4) NOT NULL,
    close DECIMAL(12,4) NOT NULL,
    volume BIGINT NOT NULL,
    vwap DECIMAL(12,4),
    trade_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Create partitions (monthly for efficient querying)
CREATE TABLE market_data_2024_12 PARTITION OF market_data
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- Indexes for fast queries
CREATE INDEX idx_market_data_symbol_time ON market_data (symbol, timestamp DESC);
CREATE INDEX idx_market_data_timestamp ON market_data (timestamp DESC);

-- Feature store (computed features)
CREATE TABLE feature_store (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    feature_set JSONB NOT NULL,  -- Flexible schema for features
    feature_version VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_feature_store_symbol_time ON feature_store (symbol, timestamp DESC);
CREATE INDEX idx_feature_store_version ON feature_store (feature_version);

-- Training labels (supervised learning targets)
CREATE TABLE training_labels (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    horizon VARCHAR(20) NOT NULL,  -- '1h', '4h', '1d'
    direction INTEGER NOT NULL,    -- 1 (long), 0 (neutral), -1 (short)
    return_pct DECIMAL(8,4) NOT NULL,
    confidence DECIMAL(4,3),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_training_labels_symbol_time ON training_labels (symbol, timestamp DESC);
```

### Data Quality Validation

```python
# ai-ml/data/data_validator.py

class DataValidator:
    """
    Validates market data quality.

    Checks:
    - No missing values in OHLCV
    - High >= Low >= 0
    - Open, Close within [Low, High]
    - Volume > 0
    - No duplicate timestamps
    - No gaps > 5 minutes during market hours
    """

    def validate_ohlcv(self, df: pd.DataFrame) -> Tuple[bool, List[str]]:
        """Returns (is_valid, error_messages)"""
        errors = []

        # Check for nulls
        if df.isnull().any().any():
            errors.append("Missing values detected")

        # Check OHLC relationships
        if not (df['high'] >= df['low']).all():
            errors.append("High < Low detected")

        if not ((df['open'] >= df['low']) & (df['open'] <= df['high'])).all():
            errors.append("Open outside [Low, High]")

        # Check for duplicates
        if df.duplicated(subset=['timestamp']).any():
            errors.append("Duplicate timestamps detected")

        return (len(errors) == 0, errors)
```

---

## Feature Engineering

### Feature Categories

**1. Technical Indicators (50+ features)**

```python
# ai-ml/features/technical_indicators.py

class TechnicalFeatures:
    """
    Computes technical analysis indicators.

    Categories:
    - Trend: SMA, EMA, MACD, ADX, Parabolic SAR
    - Momentum: RSI, Stochastic, CCI, Williams %R
    - Volatility: ATR, Bollinger Bands, Keltner Channels
    - Volume: OBV, MFI, Volume Profile, VWAP
    """

    @staticmethod
    def compute_all(df: pd.DataFrame) -> pd.DataFrame:
        """Compute all technical indicators"""

        # Trend indicators
        df['sma_20'] = df['close'].rolling(20).mean()
        df['sma_50'] = df['close'].rolling(50).mean()
        df['sma_200'] = df['close'].rolling(200).mean()
        df['ema_12'] = df['close'].ewm(span=12).mean()
        df['ema_26'] = df['close'].ewm(span=26).mean()

        # MACD
        df['macd'] = df['ema_12'] - df['ema_26']
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']

        # Momentum indicators
        df['rsi_14'] = TechnicalFeatures._compute_rsi(df['close'], 14)
        df['rsi_7'] = TechnicalFeatures._compute_rsi(df['close'], 7)

        # Stochastic
        df['stoch_k'], df['stoch_d'] = TechnicalFeatures._compute_stochastic(df, 14)

        # Volatility indicators
        df['atr_14'] = TechnicalFeatures._compute_atr(df, 14)
        df['bb_upper'], df['bb_middle'], df['bb_lower'] = TechnicalFeatures._compute_bollinger_bands(df, 20, 2)
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']

        # Volume indicators
        df['obv'] = TechnicalFeatures._compute_obv(df)
        df['mfi_14'] = TechnicalFeatures._compute_mfi(df, 14)
        df['volume_sma_20'] = df['volume'].rolling(20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma_20']

        return df

    @staticmethod
    def _compute_rsi(series: pd.Series, period: int) -> pd.Series:
        """Relative Strength Index"""
        delta = series.diff()
        gain = (delta.where(delta > 0, 0)).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))
```

**2. Statistical Features**

```python
# ai-ml/features/statistical_features.py

class StatisticalFeatures:
    """
    Computes statistical features.

    Features:
    - Returns (log returns, simple returns)
    - Volatility (realized, historical)
    - Higher moments (skewness, kurtosis)
    - Correlation (to market, sector)
    - Autocorrelation
    """

    @staticmethod
    def compute_all(df: pd.DataFrame, market_df: pd.DataFrame = None) -> pd.DataFrame:
        # Returns
        df['return_1'] = df['close'].pct_change(1)
        df['return_5'] = df['close'].pct_change(5)
        df['return_20'] = df['close'].pct_change(20)
        df['log_return'] = np.log(df['close'] / df['close'].shift(1))

        # Volatility (annualized)
        df['volatility_20'] = df['return_1'].rolling(20).std() * np.sqrt(252)
        df['volatility_60'] = df['return_1'].rolling(60).std() * np.sqrt(252)

        # Higher moments
        df['skewness_20'] = df['return_1'].rolling(20).skew()
        df['kurtosis_20'] = df['return_1'].rolling(20).kurt()

        # Autocorrelation
        df['autocorr_1'] = df['return_1'].rolling(20).apply(lambda x: x.autocorr(1))

        # Beta (if market data provided)
        if market_df is not None:
            df['beta'] = StatisticalFeatures._compute_beta(df, market_df, 60)

        return df

    @staticmethod
    def _compute_beta(stock_df: pd.DataFrame, market_df: pd.DataFrame, window: int) -> pd.Series:
        """Compute rolling beta vs market"""
        stock_returns = stock_df['return_1']
        market_returns = market_df['return_1']

        covariance = stock_returns.rolling(window).cov(market_returns)
        market_variance = market_returns.rolling(window).var()

        return covariance / market_variance
```

**3. Sentiment Features**

```python
# ai-ml/features/sentiment_features.py

class SentimentFeatures:
    """
    Computes sentiment features from news and social media.

    Sources:
    - News headlines (Finnhub, Alpha Vantage)
    - Social media (Twitter, Reddit)
    - Analyst ratings
    """

    def __init__(self):
        self.finnhub = FinnhubClient()
        self.sentiment_analyzer = TransformerSentimentAnalyzer()  # FinBERT

    async def compute_news_sentiment(self, symbol: str, lookback_hours: int = 24) -> Dict:
        """
        Analyze news sentiment.

        Returns:
        - sentiment_score: -1 to 1
        - sentiment_magnitude: 0 to 1
        - news_count: number of articles
        - headline_keywords: top keywords
        """
        news = await self.finnhub.get_news(symbol, lookback_hours)

        if not news:
            return {'sentiment_score': 0, 'sentiment_magnitude': 0, 'news_count': 0}

        sentiments = []
        for article in news:
            score = self.sentiment_analyzer.analyze(article['headline'])
            sentiments.append(score)

        return {
            'sentiment_score': np.mean([s['score'] for s in sentiments]),
            'sentiment_magnitude': np.mean([s['magnitude'] for s in sentiments]),
            'news_count': len(news),
            'positive_count': sum(1 for s in sentiments if s['score'] > 0.2),
            'negative_count': sum(1 for s in sentiments if s['score'] < -0.2)
        }
```

**4. Market Microstructure Features**

```python
# ai-ml/features/microstructure_features.py

class MicrostructureFeatures:
    """
    Computes market microstructure features.

    Features:
    - Order flow imbalance
    - Volume profile (high/low volume nodes)
    - Bid-ask spread
    - Trade intensity
    """

    @staticmethod
    def compute_order_flow_imbalance(trades_df: pd.DataFrame) -> float:
        """
        Compute order flow imbalance.

        OFI = (Buy Volume - Sell Volume) / Total Volume
        """
        buy_volume = trades_df[trades_df['side'] == 'buy']['volume'].sum()
        sell_volume = trades_df[trades_df['side'] == 'sell']['volume'].sum()
        total_volume = buy_volume + sell_volume

        if total_volume == 0:
            return 0

        return (buy_volume - sell_volume) / total_volume
```

### Feature Selection

**Goal:** Reduce 1000+ features to 200 most predictive

**Methods:**
1. **Correlation Analysis** - Remove highly correlated features (> 0.95)
2. **Mutual Information** - Rank features by mutual information with target
3. **Recursive Feature Elimination** - Use Random Forest for importance
4. **SHAP Values** - Understand feature contributions

```python
# ai-ml/features/feature_selector.py

class FeatureSelector:
    """
    Selects most predictive features.

    Steps:
    1. Remove low-variance features
    2. Remove highly correlated features
    3. Rank by mutual information
    4. Recursive feature elimination
    5. Select top N features
    """

    def select_features(self, X: pd.DataFrame, y: pd.Series, n_features: int = 200) -> List[str]:
        """Returns list of selected feature names"""

        # Step 1: Remove low variance
        from sklearn.feature_selection import VarianceThreshold
        selector = VarianceThreshold(threshold=0.01)
        selector.fit(X)
        high_var_features = X.columns[selector.get_support()].tolist()
        X_filtered = X[high_var_features]

        # Step 2: Remove high correlation
        corr_matrix = X_filtered.corr().abs()
        upper_triangle = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
        to_drop = [col for col in upper_triangle.columns if any(upper_triangle[col] > 0.95)]
        X_filtered = X_filtered.drop(columns=to_drop)

        # Step 3: Mutual information
        from sklearn.feature_selection import mutual_info_classif
        mi_scores = mutual_info_classif(X_filtered, y, random_state=42)
        mi_scores = pd.Series(mi_scores, index=X_filtered.columns).sort_values(ascending=False)

        # Select top N features
        selected_features = mi_scores.head(n_features).index.tolist()

        return selected_features
```

---

## Model Ensemble

### Ensemble Architecture

**Philosophy:** Combine diverse models to reduce overfitting and improve generalization.

**Models:**
1. **Random Forest** - Handles non-linear relationships, robust to outliers
2. **XGBoost** - Gradient boosting, excellent for tabular data
3. **LSTM** - Captures temporal dependencies in time-series
4. **Transformer** - Attention mechanism for complex patterns

**Ensemble Method:** Stacking with meta-learner

```
Individual Predictions:
  RF → 0.65 (long)
  XGBoost → 0.58 (long)
  LSTM → 0.72 (long)
  Transformer → 0.55 (neutral)
         ↓
  Meta-learner (Logistic Regression)
         ↓
  Final Prediction: 0.68 (long with high confidence)
```

### Model 1: Random Forest

```python
# ai-ml/models/random_forest_model.py

class RandomForestPredictor:
    """
    Random Forest classifier for trade direction prediction.

    Hyperparameters:
    - n_estimators: 500
    - max_depth: 20
    - min_samples_split: 100
    - class_weight: balanced
    """

    def __init__(self):
        from sklearn.ensemble import RandomForestClassifier
        self.model = RandomForestClassifier(
            n_estimators=500,
            max_depth=20,
            min_samples_split=100,
            min_samples_leaf=50,
            max_features='sqrt',
            class_weight='balanced',
            random_state=42,
            n_jobs=-1
        )

    def train(self, X_train: pd.DataFrame, y_train: pd.Series):
        """Train Random Forest model"""
        self.model.fit(X_train, y_train)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Returns probability for each class [short, neutral, long]"""
        return self.model.predict_proba(X)

    def get_feature_importance(self) -> pd.Series:
        """Returns feature importance scores"""
        return pd.Series(
            self.model.feature_importances_,
            index=self.model.feature_names_in_
        ).sort_values(ascending=False)
```

### Model 2: XGBoost

```python
# ai-ml/models/xgboost_model.py

class XGBoostPredictor:
    """
    XGBoost classifier for trade direction prediction.

    Hyperparameters:
    - max_depth: 8
    - learning_rate: 0.05
    - n_estimators: 300
    - subsample: 0.8
    """

    def __init__(self):
        import xgboost as xgb
        self.model = xgb.XGBClassifier(
            max_depth=8,
            learning_rate=0.05,
            n_estimators=300,
            subsample=0.8,
            colsample_bytree=0.8,
            gamma=0.1,
            reg_alpha=0.1,
            reg_lambda=1.0,
            scale_pos_weight=1,
            random_state=42,
            n_jobs=-1,
            tree_method='hist'  # Faster training
        )

    def train(self, X_train: pd.DataFrame, y_train: pd.Series,
              X_val: pd.DataFrame = None, y_val: pd.Series = None):
        """Train XGBoost with early stopping"""

        if X_val is not None:
            eval_set = [(X_train, y_train), (X_val, y_val)]
            self.model.fit(
                X_train, y_train,
                eval_set=eval_set,
                eval_metric='logloss',
                early_stopping_rounds=20,
                verbose=False
            )
        else:
            self.model.fit(X_train, y_train)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Returns probability for each class"""
        return self.model.predict_proba(X)
```

### Model 3: LSTM (Deep Learning)

```python
# ai-ml/models/lstm_model.py

import torch
import torch.nn as nn

class LSTMPredictor(nn.Module):
    """
    LSTM neural network for time-series prediction.

    Architecture:
    - 2 LSTM layers (128 hidden units each)
    - Dropout (0.3)
    - Fully connected output layer

    Input: (batch_size, sequence_length, n_features)
    Output: (batch_size, 3) - probabilities for [short, neutral, long]
    """

    def __init__(self, input_size: int, hidden_size: int = 128, num_layers: int = 2):
        super(LSTMPredictor, self).__init__()

        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.3 if num_layers > 1 else 0
        )

        self.dropout = nn.Dropout(0.3)
        self.fc = nn.Linear(hidden_size, 3)  # 3 classes
        self.softmax = nn.Softmax(dim=1)

    def forward(self, x):
        # x shape: (batch_size, seq_len, input_size)
        lstm_out, (h_n, c_n) = self.lstm(x)

        # Use last hidden state
        last_hidden = lstm_out[:, -1, :]

        # Dropout and fully connected
        out = self.dropout(last_hidden)
        out = self.fc(out)
        out = self.softmax(out)

        return out
```

### Model 4: Transformer

```python
# ai-ml/models/transformer_model.py

import torch
import torch.nn as nn

class TransformerPredictor(nn.Module):
    """
    Transformer model with multi-head attention.

    Architecture:
    - Positional encoding
    - 4 transformer encoder layers
    - Multi-head attention (8 heads)
    - Feed-forward network
    - Classification head
    """

    def __init__(self, input_size: int, d_model: int = 128, nhead: int = 8, num_layers: int = 4):
        super(TransformerPredictor, self).__init__()

        # Project input to d_model dimensions
        self.input_projection = nn.Linear(input_size, d_model)

        # Positional encoding
        self.pos_encoder = PositionalEncoding(d_model)

        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=512,
            dropout=0.1,
            batch_first=True
        )
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        # Classification head
        self.classifier = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 3),
            nn.Softmax(dim=1)
        )

    def forward(self, x):
        # x shape: (batch_size, seq_len, input_size)

        # Project to d_model
        x = self.input_projection(x)

        # Add positional encoding
        x = self.pos_encoder(x)

        # Transformer encoding
        x = self.transformer_encoder(x)

        # Use last sequence output
        x = x[:, -1, :]

        # Classification
        out = self.classifier(x)

        return out


class PositionalEncoding(nn.Module):
    """Positional encoding for transformer"""

    def __init__(self, d_model: int, max_len: int = 5000):
        super(PositionalEncoding, self).__init__()

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-np.log(10000.0) / d_model))

        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)

        self.register_buffer('pe', pe.unsqueeze(0))

    def forward(self, x):
        return x + self.pe[:, :x.size(1)]
```

### Ensemble Meta-Learner

```python
# ai-ml/models/ensemble.py

class EnsembleMetaLearner:
    """
    Combines predictions from multiple models using a meta-learner.

    Method: Stacking
    - Level 0: Base models (RF, XGBoost, LSTM, Transformer)
    - Level 1: Meta-learner (Logistic Regression)
    """

    def __init__(self):
        self.base_models = {
            'random_forest': RandomForestPredictor(),
            'xgboost': XGBoostPredictor(),
            'lstm': LSTMPredictor(input_size=200),
            'transformer': TransformerPredictor(input_size=200)
        }

        from sklearn.linear_model import LogisticRegression
        self.meta_learner = LogisticRegression(
            class_weight='balanced',
            random_state=42
        )

    def train(self, X_train: pd.DataFrame, y_train: pd.Series,
              X_val: pd.DataFrame, y_val: pd.Series):
        """
        Train ensemble with cross-validation.

        Steps:
        1. Train base models on training set
        2. Generate meta-features from base model predictions on validation set
        3. Train meta-learner on meta-features
        """

        # Train base models
        self.base_models['random_forest'].train(X_train, y_train)
        self.base_models['xgboost'].train(X_train, y_train, X_val, y_val)
        # ... (LSTM and Transformer training with PyTorch)

        # Generate meta-features
        meta_features = self._generate_meta_features(X_val)

        # Train meta-learner
        self.meta_learner.fit(meta_features, y_val)

    def _generate_meta_features(self, X: pd.DataFrame) -> np.ndarray:
        """Generate predictions from all base models"""
        predictions = []

        # RF predictions
        rf_pred = self.base_models['random_forest'].predict_proba(X)
        predictions.append(rf_pred)

        # XGBoost predictions
        xgb_pred = self.base_models['xgboost'].predict_proba(X)
        predictions.append(xgb_pred)

        # LSTM predictions
        # ... (convert to tensor, predict)

        # Transformer predictions
        # ... (convert to tensor, predict)

        # Concatenate all predictions
        meta_features = np.concatenate(predictions, axis=1)

        return meta_features

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Generate final ensemble prediction"""
        meta_features = self._generate_meta_features(X)
        return self.meta_learner.predict_proba(meta_features)

    def predict_with_confidence(self, X: pd.DataFrame) -> Dict:
        """
        Generate prediction with confidence score.

        Returns:
        - direction: -1 (short), 0 (neutral), 1 (long)
        - probability: confidence in prediction
        - base_model_agreement: % of models agreeing
        """
        proba = self.predict_proba(X)
        direction = np.argmax(proba, axis=1) - 1  # Convert to -1, 0, 1
        confidence = np.max(proba, axis=1)

        # Calculate base model agreement
        base_predictions = []
        for model in self.base_models.values():
            pred = np.argmax(model.predict_proba(X), axis=1) - 1
            base_predictions.append(pred)

        base_predictions = np.array(base_predictions)
        agreement = np.mean(base_predictions == direction[0]) * 100

        return {
            'direction': direction[0],
            'probability': confidence[0],
            'base_model_agreement': agreement
        }
```

---

## Training Pipeline

### Walk-Forward Optimization

**Concept:** Train on historical data, test on future unseen data, move forward in time.

```
Timeline:
[Train 1 (Jan-Jun)] → [Test 1 (Jul)] → [Train 2 (Feb-Jul)] → [Test 2 (Aug)] → ...

Prevents look-ahead bias
Simulates real trading conditions
```

```python
# ai-ml/training/walk_forward.py

class WalkForwardOptimizer:
    """
    Implements walk-forward optimization.

    Parameters:
    - train_window: 6 months
    - test_window: 1 month
    - step_size: 1 month
    """

    def __init__(self, train_window_months: int = 6, test_window_months: int = 1):
        self.train_window = pd.DateOffset(months=train_window_months)
        self.test_window = pd.DateOffset(months=test_window_months)

    def optimize(self, data: pd.DataFrame, target: pd.Series) -> List[Dict]:
        """
        Perform walk-forward optimization.

        Returns list of results for each fold:
        - train_start, train_end
        - test_start, test_end
        - metrics (accuracy, precision, recall, etc.)
        """
        results = []

        start_date = data.index.min()
        end_date = data.index.max()

        current_date = start_date + self.train_window

        while current_date + self.test_window <= end_date:
            # Define train and test periods
            train_start = current_date - self.train_window
            train_end = current_date
            test_start = current_date
            test_end = current_date + self.test_window

            # Split data
            train_data = data[(data.index >= train_start) & (data.index < train_end)]
            test_data = data[(data.index >= test_start) & (data.index < test_end)]

            train_target = target[(target.index >= train_start) & (target.index < train_end)]
            test_target = target[(target.index >= test_start) & (test.index < test_end)]

            # Train model
            ensemble = EnsembleMetaLearner()
            ensemble.train(train_data, train_target, test_data[:len(test_data)//2], test_target[:len(test_target)//2])

            # Test model
            predictions = ensemble.predict_proba(test_data)
            metrics = self._calculate_metrics(test_target, predictions)

            results.append({
                'train_start': train_start,
                'train_end': train_end,
                'test_start': test_start,
                'test_end': test_end,
                'metrics': metrics,
                'model': ensemble
            })

            # Move forward
            current_date += pd.DateOffset(months=1)

        return results

    def _calculate_metrics(self, y_true: pd.Series, y_pred_proba: np.ndarray) -> Dict:
        """Calculate performance metrics"""
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

        y_pred = np.argmax(y_pred_proba, axis=1)

        return {
            'accuracy': accuracy_score(y_true, y_pred),
            'precision': precision_score(y_true, y_pred, average='weighted'),
            'recall': recall_score(y_true, y_pred, average='weighted'),
            'f1_score': f1_score(y_true, y_pred, average='weighted')
        }
```

---

## Next Steps

This architecture document will be implemented in Week 5-6 with:

1. **Data Pipeline** - Market data collection and storage
2. **Feature Engineering** - 50+ technical indicators
3. **Model Training** - 4 ensemble models
4. **Backtesting** - Walk-forward validation
5. **Deployment** - Production model serving

**Target Metrics:**
- Win Rate: 60%+
- Sharpe Ratio: 2.0+
- Profit Factor: 2.0+
- Max Drawdown: < 10%

---

**Document Version:** 1.0
**Status:** APPROVED FOR IMPLEMENTATION
**Next Review:** After Phase 2 Week 5 completion

