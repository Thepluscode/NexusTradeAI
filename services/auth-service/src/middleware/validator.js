const { body, param, query } = require('express-validator');

const validators = {
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('username')
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-30 characters and contain only letters, numbers, and underscores'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
    body('firstName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name is required and must be less than 50 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name is required and must be less than 50 characters'),
    body('phone')
      .optional()
      .isMobilePhone()
      .withMessage('Please provide a valid phone number')
  ],

  login: [
    body('emailOrUsername')
      .notEmpty()
      .withMessage('Email or username is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  updateProfile: [
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be less than 50 characters'),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be less than 50 characters'),
    body('phone')
      .optional()
      .isMobilePhone()
      .withMessage('Please provide a valid phone number'),
    body('dateOfBirth')
      .optional()
      .isISO8601()
      .withMessage('Please provide a valid date')
  ],

  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must be at least 8 characters with uppercase, lowercase, number, and special character')
  ],

  submitKYC: [
    body('fullName')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Full name is required'),
    body('dateOfBirth')
      .isISO8601()
      .withMessage('Valid date of birth is required'),
    body('nationality')
      .notEmpty()
      .withMessage('Nationality is required'),
    body('countryOfResidence')
      .notEmpty()
      .withMessage('Country of residence is required'),
    body('idType')
      .isIn(['passport', 'drivers_license', 'national_id'])
      .withMessage('Invalid ID type'),
    body('idNumber')
      .notEmpty()
      .withMessage('ID number is required')
  ],

  reviewKYC: [
    param('kycId')
      .isMongoId()
      .withMessage('Invalid KYC ID'),
    body('status')
      .isIn(['under_review', 'approved', 'rejected', 'requires_resubmission'])
      .withMessage('Invalid status'),
    body('rejectionReason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Rejection reason must be less than 500 characters'),
    body('riskScore')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Risk score must be between 0 and 100')
  ]
};

module.exports = validators;