"""
Nexus Trade AI - Model Monitoring Module

This module provides comprehensive monitoring capabilities for machine learning models in production.
It includes functionality for tracking model performance, detecting data drift, and generating alerts.
"""

from .model_monitor import ModelMonitor, ModelPerformanceMetrics

__all__ = ['ModelMonitor', 'ModelPerformanceMetrics']

# Initialize logger
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("Nexus Trade AI Monitoring module initialized")
