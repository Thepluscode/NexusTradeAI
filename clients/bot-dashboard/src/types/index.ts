// ============================================
// Core Trading Types
// ============================================

export interface TradingEngineStatus {
  isRunning: boolean;
  circuitBreakerActive: boolean;
  activePositions: number;
  dailyPnL: number;
  portfolioVaR: number;
  leverage: number;
  portfolioValue: number;
  equity?: number;          // Stock bot sends `equity` (actual Alpaca account equity)
  totalExposure: number;
  performance: {
    totalTrades: number;
    winningTrades: number;
    winRate: number;
    totalProfit: number;
    sharpeRatio: number;
    sortinoRatio?: number;
    maxDrawdown: number;
    profitFactor?: number;
    expectancy?: number;
    activePositions: number;
  };
  riskMetrics: {
    consecutiveLosses: number;
    maxDrawdown: number;
    dailyVolume: number;
  };
  positions?: Position[];
}

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  direction?: 'long' | 'short';
  quantity: number;
  size?: number;
  entryPrice: number;
  entry?: number;
  currentPrice: number;
  current?: number;
  unrealizedPnL: number;
  realizedPnL: number;
  pnl?: number;
  profit?: number;
  strategy: string;
  openTime?: number;
  confidence?: number;
  marketValue?: number;
  changeToday?: number;
}

// ============================================
// Risk Management Types
// ============================================

export interface RiskMetrics {
  portfolioValue: number;
  portfolioVaR: number;
  portfolioCVaR: number;
  leverage: number;
  concentrationRisk: number;
  marginUtilization: number;
  maxDrawdown: number;
  currentDrawdown?: number;
  highWaterMark?: number;
  portfolioBeta?: number;
  totalExposure?: number;
  dailyPnL?: number;
}

export interface RiskAlert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  details: Record<string, any>;
  message?: string;
  timestamp: number;
}

export interface RiskReport {
  riskMetrics: RiskMetrics;
  sectorExposure: Record<string, number>;
  correlationRisk: Record<string, {
    correlation: number;
    risk: string;
  }>;
  recentAlerts: RiskAlert[];
  riskLimitStatus?: boolean;
  dataSource?: string;
}

export interface RiskAnalytics {
  portfolioRisk: number;
  valueAtRisk: number;
  sharpeRatio: number;
  sortinoRatio?: number;
  calmarRatio?: number;
  maxDrawdown: number;
  riskScore?: number;
  riskLevel?: string;
  recommendations?: string[];
}

// ============================================
// AI Service Types
// ============================================

export interface AIServiceHealth {
  status: string;
  healthy: boolean;
  models_loaded?: number;
  successRate?: number;
  avgLatency?: number;
  predictionMethod?: string;
  predictionsServed?: number;
}

export interface AIPrediction {
  symbol: string;
  strategy: string;
  direction: 'up' | 'down' | 'bullish' | 'bearish';
  confidence: number;
  strength: number;
  method: string;
  timestamp: string;
  tradable: boolean;
  targetPrice?: number;
  timeframe?: string;
}

export interface AISentiment {
  overall: number;
  symbols: Record<string, number>;
  lastUpdate: string;
}

export interface AIPortfolioOptimization {
  recommendedAllocation: Record<string, number>;
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIChatResponse {
  response: string;
  timestamp: string;
  confidence: number;
  suggestions: string[];
}

// ============================================
// Market Data Types
// ============================================

export interface MarketDataStatus {
  connected: boolean;
  providers: Record<string, any>;
  totalQuotes: number;
  dataQuality: string;
  avgLatency: number;
}

export interface MarketQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: number;
}

// ============================================
// Strategy Types
// ============================================

export interface Strategy {
  id?: string;
  name: string;
  status: 'active' | 'inactive' | 'paused';
  winRate: number;
  profit: number;
  trades: number;
  confidence: number;
  lastSignal: string;
  description?: string;
}

export interface StrategyConfig {
  strategyName: string;
  parameters: Record<string, any>;
  riskSettings: {
    maxPositionSize: number;
    stopLoss: number;
    takeProfit: number;
  };
}

export interface StrategyTestResult {
  strategyName: string;
  testDuration: string;
  simulatedTrades: number;
  winRate: string;
  profit: string;
  maxDrawdown: string;
  sharpeRatio: string;
  status: string;
  recommendations: string[];
}

// ============================================
// Banking Types
// ============================================

export interface BankAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'trading';
  balance: number;
  currency: string;
  status: 'active' | 'pending' | 'inactive';
  lastUpdated: string;
}

export interface TradingAccount {
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  lastEquity: number;
  profitToday: number;
  profitTodayPercent: number;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'trade';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  description?: string;
}

// ============================================
// Broker Types
// ============================================

export interface BrokerConnection {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  latency?: number;
  supported: boolean;
}

export interface BrokerStatus {
  connections: BrokerConnection[];
  totalConnections: number;
  healthScore: number;
}

// ============================================
// Compliance Types
// ============================================

export interface GDPRStatus {
  status: 'compliant' | 'non-compliant' | 'pending';
  lastAudit: string;
  violations: number;
  dataRetentionCompliance: boolean;
}

export interface AMLStatus {
  status: 'Compliant' | 'Non-Compliant' | 'Under Review';
  lastCheck: string;
  riskScore: 'Low' | 'Medium' | 'High';
  flaggedTransactions: number;
  complianceRate: number;
}

export interface FINRAStatus {
  status: 'compliant' | 'non-compliant';
  lastReview: string;
  violations: number;
}

export interface ComplianceStatus {
  gdpr: GDPRStatus;
  aml: AMLStatus;
  finra: FINRAStatus;
}

// ============================================
// Automation Types
// ============================================

export interface AutomationStatus {
  isRunning: boolean;
  mode: 'Paper' | 'LIVE';
  strategiesActive: number;
  symbolsMonitored: number;
  dailyPnL: number;
  tradesExecutedToday: number;
  activePositions: number;
  realTradingEnabled: boolean;
  paperTradingMode: boolean;
  systemUptime: number;
}

// ============================================
// Service Health Types
// ============================================

export interface ServiceHealth {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  port: number;
  latency?: number;
  lastCheck: string;
  endpoints?: string[];
  optional?: boolean;  // if true, offline status doesn't count against required service count
}

export interface SystemStatus {
  systemStatus: string;
  cpuUsage: number;
  memoryUsage: number;
  activeAlerts: number;
  dataFeeds: number;
  latency: number;
}

// ============================================
// Notification Types
// ============================================

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'trade';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

// ============================================
// API Response Types
// ============================================

export interface APIResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

// ============================================
// Dashboard Summary Types
// ============================================

export interface DashboardSummary {
  activePositions: number;
  positions: Position[];
  account: TradingAccount;
  isRunning: boolean;
  strategy: string;
}

// ============================================
// Unified Positions Types (Alpaca)
// ============================================

export interface AlpacaPosition {
  symbol: string;
  qty: number;
  side: string;
  avgEntry: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  costBasis?: number;
  changeToday?: number;
}
