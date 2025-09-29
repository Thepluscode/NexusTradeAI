/**
 * Validators for NexusTradeAI
 * Comprehensive validation utilities for trading data
 */

const { ASSET_CLASSES, ORDER_TYPES, TIME_IN_FORCE, EXCHANGES } = require('../../constants/market-constants');

class Validators {
  /**
   * Validate email address
   */
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.toLowerCase());
  }

  /**
   * Validate password strength
   */
  static isValidPassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, errors: ['Password is required'] };
    }

    const errors = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate stock symbol
   */
  static isValidSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      return false;
    }

    // Basic symbol validation (1-5 characters, letters only)
    const symbolRegex = /^[A-Z]{1,5}$/;
    return symbolRegex.test(symbol.toUpperCase());
  }

  /**
   * Validate price
   */
  static isValidPrice(price) {
    if (price === null || price === undefined) {
      return false;
    }

    const numPrice = Number(price);
    return !isNaN(numPrice) && numPrice > 0 && isFinite(numPrice);
  }

  /**
   * Validate quantity
   */
  static isValidQuantity(quantity) {
    if (quantity === null || quantity === undefined) {
      return false;
    }

    const numQuantity = Number(quantity);
    return !isNaN(numQuantity) && numQuantity > 0 && isFinite(numQuantity);
  }

  /**
   * Validate order data
   */
  static validateOrder(orderData) {
    const errors = [];

    // Required fields
    if (!orderData.symbol) {
      errors.push('Symbol is required');
    } else if (!this.isValidSymbol(orderData.symbol)) {
      errors.push('Invalid symbol format');
    }

    if (!orderData.side || !['BUY', 'SELL'].includes(orderData.side.toUpperCase())) {
      errors.push('Valid side (BUY/SELL) is required');
    }

    if (!orderData.orderType || !Object.values(ORDER_TYPES).includes(orderData.orderType)) {
      errors.push('Valid order type is required');
    }

    if (!orderData.timeInForce || !Object.values(TIME_IN_FORCE).includes(orderData.timeInForce)) {
      errors.push('Valid time in force is required');
    }

    if (!this.isValidQuantity(orderData.quantity)) {
      errors.push('Valid quantity is required');
    }

    // Price validation for limit orders
    if (['LIMIT', 'STOP_LIMIT'].includes(orderData.orderType) && !this.isValidPrice(orderData.limitPrice)) {
      errors.push('Limit price is required for limit orders');
    }

    // Stop price validation for stop orders
    if (['STOP', 'STOP_LIMIT', 'TRAILING_STOP'].includes(orderData.orderType) && !this.isValidPrice(orderData.stopPrice)) {
      errors.push('Stop price is required for stop orders');
    }

    // Asset class validation
    if (orderData.assetClass && !Object.values(ASSET_CLASSES).includes(orderData.assetClass)) {
      errors.push('Invalid asset class');
    }

    // Exchange validation
    if (orderData.exchange && !Object.values(EXCHANGES).includes(orderData.exchange)) {
      errors.push('Invalid exchange');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate UUID
   */
  static isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate date
   */
  static isValidDate(date) {
    if (!date) return false;

    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj.getTime());
  }

  /**
   * Validate percentage
   */
  static isValidPercentage(percentage) {
    if (percentage === null || percentage === undefined) {
      return false;
    }

    const numPercentage = Number(percentage);
    return !isNaN(numPercentage) && numPercentage >= 0 && numPercentage <= 100 && isFinite(numPercentage);
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input, maxLength = 255) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .slice(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/[^\w\s\-_.@]/g, ''); // Keep only alphanumeric, spaces, and safe characters
  }
}

module.exports = Validators;