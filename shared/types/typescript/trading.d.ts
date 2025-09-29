/**
 * Trading Type Definitions for NexusTradeAI
 * Comprehensive TypeScript interfaces for trading operations
 */

export interface TradingAccount {
  id: string;
  userId: string;
  accountType: 'CASH' | 'MARGIN' | 'PAPER';
  balance: number;
  buyingPower: number;
  dayTradingBuyingPower: number;
  equity: number;
  lastEquity: number;
  multiplier: number;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  transfersBlocked: boolean;
  accountBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  accountId: string;
  symbol: string;
  assetClass: AssetClass;
  side: 'LONG' | 'SHORT';
  quantity: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  averageEntryPrice: number;
  currentPrice: number;
  lastDayPrice: number;
  changeToday: number;
  changeTodayPercent: number;
  exchange: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  clientOrderId: string;
  accountId: string;
  symbol: string;
  assetClass: AssetClass;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  limitPrice?: number;
  stopPrice?: number;
  trailPrice?: number;
  trailPercent?: number;
  status: OrderStatus;
  submittedAt: Date;
  filledAt?: Date;
  canceledAt?: Date;
  expiredAt?: Date;
  replacedAt?: Date;
  replacedBy?: string;
  replaces?: string;
  legs?: OrderLeg[];
  commission?: number;
  fees?: number;
  exchange: string;
  extendedHours: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderLeg {
  id: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  ratio: number;
}

export interface Trade {
  id: string;
  orderId: string;
  accountId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  timestamp: Date;
  commission: number;
  fees: number;
  exchange: string;
  executionId: string;
}

export interface MarketData {
  symbol: string;
  timestamp: Date;
  price: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  previousClose: number;
  change: number;
  changePercent: number;
  vwap: number;
  exchange: string;
}

export interface Quote {
  symbol: string;
  timestamp: Date;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  spread: number;
  spreadPercent: number;
  exchange: string;
}

export interface Bar {
  symbol: string;
  timestamp: Date;
  timeframe: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  tradeCount: number;
}

export interface Portfolio {
  accountId: string;
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayPnL: number;
  dayPnLPercent: number;
  positions: Position[];
  cash: number;
  longMarketValue: number;
  shortMarketValue: number;
  equity: number;
  lastEquity: number;
  buyingPower: number;
  initialMargin: number;
  maintenanceMargin: number;
  sma: number;
  dayTradingBuyingPower: number;
  regulationTEquity: number;
  lastMaintenanceMargin: number;
  daytradeCount: number;
  updatedAt: Date;
}

// Enums
export type AssetClass = 'EQUITY' | 'OPTION' | 'CRYPTO' | 'FOREX' | 'FUTURE' | 'BOND' | 'COMMODITY';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TRAILING_STOP';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK' | 'GTD';
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'EXPIRED' | 'REJECTED';
export type Timeframe = '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour' | '1day' | '1week' | '1month';