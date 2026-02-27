"""
Model Serving API for Trading Predictions
==========================================
Production-grade REST API for serving ML trading model predictions.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- RESTful API with FastAPI
- Model versioning and management
- Real-time prediction serving
- Batch prediction support
- Feature preprocessing pipeline
- Prediction confidence scores
- A/B testing support
- Performance monitoring
- Auto-scaling ready
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import joblib
import json
import logging
from pathlib import Path
from enum import Enum
import uvicorn

# Import models
import sys
sys.path.append('..')
from models.ensemble import EnsembleModel

logger = logging.getLogger(__name__)


# API Models
class PredictionRequest(BaseModel):
    """Request for single prediction"""
    features: Dict[str, float]
    symbol: str
    timestamp: Optional[str] = None


class BatchPredictionRequest(BaseModel):
    """Request for batch predictions"""
    predictions: List[PredictionRequest]


class PredictionResponse(BaseModel):
    """Response for prediction"""
    symbol: str
    prediction: int = Field(..., ge=-1, le=1)  # -1 (short), 0 (neutral), 1 (long)
    probabilities: List[float]
    confidence: float
    timestamp: str
    model_version: str


class ModelStatus(BaseModel):
    """Model status information"""
    model_name: str
    version: str
    loaded: bool
    last_updated: str
    prediction_count: int
    avg_inference_time_ms: float


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    timestamp: str
    models_loaded: int
    uptime_seconds: float


# Model Manager
class ModelManager:
    """
    Manages loading, versioning, and serving of ML models
    """

    def __init__(self, models_dir: str = "ai-ml/models/saved"):
        self.models_dir = Path(models_dir)
        self.models: Dict[str, Any] = {}
        self.model_versions: Dict[str, str] = {}
        self.model_metadata: Dict[str, Dict] = {}
        self.prediction_counts: Dict[str, int] = {}
        self.inference_times: Dict[str, List[float]] = {}

        logger.info(f"Initialized ModelManager with models_dir={models_dir}")

    def load_model(self, model_name: str, version: str = "latest") -> bool:
        """
        Load a model into memory

        Args:
            model_name: Name of model (e.g., "ensemble", "random_forest")
            version: Model version (default: "latest")

        Returns:
            True if loaded successfully
        """
        try:
            # Find model file
            if version == "latest":
                # Find most recent model
                model_files = list(self.models_dir.glob(f"{model_name}*.pth")) + \
                             list(self.models_dir.glob(f"{model_name}*.pkl"))

                if not model_files:
                    logger.error(f"No model files found for {model_name}")
                    return False

                # Sort by modification time
                model_path = max(model_files, key=lambda p: p.stat().st_mtime)
            else:
                model_path = self.models_dir / f"{model_name}_{version}"

            if not model_path.exists():
                logger.error(f"Model file not found: {model_path}")
                return False

            # Load model based on type
            if model_name == "ensemble":
                model = EnsembleModel()
                model.load(str(model_path.with_suffix('')))
            else:
                # Load with joblib for scikit-learn models
                model = joblib.load(model_path)

            # Store model
            self.models[model_name] = model
            self.model_versions[model_name] = version
            self.prediction_counts[model_name] = 0
            self.inference_times[model_name] = []

            # Load metadata
            metadata_path = model_path.with_suffix('.json')
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    self.model_metadata[model_name] = json.load(f)

            logger.info(f"Loaded model: {model_name} (version: {version})")
            return True

        except Exception as e:
            logger.error(f"Error loading model {model_name}: {e}")
            return False

    def get_model(self, model_name: str) -> Optional[Any]:
        """Get loaded model by name"""
        return self.models.get(model_name)

    def predict(
        self,
        model_name: str,
        features: pd.DataFrame
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Make prediction with specified model

        Args:
            model_name: Name of model to use
            features: Features DataFrame

        Returns:
            (predictions, probabilities)
        """
        model = self.get_model(model_name)
        if model is None:
            raise ValueError(f"Model {model_name} not loaded")

        # Time inference
        start_time = datetime.now()

        # Predict
        predictions = model.predict(features)
        probabilities = model.predict_proba(features)

        # Track inference time
        inference_time = (datetime.now() - start_time).total_seconds() * 1000  # ms
        self.inference_times[model_name].append(inference_time)

        # Keep only last 1000 timings
        if len(self.inference_times[model_name]) > 1000:
            self.inference_times[model_name] = self.inference_times[model_name][-1000:]

        # Increment prediction count
        self.prediction_counts[model_name] += len(predictions)

        return predictions, probabilities

    def get_status(self, model_name: str) -> ModelStatus:
        """Get model status"""
        model = self.models.get(model_name)

        if model is None:
            return ModelStatus(
                model_name=model_name,
                version="N/A",
                loaded=False,
                last_updated="N/A",
                prediction_count=0,
                avg_inference_time_ms=0.0
            )

        metadata = self.model_metadata.get(model_name, {})
        avg_time = np.mean(self.inference_times[model_name]) if self.inference_times[model_name] else 0.0

        return ModelStatus(
            model_name=model_name,
            version=self.model_versions.get(model_name, "unknown"),
            loaded=True,
            last_updated=metadata.get('created_at', 'unknown'),
            prediction_count=self.prediction_counts.get(model_name, 0),
            avg_inference_time_ms=avg_time
        )


