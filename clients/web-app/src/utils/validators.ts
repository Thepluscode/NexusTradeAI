/**
 * Validation utilities for forms and user input
 */

// Email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Password strength regex patterns
const PASSWORD_PATTERNS = {
  minLength: /.{8,}/,
  hasUpperCase: /[A-Z]/,
  hasLowerCase: /[a-z]/,
  hasNumbers: /\d/,
  hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/,
};

// Trading symbol regex
const SYMBOL_REGEX = /^[A-Z]{2,10}[-\/]?[A-Z]{2,10}$/;

// Wallet address regex patterns
const ADDRESS_PATTERNS = {
  bitcoin: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
  ethereum: /^0x[a-fA-F0-9]{40}$/,
  general: /^[a-zA-Z0-9]{25,62}$/,
};

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate email address
 */
export const validateEmail = (email: string): ValidationResult => {
  const errors: string[] = [];

  if (!email) {
    errors.push('Email is required');
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.push('Please enter a valid email address');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate password strength
 */
export const validatePassword = (password: string): ValidationResult => {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  if (!PASSWORD_PATTERNS.minLength.test(password)) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!PASSWORD_PATTERNS.hasUpperCase.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!PASSWORD_PATTERNS.hasLowerCase.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!PASSWORD_PATTERNS.hasNumbers.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!PASSWORD_PATTERNS.hasSpecialChar.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Get password strength score (0-5)
 */
export const getPasswordStrength = (password: string): {
  score: number;
  label: string;
  color: string;
} => {
  if (!password) return { score: 0, label: 'No password', color: 'gray' };

  let score = 0;

  if (PASSWORD_PATTERNS.minLength.test(password)) score++;
  if (PASSWORD_PATTERNS.hasUpperCase.test(password)) score++;
  if (PASSWORD_PATTERNS.hasLowerCase.test(password)) score++;
  if (PASSWORD_PATTERNS.hasNumbers.test(password)) score++;
  if (PASSWORD_PATTERNS.hasSpecialChar.test(password)) score++;

  const strengthMap = {
    0: { label: 'Very Weak', color: 'red' },
    1: { label: 'Weak', color: 'red' },
    2: { label: 'Fair', color: 'orange' },
    3: { label: 'Good', color: 'yellow' },
    4: { label: 'Strong', color: 'green' },
    5: { label: 'Very Strong', color: 'green' },
  };

  return {
    score,
    ...strengthMap[score as keyof typeof strengthMap],
  };
};

/**
 * Validate username
 */
export const validateUsername = (username: string): ValidationResult => {
  const errors: string[] = [];

  if (!username) {
    errors.push('Username is required');
  } else {
    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }

    if (username.length > 20) {
      errors.push('Username must be no more than 20 characters long');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, underscores, and hyphens');
    }

    if (/^[_-]|[_-]$/.test(username)) {
      errors.push('Username cannot start or end with underscore or hyphen');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate trading symbol
 */
export const validateTradingSymbol = (symbol: string): ValidationResult => {
  const errors: string[] = [];

  if (!symbol) {
    errors.push('Trading symbol is required');
  } else if (!SYMBOL_REGEX.test(symbol.toUpperCase())) {
    errors.push('Please enter a valid trading symbol (e.g., BTC-USDT, ETH/USD)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate numeric input
 */
export const validateNumber = (
  value: string | number,
  options: {
    min?: number;
    max?: number;
    required?: boolean;
    allowDecimals?: boolean;
    maxDecimals?: number;
  } = {}
): ValidationResult => {
  const {
    min,
    max,
    required = false,
    allowDecimals = true,
    maxDecimals = 8,
  } = options;

  const errors: string[] = [];
  const stringValue = String(value).trim();

  if (!stringValue) {
    if (required) {
      errors.push('This field is required');
    }
    return { isValid: !required, errors };
  }

  const numValue = Number(stringValue);

  if (isNaN(numValue)) {
    errors.push('Please enter a valid number');
    return { isValid: false, errors };
  }

  if (!allowDecimals && !Number.isInteger(numValue)) {
    errors.push('Decimal numbers are not allowed');
  }

  if (allowDecimals && maxDecimals !== undefined) {
    const decimalPlaces = (stringValue.split('.')[1] || '').length;
    if (decimalPlaces > maxDecimals) {
      errors.push(`Maximum ${maxDecimals} decimal places allowed`);
    }
  }

  if (min !== undefined && numValue < min) {
    errors.push(`Value must be at least ${min}`);
  }

  if (max !== undefined && numValue > max) {
    errors.push(`Value must be no more than ${max}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate wallet address
 */
export const validateWalletAddress = (
  address: string,
  type: 'bitcoin' | 'ethereum' | 'general' = 'general'
): ValidationResult => {
  const errors: string[] = [];

  if (!address) {
    errors.push('Wallet address is required');
  } else {
    const pattern = ADDRESS_PATTERNS[type];
    if (!pattern.test(address.trim())) {
      errors.push(`Please enter a valid ${type} wallet address`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate phone number
 */
export const validatePhoneNumber = (phone: string): ValidationResult => {
  const errors: string[] = [];

  if (!phone) {
    errors.push('Phone number is required');
  } else {
    // Remove all non-digit characters for validation
    const digitsOnly = phone.replace(/\D/g, '');

    if (digitsOnly.length < 10) {
      errors.push('Phone number must be at least 10 digits');
    } else if (digitsOnly.length > 15) {
      errors.push('Phone number must be no more than 15 digits');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate date
 */
export const validateDate = (
  date: string | Date,
  options: {
    required?: boolean;
    minDate?: Date;
    maxDate?: Date;
    futureOnly?: boolean;
    pastOnly?: boolean;
  } = {}
): ValidationResult => {
  const {
    required = false,
    minDate,
    maxDate,
    futureOnly = false,
    pastOnly = false,
  } = options;

  const errors: string[] = [];

  if (!date) {
    if (required) {
      errors.push('Date is required');
    }
    return { isValid: !required, errors };
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    errors.push('Please enter a valid date');
    return { isValid: false, errors };
  }

  const now = new Date();

  if (futureOnly && dateObj <= now) {
    errors.push('Date must be in the future');
  }

  if (pastOnly && dateObj >= now) {
    errors.push('Date must be in the past');
  }

  if (minDate && dateObj < minDate) {
    errors.push(`Date must be after ${minDate.toLocaleDateString()}`);
  }

  if (maxDate && dateObj > maxDate) {
    errors.push(`Date must be before ${maxDate.toLocaleDateString()}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate trading order
 */
export const validateTradingOrder = (order: {
  symbol?: string;
  side?: string;
  type?: string;
  quantity?: string | number;
  price?: string | number;
  stopPrice?: string | number;
}): ValidationResult => {
  const errors: string[] = [];

  // Validate symbol
  if (!order.symbol) {
    errors.push('Trading symbol is required');
  } else {
    const symbolValidation = validateTradingSymbol(order.symbol);
    if (!symbolValidation.isValid) {
      errors.push(...symbolValidation.errors);
    }
  }

  // Validate side
  if (!order.side) {
    errors.push('Order side is required');
  } else if (!['buy', 'sell'].includes(order.side)) {
    errors.push('Order side must be either "buy" or "sell"');
  }

  // Validate type
  if (!order.type) {
    errors.push('Order type is required');
  } else if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type)) {
    errors.push('Invalid order type');
  }

  // Validate quantity
  if (!order.quantity) {
    errors.push('Quantity is required');
  } else {
    const quantityValidation = validateNumber(order.quantity, {
      min: 0.00000001,
      required: true,
      allowDecimals: true,
      maxDecimals: 8,
    });
    if (!quantityValidation.isValid) {
      errors.push(...quantityValidation.errors);
    }
  }

  // Validate price for limit orders
  if (order.type === 'limit' || order.type === 'stop_limit') {
    if (!order.price) {
      errors.push('Price is required for limit orders');
    } else {
      const priceValidation = validateNumber(order.price, {
        min: 0.00000001,
        required: true,
        allowDecimals: true,
        maxDecimals: 8,
      });
      if (!priceValidation.isValid) {
        errors.push(...priceValidation.errors);
      }
    }
  }

  // Validate stop price for stop orders
  if (order.type === 'stop' || order.type === 'stop_limit') {
    if (!order.stopPrice) {
      errors.push('Stop price is required for stop orders');
    } else {
      const stopPriceValidation = validateNumber(order.stopPrice, {
        min: 0.00000001,
        required: true,
        allowDecimals: true,
        maxDecimals: 8,
      });
      if (!stopPriceValidation.isValid) {
        errors.push(...stopPriceValidation.errors);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate form data against schema
 */
export const validateForm = <T extends Record<string, any>>(
  data: T,
  schema: Record<keyof T, (value: any) => ValidationResult>
): { isValid: boolean; errors: Record<keyof T, string[]> } => {
  const errors = {} as Record<keyof T, string[]>;
  let isValid = true;

  for (const [field, validator] of Object.entries(schema)) {
    const result = validator(data[field as keyof T]);
    if (!result.isValid) {
      errors[field as keyof T] = result.errors;
      isValid = false;
    }
  }

  return { isValid, errors };
};

/**
 * Sanitize string input
 */
export const sanitizeString = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

/**
 * Validate and sanitize user input
 */
export const validateAndSanitize = (
  input: string,
  validator: (value: string) => ValidationResult
): { isValid: boolean; sanitized: string; errors: string[] } => {
  const sanitized = sanitizeString(input);
  const validation = validator(sanitized);

  return {
    isValid: validation.isValid,
    sanitized,
    errors: validation.errors,
  };
};