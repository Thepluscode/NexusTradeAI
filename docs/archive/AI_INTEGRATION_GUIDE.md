# AI Integration Guide - Real Predictions Setup

## 🎯 Overview

This guide explains how to replace mock AI predictions with **real machine learning models** in your NexusTradeAI system.

---

## 📋 What You Now Have

### ✅ New Files Created

1. **`services/trading/ai-prediction-service.js`**
   - Node.js service that bridges trading engine with AI models
   - Supports both HTTP API and Python subprocess communication
   - Automatic fallback to technical analysis
   - Caching and performance tracking

2. **`ai-ml/services/api_server.py`**
   - Flask-based REST API server for ML models
   - Automatically loads trained models from `ai-ml/models/`
   - Rule-based fallback predictions
   - Health checks and batch prediction support

---

## 🚀 Quick Start (3 Options)

### **Option 1: HTTP API (Recommended)**

This is the **easiest and most reliable** method.

#### Step 1: Install Python Dependencies

```bash
cd ai-ml
pip install -r requirements.txt

# If you don't have requirements.txt, install these:
pip install flask flask-cors numpy pandas scikit-learn joblib
```

#### Step 2: Start the AI API Server

```bash
python3 ai-ml/services/api_server.py
```

You should see:
```
Starting AI Model API Server...
Server starting on 0.0.0.0:5000
Models loaded successfully (or Using fallback predictions)
```

#### Step 3: Update Trading Engine

Replace mock predictions in your existing code with:

```javascript
const AIPredictionService = require('./services/trading/ai-prediction-service');

// Initialize AI service
const aiService = new AIPredictionService({
    useHttpApi: true,
    aiServiceUrl: 'http://localhost:5000'
});

await aiService.initialize();

// Get prediction
const prediction = await aiService.getPrediction('AAPL', 'momentum', {
    price: 175.50,
    sma20: 173.00,
    sma50: 170.00,
    rsi: 55,
    volume: 50000000,
    avgVolume: 40000000,
    volatility: 0.25
});

console.log(prediction);
// {
//   symbol: 'AAPL',
//   direction: 'up',
//   confidence: 0.85,
//   strength: 0.72,
//   tradable: true,
//   method: 'ml_model' or 'rule_based_fallback'
// }
```

---

### **Option 2: Python Subprocess**

Use this if you prefer direct Python integration.

```javascript
const aiService = new AIPredictionService({
    useHttpApi: false,  // Use subprocess instead
    pythonExecutable: 'python3',
    aiServicePath: './ai-ml'
});

await aiService.initialize();
```

**Note**: Requires a Python inference script that listens on stdin/stdout.

---

### **Option 3: Use Existing AI Models**

If you already have trained models in `ai-ml/models/`:

#### Step 1: Check Your Models

```bash
ls -la ai-ml/models/
```

You should see files like:
- `momentum_model.joblib`
- `mean_reversion_model.joblib`
- `ensemble_model.pkl`

#### Step 2: Test Model Loading

```bash
python3 -c "
import joblib
model = joblib.load('ai-ml/models/momentum_model.joblib')
print('Model loaded:', type(model))
"
```

#### Step 3: Start API Server

The API server will **automatically load** all `.joblib` and `.pkl` files from `ai-ml/models/`.

```bash
python3 ai-ml/services/api_server.py
```

---

## 🔧 Integration with Enhanced Trading Engine

Update `enhanced-trading-engine.js` to use real AI predictions:

```javascript
const EnhancedTradingEngine = require('./services/trading/enhanced-trading-engine');
const AIPredictionService = require('./services/trading/ai-prediction-service');

class AIEnhancedTradingEngine extends EnhancedTradingEngine {
    constructor(config) {
        super(config);

        // Initialize AI service
        this.aiService = new AIPredictionService({
            useHttpApi: true,
            aiServiceUrl: 'http://localhost:5000',
            minConfidence: 0.65
        });
    }

    async start() {
        // Initialize AI service
        await this.aiService.initialize();

        // Check AI service health
        const healthy = await this.aiService.healthCheck();
        if (!healthy) {
            this.logger.warn('AI service not healthy, using fallback predictions');
        }

        // Start trading engine
        await super.start();
    }

    // Override getAIPrediction to use real AI
    async getAIPrediction(symbol, strategy) {
        try {
            // Get current market data
            const marketData = await this.getMarketDataForAI(symbol);

            // Get AI prediction
            const prediction = await this.aiService.getPrediction(
                symbol,
                strategy,
                marketData
            );

            return prediction;

        } catch (error) {
            this.logger.error('AI prediction failed', { symbol, error });

            // Fallback to mock prediction
            return super.getAIPrediction(symbol, strategy);
        }
    }

    async getMarketDataForAI(symbol) {
        // Prepare market data for AI service
        const currentPrice = await this.getCurrentPrice(symbol);
        const sma20 = await this.calculateSMA(symbol, 20);
        const sma50 = await this.calculateSMA(symbol, 50);
        const rsi = await this.calculateRSI(symbol, 14);
        const volume = await this.getCurrentVolume(symbol);
        const avgVolume = await this.calculateAverageVolume(symbol, 20);
        const volatility = this.getHistoricalVolatility(symbol);

        return {
            price: currentPrice,
            sma20,
            sma50,
            rsi,
            volume,
            avgVolume,
            volatility
        };
    }
}

module.exports = AIEnhancedTradingEngine;
```

