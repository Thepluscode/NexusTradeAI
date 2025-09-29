"""
FastAPI Service for Model Inference with Monitoring

This module provides a REST API for making predictions with integrated monitoring.
"""

import os
import logging
import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any, Union
import pandas as pd
import numpy as np
import time
import json

# Import our inference service
from inference.real_time.inference_service import InferenceService, create_inference_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="NexusTradeAI Inference API",
    description="API for making predictions with integrated monitoring",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response models
class PredictionRequest(BaseModel):
    """Request model for making predictions."""
    data: Union[Dict[str, Any], List[Dict[str, Any]]]
    return_proba: bool = False
    request_id: Optional[str] = None

class PredictionResponse(BaseModel):
    """Response model for predictions."""
    request_id: Optional[str] = None
    predictions: List[Any]
    drift_detected: Optional[bool] = None
    drift_score: Optional[float] = None
    model_version: str
    processing_time_ms: float
    timestamp: str

class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    model: Dict[str, Any]
    monitoring: Dict[str, Any]
    uptime_seconds: float

# Initialize the inference service
service = None
startup_time = time.time()

# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle global exceptions."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )

# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    start_time = time.time()
    
    # Log request
    logger.info(f"Request: {request.method} {request.url}")
    
    # Process request
    response = await call_next(request)
    
    # Log response
    process_time = (time.time() - start_time) * 1000
    logger.info(f"Response: {response.status_code} (took {process_time:.2f}ms)")
    
    return response

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    global service
    try:
        # Initialize the inference service
        service = create_inference_service("config/inference_config.json")
        logger.info("Inference service initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not initialized"
        )
    
    status_info = service.get_status()
    return {
        "status": "healthy",
        "model": status_info["model"],
        "monitoring": status_info["monitoring"],
        "uptime_seconds": time.time() - startup_time
    }

# Prediction endpoint
@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Make predictions using the model.
    
    Args:
        request: Prediction request containing input data
        
    Returns:
        Prediction results with monitoring information
    """
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not initialized"
        )
    
    try:
        # Process the prediction
        start_time = time.time()
        result = service.predict(
            input_data=request.data,
            return_proba=request.return_proba
        )
        
        # Prepare response
        response = {
            "request_id": request.request_id,
            "predictions": result["predictions"],
            "model_version": result["metadata"]["model_version"],
            "processing_time_ms": result["metadata"]["prediction_time_ms"],
            "timestamp": result["metadata"]["timestamp"]
        }
        
        # Add drift information if available
        if "drift_detected" in result:
            response["drift_detected"] = result["drift_detected"]
            response["drift_score"] = result["drift_score"]
        
        return response
        
    except Exception as e:
        logger.error(f"Prediction failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# Model information endpoint
@app.get("/model/info")
async def model_info():
    """Get information about the currently loaded model."""
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not initialized"
        )
    
    status_info = service.get_status()
    return {
        "model": status_info["model"],
        "monitoring": status_info["monitoring"],
        "last_retrain_time": status_info.get("last_retrain_time"),
        "uptime_seconds": time.time() - startup_time
    }

# Monitoring endpoint
@app.get("/monitoring/drift")
async def get_drift_status():
    """Get current drift detection status."""
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not initialized"
        )
    
    # In a real implementation, you would query the monitoring service
    # for the latest drift detection results
    return {
        "status": "monitoring_enabled",
        "last_check": "2023-01-01T00:00:00Z",  # Replace with actual timestamp
        "drift_detected": False,  # Replace with actual status
        "drift_score": 0.0  # Replace with actual score
    }

# Retrain endpoint
@app.post("/retrain")
async def trigger_retraining():
    """Trigger model retraining."""
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not initialized"
        )
    
    try:
        # In a real implementation, this would trigger your training pipeline
        # For now, we'll just log the request
        logger.info("Manual retraining triggered via API")
        
        # Return a success response
        return {
            "status": "retraining_triggered",
            "message": "Retraining process has been started",
            "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ')
        }
        
    except Exception as e:
        logger.error(f"Failed to trigger retraining: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger retraining: {str(e)}"
        )

# Main entry point
if __name__ == "__main__":
    import uvicorn
    
    # Start the FastAPI server
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
