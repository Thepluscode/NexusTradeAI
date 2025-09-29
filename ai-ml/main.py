#!/usr/bin/env python3
"""
NexusTradeAI ML Service - Simplified Demo Version
High-performance AI/ML service for trading predictions
"""

import uvicorn
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
import os
from datetime import datetime
import asyncio
import random
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Simple configuration
class Settings:
    def __init__(self):
        self.app_name = "NexusTradeAI ML Service"
        self.version = "1.0.0"
        self.host = "0.0.0.0"
        self.port = 8001
        self.debug = True

settings = Settings()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log')
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Nexus Trade AI - ML Service",
    description="AI/ML service for price prediction and trading signals",
    version="0.1.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple mock prediction service for demo
class MockPredictionService:
    def __init__(self):
        self.model_loaded = True

    async def predict_price(self, symbol: str, steps_ahead: int = 1):
        # Mock prediction - in production this would use real ML models
        import random
        base_price = 150.0  # Mock base price
        prediction = base_price * (1 + random.uniform(-0.05, 0.05))  # ±5% variation
        confidence = random.uniform(0.7, 0.95)  # Mock confidence

        return {
            "symbol": symbol,
            "predicted_price": round(prediction, 2),
            "confidence": round(confidence, 3),
            "steps_ahead": steps_ahead,
            "timestamp": datetime.now().isoformat()
        }

    async def get_trading_signal(self, symbol: str):
        import random
        signals = ["BUY", "SELL", "HOLD"]
        signal = random.choice(signals)
        strength = random.uniform(0.5, 1.0)

        return {
            "symbol": symbol,
            "signal": signal,
            "strength": round(strength, 3),
            "timestamp": datetime.now().isoformat()
        }

# Initialize mock service
prediction_service = MockPredictionService()

# Models
class PredictionRequest(BaseModel):
    symbol: str
    steps_ahead: int = 1

class PredictionResponse(BaseModel):
    symbol: str
    predicted_price: float
    confidence: float
    steps_ahead: int
    timestamp: str

# Mock models for demo - in production these would be real ML models

# Update the TrainRequest model to include transformer model option
class TrainRequest(BaseModel):
    symbol: str
    data: List[Dict[str, Any]]
    sequence_length: int = 60
    features: List[str] = ['close', 'volume', 'high', 'low']
    model_type: str = 'lstm'  # Options: 'lstm', 'lstm_advanced', 'transformer'
    lstm_units: List[int] = [128, 64, 32]
    dropout_rate: float = 0.2
    learning_rate: float = 0.001
    # Transformer-specific parameters
    embed_dim: int = 128
    num_heads: int = 8
    ff_dim: int = 256
    num_blocks: int = 4

# Update the train model endpoint
@app.post("/train", status_code=status.HTTP_202_ACCEPTED)
async def train_model(train_request: TrainRequest):
    """Train a new prediction model"""
    try:
        # Convert data to DataFrame
        import pandas as pd
        df = pd.DataFrame(train_request.data)
        
        if train_request.model_type == 'transformer':
            # Create and train transformer model
            training_pipeline = TransformerTrainingPipeline()
            
            # Update config with request parameters
            training_pipeline.config['symbol'] = train_request.symbol
            training_pipeline.config['model']['sequence_length'] = train_request.sequence_length
            training_pipeline.config['model']['embed_dim'] = train_request.embed_dim
            training_pipeline.config['model']['num_heads'] = train_request.num_heads
            training_pipeline.config['model']['ff_dim'] = train_request.ff_dim
            training_pipeline.config['model']['num_blocks'] = train_request.num_blocks
            training_pipeline.config['model']['dropout_rate'] = train_request.dropout_rate
            training_pipeline.config['model']['learning_rate'] = train_request.learning_rate
            
            # Train the model
            result = training_pipeline.train(df)
            
            # Save the model
            model_path = f"models/{train_request.symbol.replace('/', '_')}_transformer"
            training_pipeline.save_model(model_path)
            
            return {
                "status": "success", 
                "message": f"Transformer model trained for {train_request.symbol}",
                "model_type": "transformer",
                "history": result['history'],
                "evaluation": result['evaluation']
            }
        elif train_request.model_type == 'lstm_advanced':
            # Create and train advanced LSTM model
            model = LSTMPricePredictor(
                symbol=train_request.symbol,
                sequence_length=train_request.sequence_length,
                n_features=len(train_request.features),
                lstm_units=train_request.lstm_units,
                dropout_rate=train_request.dropout_rate,
                learning_rate=train_request.learning_rate
            )
            
            # Train the model
            history = model.train(df)
            
            # Save the model
            model_path = f"models/{train_request.symbol.replace('/', '_')}_advanced"
            model.save_model(model_path)
            
            return {
                "status": "success", 
                "message": f"Advanced LSTM model trained for {train_request.symbol}",
                "model_type": "lstm_advanced",
                "history": history
            }
        else:  # Default to standard LSTM
            # Create and train standard model
            model = PricePredictionModel(
                symbol=train_request.symbol,
                sequence_length=train_request.sequence_length,
                features=train_request.features
            )
            
            # Train the model
            history = model.train(df)
            
            # Save the model
            model_path = f"models/{train_request.symbol.replace('/', '_')}"
            model.save_model(model_path)
            
            # Reload models in the prediction service
            await prediction_service.load_models([train_request.symbol])
            
            return {
                "status": "success", 
                "message": f"Standard LSTM model trained for {train_request.symbol}",
                "model_type": "lstm",
                "history": history
            }
    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=settings.WORKERS
    )
