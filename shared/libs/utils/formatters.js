/**
 * Formatters for NexusTradeAI
 */

class Formatters {
  /**
   * Format currency
   */
  static currency(amount, currency = 'USD', decimals = 2) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(amount);
  }

  /**
   * Format percentage
   */
  static percentage(value, decimals = 2) {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value / 100);
  }

  /**
   * Format number with commas
   */
  static number(value, decimals = 2) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  }

  /**
   * Format price
   */
  static price(price, decimals = 2) {
    return this.currency(price, 'USD', decimals);
  }

  /**
   * Format symbol
   */
  static symbol(symbol) {
    return symbol.toUpperCase();
  }

  /**
   * Format order side
   */
  static orderSide(side) {
    return side.toUpperCase();
  }

  /**
   * Format order status
   */
  static orderStatus(status) {
    return status.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Format file size
   */
  static fileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = Formatters;