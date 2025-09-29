import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import authRoutes from './auth.routes.js';
import marketDataRoutes from './market-data.routes.js';
import tradingRoutes from './trading.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    version: process.env.npm_package_version
  });
});

// Public routes
router.use('/auth', authRoutes);

// Protected routes
router.use(authenticate());
router.use('/market-data', marketDataRoutes);
router.use('/trading', tradingRoutes);
router.use('/users', userRoutes);

// 404 handler
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

export default router;