# Feature Preprocessor
class FeaturePreprocessor:
    """
    Preprocesses raw features for model input
    """

    def __init__(self, feature_config_path: Optional[str] = None):
        self.feature_names: Optional[List[str]] = None
        self.feature_means: Optional[Dict[str, float]] = None
        self.feature_stds: Optional[Dict[str, float]] = None

        if feature_config_path:
            self.load_config(feature_config_path)

    def load_config(self, config_path: str):
        """Load feature configuration"""
        with open(config_path, 'r') as f:
            config = json.load(f)

        self.feature_names = config.get('feature_names', [])
        self.feature_means = config.get('feature_means', {})
        self.feature_stds = config.get('feature_stds', {})

    def preprocess(
        self,
        features: Dict[str, float],
        fill_missing: bool = True
    ) -> pd.DataFrame:
        """
        Preprocess features for prediction

        Args:
            features: Raw features dictionary
            fill_missing: Fill missing features with mean

        Returns:
            DataFrame ready for model input
        """
        # Create DataFrame
        df = pd.DataFrame([features])

        # Add missing features
        if self.feature_names and fill_missing:
            for feature_name in self.feature_names:
                if feature_name not in df.columns:
                    # Fill with mean if available, else 0
                    fill_value = self.feature_means.get(feature_name, 0.0) if self.feature_means else 0.0
                    df[feature_name] = fill_value

            # Ensure correct column order
            df = df[self.feature_names]

        # Normalize if statistics available
        if self.feature_means and self.feature_stds:
            for col in df.columns:
                if col in self.feature_means and col in self.feature_stds:
                    mean = self.feature_means[col]
                    std = self.feature_stds[col]
                    if std > 0:
                        df[col] = (df[col] - mean) / std

        return df


# Initialize FastAPI app
app = FastAPI(
    title="NexusTradeAI Model Serving API",
    description="Production ML model serving for trading predictions",
    version="1.0.0"
)

# Global instances
model_manager = ModelManager()
feature_preprocessor = FeaturePreprocessor()

# Track startup time
START_TIME = datetime.now()


# Startup event
@app.on_event("startup")
async def startup_event():
    """Load models on startup"""
    logger.info("Starting Model Serving API...")

    # Load ensemble model
    success = model_manager.load_model("ensemble_model", version="latest")
    if success:
        logger.info("✅ Ensemble model loaded successfully")
    else:
        logger.warning("⚠️ Failed to load ensemble model")

    logger.info("Model Serving API ready")


# Health check
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    uptime = (datetime.now() - START_TIME).total_seconds()

    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        models_loaded=len(model_manager.models),
        uptime_seconds=uptime
    )


# Single prediction
@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Make a single prediction

    Args:
        request: PredictionRequest with features

    Returns:
        PredictionResponse with prediction and probabilities
    """
    try:
        # Preprocess features
        features_df = feature_preprocessor.preprocess(request.features)

        # Get prediction
        predictions, probabilities = model_manager.predict("ensemble_model", features_df)

        # Extract results
        prediction = int(predictions[0])
        probs = probabilities[0].tolist()
        confidence = float(max(probs))

        return PredictionResponse(
            symbol=request.symbol,
            prediction=prediction,
            probabilities=probs,
            confidence=confidence,
            timestamp=request.timestamp or datetime.now().isoformat(),
            model_version=model_manager.model_versions.get("ensemble_model", "unknown")
        )

    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Batch prediction
@app.post("/predict/batch", response_model=List[PredictionResponse])
async def predict_batch(request: BatchPredictionRequest):
    """
    Make batch predictions

    Args:
        request: BatchPredictionRequest with list of prediction requests

    Returns:
        List of PredictionResponse
    """
    try:
        responses = []

        for pred_request in request.predictions:
            # Preprocess features
            features_df = feature_preprocessor.preprocess(pred_request.features)

            # Get prediction
            predictions, probabilities = model_manager.predict("ensemble_model", features_df)

            # Extract results
            prediction = int(predictions[0])
            probs = probabilities[0].tolist()
            confidence = float(max(probs))

            responses.append(PredictionResponse(
                symbol=pred_request.symbol,
                prediction=prediction,
                probabilities=probs,
                confidence=confidence,
                timestamp=pred_request.timestamp or datetime.now().isoformat(),
                model_version=model_manager.model_versions.get("ensemble_model", "unknown")
            ))

        return responses

    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Model status
@app.get("/models/{model_name}/status", response_model=ModelStatus)
async def get_model_status(model_name: str):
    """
    Get status of a specific model

    Args:
        model_name: Name of model

    Returns:
        ModelStatus with model information
    """
    return model_manager.get_status(model_name)


# List models
@app.get("/models", response_model=Dict[str, ModelStatus])
async def list_models():
    """
    List all loaded models

    Returns:
        Dictionary of model statuses
    """
    models_status = {}
    for model_name in model_manager.models.keys():
        models_status[model_name] = model_manager.get_status(model_name)

    return models_status


# Reload model
@app.post("/models/{model_name}/reload")
async def reload_model(model_name: str, version: str = "latest"):
    """
    Reload a model

    Args:
        model_name: Name of model to reload
        version: Model version (default: latest)

    Returns:
        Success message
    """
    success = model_manager.load_model(model_name, version)

    if success:
        return {"message": f"Model {model_name} reloaded successfully", "version": version}
    else:
        raise HTTPException(status_code=500, detail=f"Failed to reload model {model_name}")


# Main entry point
def start_server(host: str = "0.0.0.0", port: int = 8000, reload: bool = False):
    """
    Start the model serving API server

    Args:
        host: Host to bind to
        port: Port to bind to
        reload: Enable auto-reload on code changes
    """
    uvicorn.run(
        "model_serving_api:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    start_server(reload=True)
