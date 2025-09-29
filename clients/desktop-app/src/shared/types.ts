// Shared types between main and renderer processes

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  isMaximized: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
  bounds: WindowBounds;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  autoStart: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  notifications: {
    desktop: boolean;
    sound: boolean;
    priceAlerts: boolean;
    orderFills: boolean;
    systemUpdates: boolean;
  };
  trading: {
    confirmOrders: boolean;
    defaultOrderType: 'market' | 'limit';
    defaultTimeInForce: 'GTC' | 'IOC' | 'FOK';
    maxOrderValue: number;
  };
  security: {
    autoLock: boolean;
    lockTimeout: number; // minutes
    requirePasswordOnWake: boolean;
    biometricAuth: boolean;
  };
  performance: {
    hardwareAcceleration: boolean;
    backgroundThrottling: boolean;
    maxMemoryUsage: number; // MB
    enableGPU: boolean;
  };
}

export interface HotkeyConfig {
  key: string;
  modifiers: string[];
  action: string;
  enabled: boolean;
  description: string;
}

export interface TradingHotkeys {
  newOrder: HotkeyConfig;
  quickBuy: HotkeyConfig;
  quickSell: HotkeyConfig;
  cancelAll: HotkeyConfig;
  closeAll: HotkeyConfig;
  navigateDashboard: HotkeyConfig;
  navigateTrading: HotkeyConfig;
  navigatePortfolio: HotkeyConfig;
  navigateMarkets: HotkeyConfig;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
  memory: {
    total: number;
    used: number;
    available: number;
  };
  cpu: {
    usage: number;
    cores: number;
    model: string;
  };
  gpu?: {
    vendor: string;
    model: string;
    memory: number;
  };
  network: {
    isOnline: boolean;
    connectionType: string;
    downloadSpeed?: number;
    uploadSpeed?: number;
  };
}

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  size: number;
  signature: string;
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  installing: boolean;
  error: string | null;
  progress: number;
  updateInfo?: UpdateInfo;
}

export interface NotificationConfig {
  id: string;
  title: string;
  body: string;
  icon?: string;
  sound?: boolean;
  urgent?: boolean;
  actions?: Array<{
    type: string;
    text: string;
  }>;
  data?: any;
}

export interface MenuTemplate {
  label: string;
  submenu?: MenuTemplate[];
  role?: string;
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
  click?: () => void;
  accelerator?: string;
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
}

export interface IPCMessage<T = any> {
  type: string;
  payload?: T;
  requestId?: string;
  error?: string;
}

// Trading related types
export interface Order {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTD';
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' | 'expired';
  executedQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  fees: number;
  timestamp: number;
  updateTime: number;
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  feeAsset: string;
  timestamp: number;
  isMaker: boolean;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  percentage: number;
  leverage: number;
  margin: number;
  timestamp: number;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue: number;
}

export interface Portfolio {
  totalValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  dayChange: number;
  dayChangePercentage: number;
  balances: Balance[];
  positions: Position[];
  performance: {
    period: string;
    returns: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
  };
}

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  volumeUsd24h: number;
  marketCap?: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  stack?: string;
}

// Event types for IPC communication
export type IPCEvents = {
  // Window events
  'window:minimize': void;
  'window:maximize': void;
  'window:restore': void;
  'window:close': void;
  'window:toggle-fullscreen': void;
  'window:get-state': void;
  'window:set-bounds': WindowBounds;

  // App events
  'app:quit': void;
  'app:restart': void;
  'app:get-version': void;
  'app:get-system-info': void;

  // Settings events
  'settings:get': void;
  'settings:set': AppSettings;
  'settings:reset': void;

  // Trading events
  'trading:place-order': Order;
  'trading:cancel-order': string;
  'trading:get-orders': void;
  'trading:get-positions': void;

  // Market data events
  'market:subscribe': string;
  'market:unsubscribe': string;
  'market:get-ticker': string;

  // Notification events
  'notification:show': NotificationConfig;
  'notification:clear': string;

  // Update events
  'update:check': void;
  'update:download': void;
  'update:install': void;

  // Menu events
  'menu:new-order': void;
  'menu:quick-buy': void;
  'menu:quick-sell': void;
  'menu:navigate': string;
};

export default {};
