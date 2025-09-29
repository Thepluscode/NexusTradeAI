const express = require('express');
const multer = require('multer');
const userController = require('../controllers/userController');
const validators = require('../middleware/validator');
const security = require('../middleware/security');

const router = express.Router();

// Multer configuration for avatar upload
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// User profile routes
router.get('/profile', security.authenticate, userController.getProfile);
router.put('/profile', security.authenticate, validators.updateProfile, userController.updateProfile);
router.post('/change-password', security.authenticate, validators.changePassword, userController.changePassword);
router.post('/upload-avatar', security.authenticate, avatarUpload.single('avatar'), userController.uploadAvatar);

// Session management
router.get('/sessions', security.authenticate, userController.getSessions);
router.delete('/sessions/:sessionId', security.authenticate, userController.revokeSession);

// Account management
router.delete('/account', security.authenticate, userController.deleteAccount);

module.exports = router;