#!/usr/bin/env python3
"""
NexusTradeAI Automated Trading Service Startup Script
====================================================

Simple startup script for the automated trading service.
"""

import sys
import os
import logging
from api_server import app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def main():
    """Main startup function"""
    logger.info("🚀 Starting NexusTradeAI Automated Trading Service...")
    logger.info("🤖 Trading Engine API: http://localhost:3005")
    logger.info("❤️  Health Check: http://localhost:3005/health")
    logger.info("📊 Trading Status: http://localhost:3005/api/trading/status")
    logger.info("💼 Positions: http://localhost:3005/api/trading/positions")
    logger.info("📋 Orders: http://localhost:3005/api/trading/orders")
    logger.info("⚠️  WARNING: Starting in PAPER TRADING mode by default")
    
    try:
        # Start the Flask application
        app.run(
            host='0.0.0.0',
            port=3005,
            debug=False,  # Set to False for production
            threaded=True
        )
    except KeyboardInterrupt:
        logger.info("🛑 Automated Trading Service stopped by user")
    except Exception as e:
        logger.error(f"❌ Error starting service: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
