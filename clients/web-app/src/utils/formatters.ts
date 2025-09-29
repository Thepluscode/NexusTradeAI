import { format, formatDistanceToNow, parseISO } from 'date-fns';
import numeral from 'numeral';
import Decimal from 'decimal.js';

/**
 * Format currency values with proper locale and currency symbol
 */
export const formatCurrency = (
  value: number | string | Decimal,
  currency: string = 'USD',
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    compact?: boolean;
    showSymbol?: boolean;
  } = {}
): string => {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    compact = false,
    showSymbol = true,
  } = options;

  const numValue = typeof value === 'string' ? parseFloat(value) :
                   value instanceof Decimal ? value.toNumber() : value;

  if (isNaN(numValue)) return '$0.00';

  if (compact) {
    return numeral(numValue).format('$0.00a').toUpperCase();
  }

  const formatter = new Intl.NumberFormat('en-US', {
    style: showSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return formatter.format(numValue);
};

/**
 * Format percentage values
 */
export const formatPercentage = (
  value: number | string,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showSign?: boolean;
  } = {}
): string => {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showSign = false,
  } = options;

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) return '0.00%';

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay: showSign ? 'always' : 'auto',
  });

  return formatter.format(numValue / 100);
};

/**
 * Format large numbers with appropriate suffixes (K, M, B, T)
 */
export const formatCompactNumber = (
  value: number | string,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  } = {}
): string => {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 1,
  } = options;

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) return '0';

  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return formatter.format(numValue);
};

/**
 * Format crypto/token amounts with appropriate precision
 */
export const formatTokenAmount = (
  value: number | string | Decimal,
  symbol: string,
  options: {
    maxDecimals?: number;
    minDecimals?: number;
    showSymbol?: boolean;
  } = {}
): string => {
  const {
    maxDecimals = 8,
    minDecimals = 2,
    showSymbol = true,
  } = options;

  const numValue = typeof value === 'string' ? parseFloat(value) :
                   value instanceof Decimal ? value.toNumber() : value;

  if (isNaN(numValue)) return showSymbol ? `0 ${symbol}` : '0';

  // Determine appropriate decimal places based on value size
  let decimals = minDecimals;
  if (numValue < 0.01) decimals = maxDecimals;
  else if (numValue < 1) decimals = 6;
  else if (numValue < 100) decimals = 4;

  const formatted = numValue.toFixed(decimals).replace(/\.?0+$/, '');

  return showSymbol ? `${formatted} ${symbol}` : formatted;
};

/**
 * Format price with appropriate precision based on value
 */
export const formatPrice = (
  value: number | string | Decimal,
  options: {
    currency?: string;
    showSymbol?: boolean;
  } = {}
): string => {
  const { currency = 'USD', showSymbol = true } = options;

  const numValue = typeof value === 'string' ? parseFloat(value) :
                   value instanceof Decimal ? value.toNumber() : value;

  if (isNaN(numValue)) return showSymbol ? '$0.00' : '0.00';

  // Determine decimal places based on price range
  let decimals = 2;
  if (numValue < 0.01) decimals = 6;
  else if (numValue < 1) decimals = 4;
  else if (numValue >= 1000) decimals = 0;

  return formatCurrency(numValue, currency, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    showSymbol,
  });
};

/**
 * Format date and time
 */
export const formatDateTime = (
  date: string | Date,
  options: {
    format?: 'short' | 'medium' | 'long' | 'relative';
    includeTime?: boolean;
  } = {}
): string => {
  const { format: formatType = 'medium', includeTime = true } = options;

  const dateObj = typeof date === 'string' ? parseISO(date) : date;

  if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid date';

  switch (formatType) {
    case 'short':
      return format(dateObj, includeTime ? 'MM/dd/yy HH:mm' : 'MM/dd/yy');
    case 'medium':
      return format(dateObj, includeTime ? 'MMM dd, yyyy HH:mm' : 'MMM dd, yyyy');
    case 'long':
      return format(dateObj, includeTime ? 'MMMM dd, yyyy HH:mm:ss' : 'MMMM dd, yyyy');
    case 'relative':
      return formatDistanceToNow(dateObj, { addSuffix: true });
    default:
      return format(dateObj, includeTime ? 'MMM dd, yyyy HH:mm' : 'MMM dd, yyyy');
  }
};

/**
 * Format order status for display
 */
export const formatOrderStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    pending: 'Pending',
    open: 'Open',
    filled: 'Filled',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    partially_filled: 'Partially Filled',
  };

  return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
};

/**
 * Format trading pair symbol
 */
export const formatTradingPair = (symbol: string): string => {
  // Handle different symbol formats (BTC-USDT, BTCUSDT, BTC/USDT)
  const normalized = symbol.replace(/[-\/]/g, '');

  // Common base currencies to split on
  const quoteCurrencies = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB'];

  for (const quote of quoteCurrencies) {
    if (normalized.endsWith(quote)) {
      const base = normalized.slice(0, -quote.length);
      return `${base}/${quote}`;
    }
  }

  // Fallback: try to split at common positions
  if (normalized.length >= 6) {
    const base = normalized.slice(0, -4);
    const quote = normalized.slice(-4);
    return `${base}/${quote}`;
  }

  return symbol;
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (
  text: string,
  maxLength: number,
  options: {
    position?: 'end' | 'middle';
    ellipsis?: string;
  } = {}
): string => {
  const { position = 'end', ellipsis = '...' } = options;

  if (text.length <= maxLength) return text;

  if (position === 'middle') {
    const start = Math.ceil((maxLength - ellipsis.length) / 2);
    const end = Math.floor((maxLength - ellipsis.length) / 2);
    return text.slice(0, start) + ellipsis + text.slice(-end);
  }

  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
};

/**
 * Format address (wallet, contract) for display
 */
export const formatAddress = (
  address: string,
  options: {
    startChars?: number;
    endChars?: number;
    ellipsis?: string;
  } = {}
): string => {
  const { startChars = 6, endChars = 4, ellipsis = '...' } = options;

  if (address.length <= startChars + endChars) return address;

  return `${address.slice(0, startChars)}${ellipsis}${address.slice(-endChars)}`;
};