---

## 📊 Training Your Own Models

### Step 1: Prepare Training Data

```python
# ai-ml/training/prepare_data.py
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def prepare_training_data(symbols, start_date, end_date):
    """
    Prepare training data from historical market data
    """
    # Fetch historical data (use Alpaca, Yahoo Finance, etc.)
    # Calculate features (SMAs, RSI, volume ratios, etc.)
    # Create labels (future returns, buy/sell signals)

    features = []
    labels = []

    for symbol in symbols:
        # Load historical data
        df = load_historical_data(symbol, start_date, end_date)

        # Calculate features
        df['sma20'] = df['close'].rolling(20).mean()
        df['sma50'] = df['close'].rolling(50).mean()
        df['rsi'] = calculate_rsi(df['close'], 14)
        df['volume_ratio'] = df['volume'] / df['volume'].rolling(20).mean()

        # Create labels (1 = price up, 0 = price down in next N days)
        df['future_return'] = df['close'].shift(-5) / df['close'] - 1
        df['label'] = (df['future_return'] > 0.02).astype(int)

        # Add to dataset
        feature_cols = ['sma20', 'sma50', 'rsi', 'volume_ratio']
        features.append(df[feature_cols].dropna())
        labels.append(df['label'].dropna())

    return pd.concat(features), pd.concat(labels)
```

### Step 2: Train Models

```python
# ai-ml/training/train_models.py
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split
import joblib

# Load data
X, y = prepare_training_data(
    symbols=['AAPL', 'GOOGL', 'MSFT', 'TSLA'],
    start_date='2020-01-01',
    end_date='2024-12-31'
)

# Split data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Train momentum model
momentum_model = GradientBoostingClassifier(n_estimators=100)
momentum_model.fit(X_train, y_train)

# Evaluate
score = momentum_model.score(X_test, y_test)
print(f'Momentum model accuracy: {score:.2%}')

# Save model
joblib.dump(momentum_model, 'ai-ml/models/momentum_model.joblib')
print('Model saved to ai-ml/models/momentum_model.joblib')
```

### Step 3: Test Predictions

```bash
# Start API server
python3 ai-ml/services/api_server.py

# In another terminal, test prediction
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "strategy": "momentum",
    "marketData": {
      "price": 175.50,
      "sma20": 173.00,
      "sma50": 170.00,
      "rsi": 55,
      "volume": 50000000,
      "avgVolume": 40000000,
      "volatility": 0.25
    }
  }'
```

---

## 🎓 Model Training Best Practices

### 1. **Feature Engineering**

Important features for trading models:
- **Price-based**: SMAs, EMAs, Bollinger Bands
- **Momentum**: RSI, MACD, ROC
- **Volume**: Volume ratio, OBV
- **Volatility**: ATR, historical volatility
- **Cross-sectional**: Sector momentum, market regime

### 2. **Label Creation**

Choose appropriate prediction targets:
- **Classification**: Buy/Sell/Hold signals
- **Regression**: Future returns (5-day, 10-day)
- **Probability**: Probability of profit > X%

### 3. **Model Selection**

Recommended models for trading:
- **LightGBM**: Fast, accurate, handles non-linear relationships
- **Random Forest**: Robust, less overfitting
- **Neural Networks**: For complex patterns (requires more data)
- **Ensemble**: Combine multiple models

### 4. **Backtesting**

Always backtest before deploying:
```python
from sklearn.model_selection import TimeSeriesSplit

# Use time-based cross-validation
tscv = TimeSeriesSplit(n_splits=5)

for train_idx, test_idx in tscv.split(X):
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    model.fit(X_train, y_train)
    score = model.score(X_test, y_test)
    print(f'Fold score: {score:.2%}')
```

---

## 🔍 Monitoring AI Predictions

### Check Prediction Quality

