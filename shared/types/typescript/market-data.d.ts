//shared/types/typescript/market-data.d.ts
export interface MarketData {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high24h?: number;
    low24h?: number;
    market: 'stock' | 'crypto' | 'forex' | 'commodity' | 'options';
    exchange: string;
    timestamp: number;
    bid?: number;
    ask?: number;
    spread?: number;
  }
  
  export interface OrderBookEntry {
    price: number;
    quantity: number;
    total: number;
  }
  
  export interface OrderBook {
    symbol: string;
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    timestamp: number;
  }
  
  export interface Trade {
    id: string;
    symbol: string;
    price: number;
    quantity: number;
    side: 'buy' | 'sell';
    timestamp: number;
    exchange: string;
  }
  
  //shared/types/typescript/trading.d.ts
  export interface Order {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop' | 'stop_limit';
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTD';
    status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
    filledQuantity: number;
    avgFillPrice?: number;
    timestamp: number;
    expiryTime?: number;
  }
  
  export interface Position {
    symbol: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    realizedPnL: number;
    market: string;
    side: 'long' | 'short';
    marginUsed?: number;
    leverage?: number;
  }
  
  export interface Portfolio {
    totalValue: number;
    availableCash: number;
    dayChange: number;
    dayChangePercent: number;
    positions: Position[];
    totalPnL: number;
    marginUsed: number;
    marginAvailable: number;
  }
  
  //shared/types/typescript/user.d.ts
  export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    plan: 'retail' | 'professional' | 'institutional';
    verificationStatus: 'pending' | 'verified' | 'rejected';
    preferences: UserPreferences;
    permissions: string[];
  }
  
  export interface UserPreferences {
    theme: 'dark' | 'light' | 'auto';
    language: string;
    currency: string;
    timezone: string;
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
      priceAlerts: boolean;
      orderFills: boolean;
      newsAlerts: boolean;
    };
    trading: {
      defaultOrderType: string;
      confirmations: boolean;
      autoLogout: number;
      riskWarnings: boolean;
    };
  }