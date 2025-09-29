import uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
import os
from datetime import datetime

from models.price_prediction.lstm.model import PredictionService, PricePredictionModel
from config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
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

# Initialize services
prediction_service = PredictionService(
    redis_url=settings.REDIS_URL
)

# Models
class PredictionRequest(BaseModel):
    symbol: str
    steps_ahead: int = 1

class PredictionResponse(BaseModel):
    symbol: str
    predictions: List[float]
    confidence: float
    current_price: float
    timestamp: str

class TrainRequest(BaseModel):
    symbol: str
    data: List[Dict[str, Any]]
    sequence_length: int = 60
    features: List[str] = ['close', 'volume', 'high', 'low']

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    try:
        # Connect to Redis
        await prediction_service.connect()
        
        # Load pre-trained models
        await prediction_service.load_models(settings.DEFAULT_SYMBOLS)
        
        logger.info("AI/ML Service started successfully")
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        raise

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "ai-ml",
        "version": "0.1.0"
    }

# Prediction endpoint
@app.post("/predict", response_model=PredictionResponse)
async def predict(prediction_request: PredictionRequest):
    """Get price prediction for a symbol"""
    try:
        result = await prediction_service.make_prediction(
            symbol=prediction_request.symbol,
            steps_ahead=prediction_request.steps_ahead
        )
        
        if not result:
            raise HTTPException(status_code=404, detail=f"No model found for symbol {prediction_request.symbol}")
            
        return result
    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Train model endpoint
@app.post("/train")
async def train_model(train_request: TrainRequest):
    """Train a new prediction model"""
    try:
        # Convert data to DataFrame
        import pandas as pd
        df = pd.DataFrame(train_request.data)
        
        # Create and train model
        model = PricePredictionModel(
            symbol=train_request.symbol,
            sequence_length=train_request.sequence_length,
            features=train_request.features
        )
        
        # Train the model
        history = model.train(df)
        
        # Save the model
        model_path = f"models/{train_request.symbol.replace('/', '_')}"
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        model.save_model(model_path)
        
        # Reload models in the prediction service
        await prediction_service.load_models([train_request.symbol])
        
        return {"status": "success", "message": f"Model trained for {train_request.symbol}"}
    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=settings.WORKERS
    )
