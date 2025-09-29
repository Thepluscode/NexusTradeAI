import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '../middleware/validation.js';
import { authenticate, authorize } from '../middleware/auth.js';
import axios from 'axios';
import config from '../config.js';

const router = Router();

// Apply authentication to all trading routes
router.use(authenticate());

// Place a new order
router.post(
  '/orders',
  [
    body('symbol').isString().notEmpty(),
    body('side').isIn(['BUY', 'SELL']),
    body('type').isIn(['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT']),
    body('quantity').isNumeric().toFloat().isFloat({ min: 0.00001 }),
    body('price').optional().isNumeric().toFloat().isFloat({ min: 0 }),
    body('timeInForce').optional().isIn(['GTC', 'IOC', 'FOK']),
    body('clientOrderId').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.trading}/trading/orders`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.status(201).json(response.data);
  })
);

// Get all open orders
router.get(
  '/orders/open',
  [
    query('symbol').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.trading}/trading/orders/open`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user.id } 
      }
    );
    res.json(response.data);
  })
);

// Get order by ID
router.get(
  '/orders/:orderId',
  [param('orderId').isString().notEmpty()],
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const response = await axios.get(
      `${config.services.trading}/trading/orders/${orderId}`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Cancel an order
router.delete(
  '/orders/:orderId',
  [param('orderId').isString().notEmpty()],
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const response = await axios.delete(
      `${config.services.trading}/trading/orders/${orderId}`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Cancel all open orders
router.delete(
  '/orders',
  [
    query('symbol').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.delete(
      `${config.services.trading}/trading/orders`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user.id } 
      }
    );
    res.json(response.data);
  })
);

// Get account information
router.get(
  '/account',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.trading}/trading/account`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Get account balance
router.get(
  '/account/balance',
  [
    query('asset').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.trading}/trading/account/balance`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user.id } 
      }
    );
    res.json(response.data);
  })
);

// Get trade history
router.get(
  '/trades',
  [
    query('symbol').optional().isString(),
    query('startTime').optional().isISO8601(),
    query('endTime').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.trading}/trading/trades`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user.id } 
      }
    );
    res.json(response.data);
  })
);

// Get portfolio performance
router.get(
  '/portfolio/performance',
  [
    query('period').optional().isIn(['1d', '1w', '1m', '3m', '6m', '1y', 'all']),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.trading}/trading/portfolio/performance`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user.id } 
      }
    );
    res.json(response.data);
  })
);

// Get risk metrics
router.get(
  '/portfolio/risk',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.trading}/trading/portfolio/risk`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Place multiple orders (batch)
router.post(
  '/batch-orders',
  [
    body().isArray({ min: 1, max: 5 }), // Limit batch size to 5 orders
    body('*.symbol').isString().notEmpty(),
    body('*.side').isIn(['BUY', 'SELL']),
    body('*.type').isIn(['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT']),
    body('*.quantity').isNumeric().toFloat().isFloat({ min: 0.00001 }),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.trading}/trading/batch-orders`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.status(201).json(response.data);
  })
);

export default router;
