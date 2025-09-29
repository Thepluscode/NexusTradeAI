import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/validation.js';
import axios from 'axios';
import config from '../config.js';

const router = Router();

// Register new user
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const response = await axios.post(
      `${config.services.auth}/auth/register`,
      req.body
    );
    
    res.status(201).json(response.data);
  })
);

// Login user
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const response = await axios.post(
      `${config.services.auth}/auth/login`,
      req.body
    );
    
    res.json(response.data);
  })
);

// Refresh access token
router.post(
  '/refresh-token',
  [
    body('refreshToken').notEmpty(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.auth}/auth/refresh-token`,
      req.body
    );
    
    res.json(response.data);
  })
);

// Request password reset
router.post(
  '/forgot-password',
  [
    body('email').isEmail().normalizeEmail(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.auth}/auth/forgot-password`,
      req.body
    );
    
    res.json(response.data);
  })
);

// Reset password
router.post(
  '/reset-password',
  [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.auth}/auth/reset-password`,
      req.body
    );
    
    res.json(response.data);
  })
);

export default router;
