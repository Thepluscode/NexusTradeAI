#!/usr/bin/env python3
"""
NexusTradeAI Strategy Engine Service Startup Script
==================================================

Simple startup script for the strategy engine service.
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
    logger.info("🚀 Starting NexusTradeAI Strategy Engine Service...")
    logger.info("🧠 Strategy Engine API: http://localhost:3004")
    logger.info("❤️  Health Check: http://localhost:3004/health")
    logger.info("📋 Strategies List: http://localhost:3004/api/strategies")
    logger.info("🎯 Recent Signals: http://localhost:3004/api/signals/recent")
    
    try:
        # Start the Flask application
        app.run(
            host='0.0.0.0',
            port=3004,
            debug=False,  # Set to False for production
            threaded=True
        )
    except KeyboardInterrupt:
        logger.info("🛑 Strategy Engine Service stopped by user")
    except Exception as e:
        logger.error(f"❌ Error starting service: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
