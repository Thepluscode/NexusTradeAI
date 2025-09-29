/**
 * Date Time Utilities for NexusTradeAI
 */

const moment = require('moment-timezone');

class DateTime {
  static formatters = {
    ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    DATE: 'YYYY-MM-DD',
    TIME: 'HH:mm:ss',
    DATETIME: 'YYYY-MM-DD HH:mm:ss',
    MARKET: 'MM/DD/YYYY HH:mm:ss'
  };

  static timezones = {
    NYSE: 'America/New_York',
    NASDAQ: 'America/New_York',
    LSE: 'Europe/London',
    TSE: 'Asia/Tokyo',
    UTC: 'UTC'
  };

  /**
   * Get current market time
   */
  static getMarketTime(timezone = 'America/New_York') {
    return moment().tz(timezone);
  }

  /**
   * Check if market is open
   */
  static isMarketOpen(timezone = 'America/New_York') {
    const now = this.getMarketTime(timezone);
    const hour = now.hour();
    const minute = now.minute();
    const dayOfWeek = now.day();

    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpen = 9 * 60 + 30; // 9:30 AM in minutes
    const marketClose = 16 * 60; // 4:00 PM in minutes
    const currentTime = hour * 60 + minute;

    return currentTime >= marketOpen && currentTime < marketClose;
  }

  /**
   * Format date for display
   */
  static format(date, format = this.formatters.DATETIME, timezone = null) {
    const momentDate = moment(date);
    return timezone ? momentDate.tz(timezone).format(format) : momentDate.format(format);
  }

  /**
   * Parse date string
   */
  static parse(dateString, format = null) {
    return format ? moment(dateString, format) : moment(dateString);
  }

  /**
   * Get trading days between dates
   */
  static getTradingDaysBetween(startDate, endDate) {
    const start = moment(startDate);
    const end = moment(endDate);
    let tradingDays = 0;

    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      const dayOfWeek = current.day();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
        tradingDays++;
      }
      current.add(1, 'day');
    }

    return tradingDays;
  }

  /**
   * Get next trading day
   */
  static getNextTradingDay(date = null) {
    const current = moment(date || new Date());
    let next = current.clone().add(1, 'day');

    while (next.day() === 0 || next.day() === 6) {
      next.add(1, 'day');
    }

    return next;
  }

  /**
   * Convert to UTC
   */
  static toUTC(date, timezone = null) {
    const momentDate = timezone ? moment.tz(date, timezone) : moment(date);
    return momentDate.utc();
  }

  /**
   * Get time until market open
   */
  static getTimeUntilMarketOpen(timezone = 'America/New_York') {
    const now = this.getMarketTime(timezone);
    const marketOpen = now.clone().hour(9).minute(30).second(0);

    if (now.isAfter(marketOpen)) {
      marketOpen.add(1, 'day');
    }

    // Skip weekends
    while (marketOpen.day() === 0 || marketOpen.day() === 6) {
      marketOpen.add(1, 'day');
    }

    return marketOpen.diff(now);
  }
}

module.exports = DateTime;