import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '../middleware/validation.js';
import { authenticate, authorize } from '../middleware/auth.js';
import axios from 'axios';
import config from '../config.js';

const router = Router();

// Apply authentication to all user routes
router.use(authenticate());

// Get current user profile
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.auth}/users/me`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Update user profile
router.patch(
  '/me',
  [
    body('firstName').optional().isString().trim(),
    body('lastName').optional().isString().trim(),
    body('phone').optional().isString().trim(),
    body('timezone').optional().isString(),
    body('language').optional().isString().isLength({ min: 2, max: 5 }),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.patch(
      `${config.services.auth}/users/me`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Update user preferences
router.patch(
  '/me/preferences',
  [
    body().isObject(),
    body('notifications.email').optional().isBoolean(),
    body('notifications.push').optional().isBoolean(),
    body('notifications.sms').optional().isBoolean(),
    body('theme').optional().isIn(['light', 'dark', 'system']),
    body('defaultView').optional().isIn(['dashboard', 'portfolio', 'markets']),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.patch(
      `${config.services.auth}/users/me/preferences`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Update password
router.post(
  '/me/password',
  [
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.auth}/users/me/password`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Enable/disable two-factor authentication
router.post(
  '/me/two-factor',
  [
    body('enabled').isBoolean(),
    body('code').optional().isString().isLength({ min: 6, max: 6 }),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.auth}/users/me/two-factor`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Get API keys
router.get(
  '/me/api-keys',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.auth}/users/me/api-keys`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Create new API key
router.post(
  '/me/api-keys',
  [
    body('name').isString().notEmpty(),
    body('permissions').isArray(),
    body('permissions.*').isIn(['read', 'trade', 'withdraw']),
    body('ipWhitelist').optional().isArray(),
    body('ipWhitelist.*').isIP(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.auth}/users/me/api-keys`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.status(201).json(response.data);
  })
);

// Delete API key
router.delete(
  '/me/api-keys/:keyId',
  [param('keyId').isString().notEmpty()],
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const response = await axios.delete(
      `${config.services.auth}/users/me/api-keys/${keyId}`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Get user activity logs
router.get(
  '/me/activity',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('type').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.auth}/users/me/activity`,
      { 
        params: req.query,
        headers: { 'x-user-id': req.user.id } 
      }
    );
    res.json(response.data);
  })
);

// Get user sessions
router.get(
  '/me/sessions',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.auth}/users/me/sessions`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Revoke session
router.delete(
  '/me/sessions/:sessionId',
  [param('sessionId').isString().notEmpty()],
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const response = await axios.delete(
      `${config.services.auth}/users/me/sessions/${sessionId}`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Get KYC status
router.get(
  '/me/kyc',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.auth}/users/me/kyc`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

// Submit KYC information
router.post(
  '/me/kyc',
  [
    body('documentType').isIn(['PASSPORT', 'DRIVING_LICENSE', 'NATIONAL_ID']),
    body('documentNumber').isString().notEmpty(),
    body('documentFront').isString().notEmpty(),
    body('documentBack').optional().isString(),
    body('selfie').isString().notEmpty(),
  ],
  asyncHandler(async (req, res) => {
    const response = await axios.post(
      `${config.services.auth}/users/me/kyc`,
      req.body,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.status(201).json(response.data);
  })
);

// Get referral information
router.get(
  '/me/referrals',
  asyncHandler(async (req, res) => {
    const response = await axios.get(
      `${config.services.auth}/users/me/referrals`,
      { headers: { 'x-user-id': req.user.id } }
    );
    res.json(response.data);
  })
);

export default router;
