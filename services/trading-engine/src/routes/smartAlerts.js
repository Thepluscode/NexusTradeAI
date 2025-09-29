// Smart Alerts API Routes
// RESTful endpoints for signal generation and recommendation delivery

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const SmartAlertsService = require('../services/SmartAlertsService');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for API endpoints
const alertsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Initialize Smart Alerts Service
let smartAlertsService;

const initializeService = (options) => {
  smartAlertsService = new SmartAlertsService(options);
};

/**
 * @swagger
 * /api/smart-alerts/generate:
 *   post:
 *     summary: Generate smart alert for a symbol
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - symbol
 *               - aiPrediction
 *             properties:
 *               symbol:
 *                 type: string
 *                 example: "BTC/USD"
 *               aiPrediction:
 *                 type: object
 *                 properties:
 *                   direction:
 *                     type: string
 *                     enum: [BUY, SELL, HOLD]
 *                   confidence:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 1
 *                   strategy:
 *                     type: string
 *                   expectedWinRate:
 *                     type: number
 *                   institutionalGrade:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Smart alert generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/generate',
  alertsRateLimit,
  auth,
  [
    body('symbol').notEmpty().withMessage('Symbol is required'),
    body('aiPrediction.direction').isIn(['BUY', 'SELL', 'HOLD']).withMessage('Invalid direction'),
    body('aiPrediction.confidence').isFloat({ min: 0, max: 1 }).withMessage('Confidence must be between 0 and 1'),
    body('aiPrediction.strategy').notEmpty().withMessage('Strategy is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { symbol, aiPrediction, marketData } = req.body;
      const userId = req.user.id;

      // Generate market data if not provided
      const finalMarketData = marketData || await generateMockMarketData(symbol);

      const smartAlert = await smartAlertsService.generateSmartAlert(
        symbol,
        finalMarketData,
        aiPrediction
      );

      if (!smartAlert) {
        return res.status(200).json({
          success: true,
          message: 'No alert generated - conditions not met',
          alert: null
        });
      }

      res.json({
        success: true,
        alert: smartAlert,
        message: 'Smart alert generated successfully'
      });

    } catch (error) {
      console.error('Error generating smart alert:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/smart-alerts/active:
 *   get:
 *     summary: Get active smart alerts
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by symbol
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: number
 *         description: Minimum confidence threshold
 *       - in: query
 *         name: strategy
 *         schema:
 *           type: string
 *         description: Filter by strategy
 *     responses:
 *       200:
 *         description: Active alerts retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/active',
  auth,
  [
    query('minConfidence').optional().isFloat({ min: 0, max: 1 }),
    query('symbol').optional().isString(),
    query('strategy').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { symbol, minConfidence, strategy } = req.query;
      let alerts = smartAlertsService.getActiveSignals(symbol);

      // Apply filters
      if (minConfidence) {
        alerts = alerts.filter(alert => alert.confidence >= parseFloat(minConfidence));
      }

      if (strategy) {
        alerts = alerts.filter(alert => alert.strategy === strategy);
      }

      res.json({
        success: true,
        alerts,
        count: alerts.length
      });

    } catch (error) {
      console.error('Error retrieving active alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/smart-alerts/history/{symbol}:
 *   get:
 *     summary: Get signal history for a symbol
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: Trading symbol
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of historical signals to return
 *     responses:
 *       200:
 *         description: Signal history retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/history/:symbol',
  auth,
  [
    param('symbol').notEmpty().withMessage('Symbol is required'),
    query('limit').optional().isInt({ min: 1, max: 200 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { symbol } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      const history = smartAlertsService.getSignalHistory(symbol, limit);

      res.json({
        success: true,
        symbol,
        history,
        count: history.length
      });

    } catch (error) {
      console.error('Error retrieving signal history:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/smart-alerts/performance/{symbol}/{strategy}:
 *   get:
 *     summary: Get performance metrics for a strategy
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: strategy
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Performance metrics retrieved successfully
 *       404:
 *         description: No performance data found
 *       401:
 *         description: Unauthorized
 */
router.get('/performance/:symbol/:strategy',
  auth,
  [
    param('symbol').notEmpty().withMessage('Symbol is required'),
    param('strategy').notEmpty().withMessage('Strategy is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { symbol, strategy } = req.params;

      const metrics = smartAlertsService.getPerformanceMetrics(symbol, strategy);

      if (!metrics) {
        return res.status(404).json({
          success: false,
          message: 'No performance data found for this symbol/strategy combination'
        });
      }

      // Calculate additional metrics
      const winRate = metrics.totalSignals > 0 ? metrics.winningSignals / metrics.totalSignals : 0;
      const profitFactor = metrics.totalLoss > 0 ? metrics.totalProfit / metrics.totalLoss : 999;

      res.json({
        success: true,
        symbol,
        strategy,
        metrics: {
          ...metrics,
          winRate,
          profitFactor
        }
      });

    } catch (error) {
      console.error('Error retrieving performance metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/smart-alerts/update-performance:
 *   post:
 *     summary: Update signal performance when trade is closed
 *     tags: [Smart Alerts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alertId
 *               - pnl
 *               - pnlPercent
 *             properties:
 *               alertId:
 *                 type: string
 *               pnl:
 *                 type: number
 *               pnlPercent:
 *                 type: number
 *     responses:
 *       200:
 *         description: Performance updated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 */
router.post('/update-performance',
  auth,
  [
    body('alertId').notEmpty().withMessage('Alert ID is required'),
    body('pnl').isNumeric().withMessage('P&L must be a number'),
    body('pnlPercent').isNumeric().withMessage('P&L percent must be a number')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { alertId, pnl, pnlPercent } = req.body;

      smartAlertsService.updateSignalPerformance(alertId, pnl, pnlPercent);

      res.json({
        success: true,
        message: 'Signal performance updated successfully'
      });

    } catch (error) {
      console.error('Error updating signal performance:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

// Helper function to generate mock market data
async function generateMockMarketData(symbol) {
  const basePrice = getBasePrice(symbol);
  const prices = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const volume = [];
  
  // Generate 100 data points
  for (let i = 0; i < 100; i++) {
    const change = (Math.random() - 0.5) * 0.02; // ±1% random movement
    const price = i === 0 ? basePrice : closes[i - 1] * (1 + change);
    
    const high = price * (1 + Math.random() * 0.01);
    const low = price * (1 - Math.random() * 0.01);
    
    prices.push(price);
    highs.push(high);
    lows.push(low);
    closes.push(price);
    volume.push(1000000 * (1 + (Math.random() - 0.5) * 0.5));
  }

  return {
    symbol,
    prices,
    highs,
    lows,
    closes,
    volume,
    timestamp: Date.now()
  };
}

function getBasePrice(symbol) {
  const prices = {
    'BTC/USD': 43250,
    'ETH/USD': 2650,
    'AAPL': 185.50,
    'GOOGL': 142.30,
    'TSLA': 248.50,
    'MSFT': 378.85
  };
  return prices[symbol] || 100;
}

module.exports = { router, initializeService };
