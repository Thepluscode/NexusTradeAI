/**
 * Order Types for NexusTradeAI
 */

class OrderTypes {
  static MARKET = 'MARKET';
  static LIMIT = 'LIMIT';
  static STOP = 'STOP';
  static STOP_LIMIT = 'STOP_LIMIT';
  static TRAILING_STOP = 'TRAILING_STOP';
  static BRACKET = 'BRACKET';
  static OCO = 'OCO'; // One-Cancels-Other
  static OTO = 'OTO'; // One-Triggers-Other

  /**
   * Validate order type
   */
  static isValid(orderType) {
    return Object.values(this).includes(orderType);
  }

  /**
   * Get order type description
   */
  static getDescription(orderType) {
    const descriptions = {
      [this.MARKET]: 'Market order - executes immediately at current market price',
      [this.LIMIT]: 'Limit order - executes only at specified price or better',
      [this.STOP]: 'Stop order - becomes market order when stop price is reached',
      [this.STOP_LIMIT]: 'Stop-limit order - becomes limit order when stop price is reached',
      [this.TRAILING_STOP]: 'Trailing stop - stop price follows market price by specified amount',
      [this.BRACKET]: 'Bracket order - includes profit target and stop loss',
      [this.OCO]: 'One-Cancels-Other - two orders where execution of one cancels the other',
      [this.OTO]: 'One-Triggers-Other - execution of one order triggers another'
    };

    return descriptions[orderType] || 'Unknown order type';
  }

  /**
   * Check if order type requires limit price
   */
  static requiresLimitPrice(orderType) {
    return [this.LIMIT, this.STOP_LIMIT].includes(orderType);
  }

  /**
   * Check if order type requires stop price
   */
  static requiresStopPrice(orderType) {
    return [this.STOP, this.STOP_LIMIT, this.TRAILING_STOP].includes(orderType);
  }

  /**
   * Get all order types
   */
  static getAll() {
    return [
      this.MARKET,
      this.LIMIT,
      this.STOP,
      this.STOP_LIMIT,
      this.TRAILING_STOP,
      this.BRACKET,
      this.OCO,
      this.OTO
    ];
  }
}

module.exports = OrderTypes;