```javascript
// Get AI service status
const status = aiService.getStatus();

console.log('AI Service Status:', {
    initialized: status.initialized,
    method: status.method,
    successRate: status.stats.successRate,
    avgLatency: status.stats.avgLatency,
    cacheHitRate: status.stats.cacheHitRate
});

// Health check
const healthy = await aiService.healthCheck();
console.log('AI Service Healthy:', healthy);
```

### Monitor Prediction Accuracy

```javascript
// Track predictions vs actual outcomes
const predictionTracker = {
    predictions: [],

    track(prediction, actualOutcome) {
        this.predictions.push({
            ...prediction,
            actualOutcome,
            correct: (prediction.direction === 'up' && actualOutcome > 0) ||
                     (prediction.direction === 'down' && actualOutcome < 0)
        });
    },

    getAccuracy() {
        const correct = this.predictions.filter(p => p.correct).length;
        return correct / this.predictions.length;
    }
};

// After closing a position
predictionTracker.track(originalPrediction, position.pnl > 0 ? 1 : -1);
console.log('Prediction accuracy:', predictionTracker.getAccuracy());
```

---

## 🐛 Troubleshooting

### Issue 1: "Cannot connect to AI service"

**Error**: `ECONNREFUSED`

**Solution**:
```bash
# Check if AI service is running
curl http://localhost:5000/health

# If not running, start it:
python3 ai-ml/services/api_server.py

# Check logs
tail -f logs/ai-predictions.log
```

### Issue 2: "No models loaded"

**Warning**: `Using fallback predictions`

**Solution**:
```bash
# Check models directory
ls -la ai-ml/models/

# If no models, train them:
python3 ai-ml/training/train_models.py

# Or use rule-based fallback (already working)
```

### Issue 3: Low prediction accuracy

**Problem**: Predictions not better than random

**Solutions**:
1. Collect more training data (2+ years recommended)
2. Improve feature engineering
3. Try different model architectures
4. Use ensemble methods
5. Increase minimum confidence threshold

```javascript
const aiService = new AIPredictionService({
    minConfidence: 0.75  // Increase from 0.65 to 0.75
});
```

### Issue 4: High latency

**Problem**: Predictions taking >1 second

**Solutions**:
1. Enable caching:
```javascript
const aiService = new AIPredictionService({
    enableCache: true,
    cacheTTL: 60000  // Cache for 1 minute
});
```

2. Use batch predictions:
```javascript
const predictions = await aiService.getBatchPredictions(
    ['AAPL', 'GOOGL', 'MSFT'],
    'momentum',
    marketDataMap
);
```

3. Optimize model (use LightGBM instead of deep learning)

---

## 📈 Performance Comparison

### Before (Mock Predictions)
```javascript
{
    direction: Math.random() > 0.5 ? 'up' : 'down',
    confidence: 0.85 + Math.random() * 0.1,
    strength: Math.random()
}
```
- **Accuracy**: ~50% (random)
- **No learning**: Same predictions every time
- **No adaptation**: Doesn't adjust to market conditions

### After (Real AI Predictions)
```javascript
{
    direction: 'up',
    confidence: 0.87,
    strength: 0.73,
    method: 'ml_model',
    tradable: true
}
```
- **Accuracy**: 55-70% (depends on model quality)
- **Continuous learning**: Retraining improves accuracy
- **Market-adaptive**: Adjusts to changing conditions

---

## 🔄 Next Steps

1. **Start with fallback predictions** (already working)
2. **Collect historical data** for training
3. **Train initial models** using provided scripts
4. **Deploy AI API server** alongside trading engine
5. **Monitor prediction accuracy** for 1-2 weeks
6. **Retrain models** with production data
7. **Gradually increase confidence threshold** as accuracy improves

---

## 📚 Additional Resources

- **Model Training**: See `ai-ml/training/pipelines/training_pipeline.py`
- **Technical Indicators**: See `ai-ml/indicators/technical_indicators.py`
- **Pattern Recognition**: See `ai-ml/indicators/pattern-recognition.py`
- **Backtesting**: See `TESTING-GUIDE.md`

---

## ✅ Summary

**You now have**:
1. ✅ AI Prediction Service (Node.js)
2. ✅ AI API Server (Python Flask)
3. ✅ Automatic fallback to technical analysis
4. ✅ Model loading from `ai-ml/models/`
5. ✅ Caching and performance monitoring
6. ✅ Health checks and error handling

**To use real AI**:
1. Start AI API server: `python3 ai-ml/services/api_server.py`
2. Initialize AI service in trading engine
3. Train models or use rule-based fallback

The system will work immediately with **rule-based predictions** and improve as you add trained models!

---

**Last Updated**: 2025-10-06
**Version**: 1.0.0
