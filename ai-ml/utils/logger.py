# ai-ml/utils/logger.py
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

def setup_logger(
    name: str,
    log_level: int = logging.INFO,
    log_dir: str = "logs",
    console_output: bool = True
) -> logging.Logger:
    """
    Configure and return a logger instance.
    
    Args:
        name: Logger name
        log_level: Logging level (e.g., logging.INFO, logging.DEBUG)
        log_dir: Directory to store log files
        console_output: Whether to output logs to console
        
    Returns:
        Configured logger instance
    """
    # Create logs directory if it doesn't exist
    os.makedirs(log_dir, exist_ok=True)
    
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    
    # Clear existing handlers to avoid duplicate logs
    logger.handlers = []
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Add file handler
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = Path(log_dir) / f"{name}_{timestamp}.log"
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # Add console handler if enabled
    if console_output:
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
    
    return logger

# Default logger instance
logger = setup_logger("nexustradeai")