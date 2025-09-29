// Paper Trading API Routes
// RESTful endpoints for paper trading accounts and simulation

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const PaperTradingService = require('../services/PaperTradingService');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for API endpoints
const paperTradingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Initialize Paper Trading Service
let paperTradingService;

const initializeService = (options) => {
  paperTradingService = new PaperTradingService(options);
};

/**
 * @swagger
 * /api/paper-trading/accounts:
 *   post:
 *     summary: Create a new paper trading account
 *     tags: [Paper Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - initialBalance
 *             properties:
 *               name:
 *                 type: string
 *                 example: "My Paper Trading Account"
 *               initialBalance:
 *                 type: number
 *                 minimum: 1000
 *                 example: 100000
 *               tradingPairs:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["BTC/USD", "ETH/USD", "AAPL"]
 *               strategies:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["DeepLearningMultiAsset", "AIPatternRecognition"]
 *               riskSettings:
 *                 type: object
 *                 properties:
 *                   maxRiskPerTrade:
 *                     type: number
 *                     example: 2
 *                   maxDrawdown:
 *                     type: number
 *                     example: 10
 *                   maxConcurrentTrades:
 *                     type: integer
 *                     example: 5
 *               autoTrading:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Paper trading account created successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 */
router.post('/accounts',
  paperTradingRateLimit,
  auth,
  [
    body('name').notEmpty().withMessage('Account name is required'),
    body('initialBalance').isFloat({ min: 1000 }).withMessage('Initial balance must be at least $1,000'),
    body('tradingPairs').optional().isArray(),
    body('strategies').optional().isArray(),
    body('riskSettings.maxRiskPerTrade').optional().isFloat({ min: 0.1, max: 10 }),
    body('riskSettings.maxDrawdown').optional().isFloat({ min: 1, max: 50 }),
    body('riskSettings.maxConcurrentTrades').optional().isInt({ min: 1, max: 20 }),
    body('autoTrading').optional().isBoolean()
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

      const userId = req.user.id;
      const accountConfig = req.body;

      const result = await paperTradingService.createPaperAccount(userId, accountConfig);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Error creating paper trading account:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/paper-trading/accounts/{accountId}/start:
 *   post:
 *     summary: Start paper trading for an account
 *     tags: [Paper Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paper trading started successfully
 *       400:
 *         description: Invalid request or account already active
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 */
router.post('/accounts/:accountId/start',
  auth,
  [
    param('accountId').notEmpty().withMessage('Account ID is required')
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

      const { accountId } = req.params;
      const userId = req.user.id;

      const result = await paperTradingService.startPaperTrading(accountId, userId);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Error starting paper trading:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/paper-trading/accounts/{accountId}/stop:
 *   post:
 *     summary: Stop paper trading for an account
 *     tags: [Paper Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paper trading stopped successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 */
router.post('/accounts/:accountId/stop',
  auth,
  [
    param('accountId').notEmpty().withMessage('Account ID is required')
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

      const { accountId } = req.params;
      const userId = req.user.id;

      const result = await paperTradingService.stopPaperTrading(accountId, userId);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Error stopping paper trading:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/paper-trading/accounts/{accountId}/trades:
 *   post:
 *     summary: Execute a paper trade
 *     tags: [Paper Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - symbol
 *               - side
 *               - quantity
 *               - orderType
 *             properties:
 *               symbol:
 *                 type: string
 *                 example: "BTC/USD"
 *               side:
 *                 type: string
 *                 enum: [BUY, SELL]
 *               quantity:
 *                 type: number
 *                 minimum: 0.001
 *               orderType:
 *                 type: string
 *                 enum: [MARKET, LIMIT, STOP]
 *               price:
 *                 type: number
 *                 description: Required for LIMIT and STOP orders
 *               stopLoss:
 *                 type: number
 *               takeProfit:
 *                 type: number
 *               strategy:
 *                 type: string
 *                 example: "Manual"
 *     responses:
 *       200:
 *         description: Paper trade executed successfully
 *       400:
 *         description: Invalid trade parameters
 *       401:
 *         description: Unauthorized
 */
router.post('/accounts/:accountId/trades',
  paperTradingRateLimit,
  auth,
  [
    param('accountId').notEmpty().withMessage('Account ID is required'),
    body('symbol').notEmpty().withMessage('Symbol is required'),
    body('side').isIn(['BUY', 'SELL']).withMessage('Side must be BUY or SELL'),
    body('quantity').isFloat({ min: 0.001 }).withMessage('Quantity must be greater than 0.001'),
    body('orderType').isIn(['MARKET', 'LIMIT', 'STOP']).withMessage('Invalid order type'),
    body('price').optional().isFloat({ min: 0 }),
    body('stopLoss').optional().isFloat({ min: 0 }),
    body('takeProfit').optional().isFloat({ min: 0 }),
    body('strategy').optional().isString()
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

      const { accountId } = req.params;
      const tradeRequest = req.body;

      const result = await paperTradingService.executePaperTrade(accountId, tradeRequest);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Error executing paper trade:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/paper-trading/accounts/{accountId}/trades/{tradeId}/close:
 *   post:
 *     summary: Close a paper trade
 *     tags: [Paper Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tradeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               closePrice:
 *                 type: number
 *                 description: Optional close price, uses market price if not provided
 *     responses:
 *       200:
 *         description: Paper trade closed successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trade not found
 */
router.post('/accounts/:accountId/trades/:tradeId/close',
  auth,
  [
    param('accountId').notEmpty().withMessage('Account ID is required'),
    param('tradeId').notEmpty().withMessage('Trade ID is required'),
    body('closePrice').optional().isFloat({ min: 0 })
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

      const { accountId, tradeId } = req.params;
      const { closePrice } = req.body;

      const result = await paperTradingService.closePaperTrade(tradeId, accountId, closePrice);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('Error closing paper trade:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/paper-trading/accounts/{accountId}/performance:
 *   get:
 *     summary: Get paper trading account performance
 *     tags: [Paper Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Performance data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 */
router.get('/accounts/:accountId/performance',
  auth,
  [
    param('accountId').notEmpty().withMessage('Account ID is required')
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

      const { accountId } = req.params;

      const performance = paperTradingService.getPaperAccountPerformance(accountId);

      if (!performance) {
        return res.status(404).json({
          success: false,
          message: 'Paper trading account not found'
        });
      }

      res.json({
        success: true,
        performance
      });

    } catch (error) {
      console.error('Error retrieving paper trading performance:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

module.exports = { router, initializeService };
