const express = require('express');
const multer = require('multer');
const kycController = require('../controllers/kycController');
const validators = require('../middleware/validator');
const security = require('../middleware/security');

const router = express.Router();

// Multer configuration for KYC document upload
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'), false);
    }
  }
});

// KYC routes for users
router.post('/submit', 
  security.authenticate,
  kycUpload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'proofOfAddress', maxCount: 1 }
  ]),
  validators.submitKYC,
  kycController.submitKYC
);

router.get('/status', security.authenticate, kycController.getKYCStatus);

// Admin routes for KYC review
router.get('/admin/all', 
  security.authenticate, 
  security.authorize('admin', 'moderator'), 
  kycController.getAllKYCs
);

router.put('/admin/review/:kycId', 
  security.authenticate, 
  security.authorize('admin', 'moderator'), 
  validators.reviewKYC,
  kycController.reviewKYC
);

module.exports = router;