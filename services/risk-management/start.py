#!/usr/bin/env python3
"""
NexusTradeAI Risk Management Service Startup Script
==================================================

Simple startup script for the risk management service.
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
    logger.info("🚀 Starting NexusTradeAI Risk Management Service...")
    logger.info("📊 Risk Management API: http://localhost:3003")
    logger.info("❤️  Health Check: http://localhost:3003/health")
    logger.info("📋 Portfolio Summary: http://localhost:3003/api/risk/portfolio")
    
    try:
        # Start the Flask application
        app.run(
            host='0.0.0.0',
            port=3003,
            debug=False,  # Set to False for production
            threaded=True
        )
    except KeyboardInterrupt:
        logger.info("🛑 Risk Management Service stopped by user")
    except Exception as e:
        logger.error(f"❌ Error starting service: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
