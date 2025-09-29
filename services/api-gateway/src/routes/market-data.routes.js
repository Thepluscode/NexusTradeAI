import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { asyncHandler } from '../middleware/validation.js';
import axios from 'axios';
import config from '../config.js';

const router = Router();

// Get market data for a symbol
router.get(
  '/:symbol',
  [
    param('symbol').isString().notEmpty(),
    query('interval').optional().isIn(['1m', '5m', '15m', '1h', '1d']),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('startTime').optional().isISO8601(),
    query('endTime').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const response = await axios.get(
      `${config.services.marketData}/market-data/${symbol}`,
      { params: req.query, headers: { 'x-user-id': req.user?.id } }
    );
    res.json(response.data);
  })
);

// Get order book for a symbol
router.get(
  '/:symbol/orderbook',
  [
    param('symbol').isString().notEmpty(),
    query('depth').optional().isInt({ min: 1, max: 100 })
  ],
  asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const response = await axios.get(
      `${config.services.marketData}/market-data/${symbol}/orderbook`,
      { params: req.query, headers: { 'x-user-id': req.user?.id } }
    );
    res.json(response.data);
  })
);

// Get recent trades for a symbol
router.get(
  '/:symbol/trades',
  [
    param('symbol').isString().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 1000 })
  ],
  asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const response = await axios.get(
      `${config.services.marketData}/market-data/${symbol}/trades`,
      { params: req.query, headers: { 'x-user-id': req.user?.id } }
    );
    res.json(response.data);
  })
);

// Get 24h ticker for a symbol
router.get(
  '/:symbol/ticker',
  [param('symbol').isString().notEmpty()],
  asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const response = await axios.get(
      `${config.services.marketData}/market-data/${symbol}/ticker`,
      { headers: { 'x-user-id': req.user?.id } }
    );
    res.json(response.data);
  })
);

// Get market overview
router.get(
  '/market/overview',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.marketData}/market-data/market/overview`,
      { headers: { 'x-user-id': req.user?.id } }
    );
    res.json(response.data);
  })
);

// Get top gainers/losers
router.get(
  '/market/top-movers',
  [
    query('type').isIn(['gainers', 'losers']).default('gainers'),
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.marketData}/market-data/market/top-movers`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user?.id } 
      }
    );
    res.json(response.data);
  })
);

// Search for symbols
router.get(
  '/search',
  [
    query('query').isString().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.marketData}/market-data/search`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user?.id } 
      }
    );
    res.json(response.data);
  })
);

// Get exchange info
router.get(
  '/exchange/info',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.marketData}/market-data/exchange/info`,
      { headers: { 'x-user-id': req.user?.id } }
    );
    res.json(response.data);
  })
);

export default router;
