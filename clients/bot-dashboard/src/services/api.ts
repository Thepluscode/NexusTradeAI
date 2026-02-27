import axios, { AxiosInstance } from 'axios';
import type {
  TradingEngineStatus,
  RiskReport,
  RiskAnalytics,
  AIPrediction,
  AISentiment,
  AIPortfolioOptimization,
  AIChatResponse,
  AIServiceHealth,
  MarketQuote,
  MarketDataStatus,
  APIResponse,
  Position,
  Strategy,
  StrategyConfig,
  StrategyTestResult,
  BankAccount,
  TradingAccount,
  Transaction,
  BrokerStatus,
  BrokerConnection,
  GDPRStatus,
  AMLStatus,
  AutomationStatus,
  SystemStatus,
  ServiceHealth,
  DashboardSummary,
  AlpacaPosition,
} from '@/types';

// Service Configuration
const SERVICE_CONFIG = {
  tradingEngine: { baseURL: 'http://localhost:3002', timeout: 10000 },  // Stock Bot
  riskManager: { baseURL: 'http://localhost:3004', timeout: 10000 },
  aiService: { baseURL: 'http://localhost:5001', timeout: 10000 },
  marketData: { baseURL: 'http://localhost:3001', timeout: 10000 },
  dashboardAPI: { baseURL: 'http://localhost:8080', timeout: 10000 },
  unifiedPositions: { baseURL: 'http://localhost:3002', timeout: 10000 },  // Stock Bot (Alpaca positions)
  brokerAPI: { baseURL: 'http://localhost:3003', timeout: 10000 },
  bankingService: { baseURL: 'http://localhost:3012', timeout: 10000 },
  forexService: { baseURL: 'http://localhost:3005', timeout: 10000 },  // Forex Bot
  cryptoService: { baseURL: 'http://localhost:3006', timeout: 10000 }, // Crypto Bot
};

class APIClient {
  private tradingEngine: AxiosInstance;
  private riskManager: AxiosInstance;
  private aiService: AxiosInstance;
  private marketData: AxiosInstance;
  private dashboardAPI: AxiosInstance;
  private unifiedPositions: AxiosInstance;
  private brokerAPI: AxiosInstance;
  private bankingService: AxiosInstance;
  private forexService: AxiosInstance;
  private cryptoService: AxiosInstance;

  constructor() {
    this.tradingEngine = axios.create(SERVICE_CONFIG.tradingEngine);
    this.riskManager = axios.create(SERVICE_CONFIG.riskManager);
    this.aiService = axios.create(SERVICE_CONFIG.aiService);
    this.marketData = axios.create(SERVICE_CONFIG.marketData);
    this.dashboardAPI = axios.create(SERVICE_CONFIG.dashboardAPI);
    this.unifiedPositions = axios.create(SERVICE_CONFIG.unifiedPositions);
    this.brokerAPI = axios.create(SERVICE_CONFIG.brokerAPI);
    this.bankingService = axios.create(SERVICE_CONFIG.bankingService);
    this.forexService = axios.create(SERVICE_CONFIG.forexService);
    this.cryptoService = axios.create(SERVICE_CONFIG.cryptoService);
  }

  // ==================================================
  // Trading Engine API (port 3002)
  // ==================================================
  async getTradingEngineStatus(): Promise<TradingEngineStatus> {
    const response = await this.tradingEngine.get<APIResponse<TradingEngineStatus>>('/api/trading/status');
    return response.data.data;
  }

  async getActivePositions(): Promise<Position[]> {
    const response = await this.tradingEngine.get<APIResponse<{ positions: Position[] }>>('/api/trading/status');
    return response.data?.data?.positions || [];
  }

  async startTradingEngine(): Promise<void> {
    await this.tradingEngine.post('/api/trading/start');
  }

  async stopTradingEngine(): Promise<void> {
    await this.tradingEngine.post('/api/trading/stop');
  }

  async realizeProfits(): Promise<void> {
    await this.tradingEngine.post('/api/trading/realize-profits');
  }

  // ==================================================
  // Risk Manager API (port 3004)
  // ==================================================
  async getRiskReport(): Promise<RiskReport> {
    const response = await this.riskManager.get<APIResponse<RiskReport>>('/api/risk/report');
    return response.data.data;
  }

  async getRiskMetrics(): Promise<RiskReport['riskMetrics']> {
    const response = await this.riskManager.get<APIResponse<{ riskMetrics: RiskReport['riskMetrics'] }>>('/api/risk/metrics');
    return response.data.data.riskMetrics;
  }

  async getRiskAlerts(): Promise<RiskReport['recentAlerts']> {
    const response = await this.riskManager.get<APIResponse<{ alerts: RiskReport['recentAlerts'] }>>('/api/risk/alerts');
    return response.data.data.alerts || [];
  }

  async preTradeRiskCheck(trade: any): Promise<{ approved: boolean; checks: Record<string, { passed: boolean }> }> {
    const response = await this.riskManager.post('/api/risk/pre-trade-check', trade);
    return response.data.data;
  }

  // ==================================================
  // AI Service API (port 5001)
  // ==================================================
  async getAIPrediction(
    symbol: string,
    strategy: string,
    marketData: Record<string, any>
  ): Promise<AIPrediction> {
    const response = await this.aiService.post<{ success: boolean; prediction: AIPrediction }>('/predict', {
      symbol,
      strategy,
      marketData,
    });
    return response.data.prediction;
  }

  async getAIHealth(): Promise<AIServiceHealth> {
    try {
      const response = await this.aiService.get('/health');
      return {
        status: response.data.status || 'healthy',
        healthy: response.status === 200,
        models_loaded: response.data.models_loaded || 0,
        successRate: response.data.successRate,
        avgLatency: response.data.avgLatency,
        predictionMethod: response.data.predictionMethod,
        predictionsServed: response.data.predictionsServed,
      };
    } catch {
      return {
        status: 'offline',
        healthy: false,
        models_loaded: 0,
      };
    }
  }

  async getAIModels(): Promise<{ id: string; description: string; status: string }[]> {
    const response = await this.aiService.get('/models');
    return response.data.models || [];
  }

  // ==================================================
  // Dashboard API (port 8080) - Comprehensive Endpoints
  // ==================================================

  // Strategies
  async getStrategies(): Promise<Strategy[]> {
    const response = await this.dashboardAPI.get<APIResponse<Strategy[]>>('/api/strategies');
    return response.data.data;
  }

  async getStrategy(name: string): Promise<Strategy> {
    const response = await this.dashboardAPI.get<APIResponse<Strategy>>(`/api/strategies/${encodeURIComponent(name)}`);
    return response.data.data;
  }

  async configureStrategy(name: string, config: StrategyConfig): Promise<void> {
    await this.dashboardAPI.post(`/api/strategies/${encodeURIComponent(name)}/configure`, config);
  }

  async testStrategy(name: string): Promise<StrategyTestResult> {
    const response = await this.dashboardAPI.post<APIResponse<StrategyTestResult>>(`/api/strategies/${encodeURIComponent(name)}/test`);
    return response.data.data;
  }

  // Automation - using real data from Trading Engine
  async getAutomationStatus(): Promise<AutomationStatus> {
    try {
      // Get real data from trading engine
      const response = await this.tradingEngine.get('/api/trading/status');
      const data = response.data.data;

      return {
        isRunning: data?.isRunning || false,
        mode: data?.mode || (data?.isRunning ? 'Paper' : 'Offline'),
        strategiesActive: data?.performance?.activeStrategies || 0,
        symbolsMonitored: data?.performance?.symbolsMonitored || 0,
        dailyPnL: data?.dailyPnL || 0,
        tradesExecutedToday: data?.performance?.totalTrades || 0,
        activePositions: data?.performance?.activePositions || 0,
        realTradingEnabled: false,
        paperTradingMode: true,
        systemUptime: 0,
      };
    } catch {
      // Return default state if trading engine unavailable
      return {
        isRunning: false,
        mode: 'Paper',
        strategiesActive: 0,
        symbolsMonitored: 0,
        dailyPnL: 0,
        tradesExecutedToday: 0,
        activePositions: 0,
        realTradingEnabled: false,
        paperTradingMode: true,
        systemUptime: 0,
      };
    }
  }

  async startAutomation(config?: { symbols?: string[]; maxDailyLoss?: number }): Promise<AutomationStatus> {
    const response = await this.dashboardAPI.post<APIResponse<AutomationStatus>>('/api/automation/start', config);
    return response.data.data;
  }

  async stopAutomation(): Promise<void> {
    await this.dashboardAPI.post('/api/automation/stop');
  }

  async pauseAutomation(): Promise<void> {
    await this.dashboardAPI.post('/api/automation/pause');
  }

  async resumeAutomation(): Promise<void> {
    await this.dashboardAPI.post('/api/automation/resume');
  }

  async enableRealTrading(): Promise<{ realTradingEnabled: boolean; confirmation: string }> {
    const response = await this.dashboardAPI.post('/api/automation/real-trading/enable');
    return response.data.data;
  }

  async disableRealTrading(): Promise<{ realTradingEnabled: boolean; confirmation: string }> {
    const response = await this.dashboardAPI.post('/api/automation/real-trading/disable');
    return response.data.data;
  }

  // AI Chat & Sentiment
  async getAISentiment(): Promise<AISentiment> {
    const response = await this.dashboardAPI.get<APIResponse<AISentiment>>('/api/ai/sentiment');
    return response.data.data;
  }

  async getAIPredictions(): Promise<AIPrediction[]> {
    const response = await this.dashboardAPI.get<APIResponse<AIPrediction[]>>('/api/ai/predictions');
    return response.data.data;
  }

  async sendAIChatMessage(message: string): Promise<AIChatResponse> {
    const response = await this.dashboardAPI.post<APIResponse<AIChatResponse>>('/api/ai/chat', { message });
    return response.data.data;
  }

  async getPortfolioOptimization(): Promise<AIPortfolioOptimization> {
    const response = await this.dashboardAPI.get<APIResponse<AIPortfolioOptimization>>('/api/ai/portfolio-optimization');
    return response.data.data;
  }

  // Compliance
  async getGDPRStatus(): Promise<GDPRStatus> {
    const response = await this.dashboardAPI.get<APIResponse<GDPRStatus>>('/api/compliance/gdpr/status');
    return response.data.data;
  }

  async getAMLDashboard(): Promise<AMLStatus> {
    const response = await this.dashboardAPI.get<APIResponse<AMLStatus>>('/api/compliance/aml/dashboard');
    return response.data.data;
  }

  // Risk Analytics
  async getRiskAnalyticsReport(): Promise<RiskAnalytics> {
    const response = await this.dashboardAPI.get<APIResponse<RiskAnalytics>>('/api/risk/analytics/report');
    return response.data.data;
  }

  async getVaR(): Promise<{ valueAtRisk: number; confidenceLevel: number; timeHorizon: number; currency: string }> {
    const response = await this.dashboardAPI.get('/api/risk/analytics/var');
    return response.data.data;
  }

  async getRiskRatios(): Promise<{ sharpeRatio: number; sortinoRatio: number; calmarRatio: number; maxDrawdown: number }> {
    const response = await this.dashboardAPI.get('/api/risk/analytics/ratios');
    return response.data.data;
  }

  // System Status
  async getSystemStatus(): Promise<SystemStatus> {
    const response = await this.dashboardAPI.get<APIResponse<SystemStatus>>('/api/enhanced/system/status');
    return response.data.data;
  }

  // ==================================================
  // Market Data API (port 3001)
  // ==================================================
  async getMarketQuote(symbol: string): Promise<MarketQuote> {
    const response = await this.marketData.get<APIResponse<MarketQuote>>(`/api/market/quote/${symbol}`);
    return response.data.data;
  }

  async getMarketStatus(): Promise<MarketDataStatus> {
    try {
      const response = await this.marketData.get('/api/market/status');
      return {
        connected: response.data.success || false,
        providers: response.data.data?.providers || {},
        totalQuotes: response.data.data?.totalQuotes || 0,
        dataQuality: response.data.data?.dataQuality || 'Unknown',
        avgLatency: response.data.data?.avgLatency || 0,
      };
    } catch {
      return {
        connected: false,
        providers: {},
        totalQuotes: 0,
        dataQuality: 'Offline',
        avgLatency: 0,
      };
    }
  }

  // ==================================================
  // Unified Positions API (port 3005) - Real Alpaca Data
  // ==================================================
  async getAlpacaPositions(): Promise<AlpacaPosition[]> {
    const response = await this.unifiedPositions.get('/api/positions');
    return response.data.positions || [];
  }

  async getAlpacaAccount(): Promise<TradingAccount> {
    const response = await this.unifiedPositions.get('/api/account');
    return response.data.account;
  }

  async getUnifiedDashboard(): Promise<DashboardSummary> {
    const response = await this.unifiedPositions.get('/api/dashboard');
    return response.data.data;
  }

  // ==================================================
  // Forex Trading API (port 3005)
  // ==================================================
  async getForexStatus(): Promise<any> {
    try {
      const response = await this.forexService.get('/api/forex/status');
      return response.data.data;
    } catch {
      return {
        isRunning: false,
        marketOpen: false,
        session: { name: 'Offline', quality: 'offline' },
        positions: [],
        performance: { totalTrades: 0, activePositions: 0 },
        portfolioValue: 0,
        dailyPnL: 0,
      };
    }
  }

  async getForexPositions(): Promise<any[]> {
    try {
      const response = await this.forexService.get('/api/forex/status');
      return response.data.data?.positions || [];
    } catch {
      return [];
    }
  }

  async getForexAccount(): Promise<any> {
    try {
      const response = await this.forexService.get('/api/accounts/summary');
      return response.data.data;
    } catch {
      return {
        realAccount: { balance: 0, equity: 0 },
        demoAccount: { balance: 0, equity: 0 },
      };
    }
  }

  async startForexTrading(): Promise<void> {
    await this.forexService.post('/api/forex/start');
  }

  async stopForexTrading(): Promise<void> {
    await this.forexService.post('/api/forex/stop');
  }

  async scanForexSignals(): Promise<any[]> {
    const response = await this.forexService.post('/api/forex/scan');
    return response.data.signals || [];
  }

  // ==================================================
  // Crypto Trading API (port 3006)
  // ==================================================
  async getCryptoStatus(): Promise<any> {
    try {
      const response = await this.cryptoService.get('/api/crypto/status');
      return response.data.data || response.data;
    } catch {
      return {
        isRunning: false,
        positions: [],
        portfolioValue: 0,
        equity: 0,
        performance: { totalTrades: 0, activePositions: 0 },
      };
    }
  }

  // ==================================================
  // Backtest Report API
  // ==================================================
  async getBacktestReport(): Promise<any> {
    try {
      const response = await this.tradingEngine.get('/api/backtest/report');
      return response.data.data;
    } catch {
      return null;
    }
  }

  // ==================================================
  // Broker API (port 3003)
  // ==================================================
  async getBrokerStatus(): Promise<BrokerStatus> {
    const response = await this.dashboardAPI.get<APIResponse<BrokerStatus>>('/api/broker/status');
    return response.data.data;
  }

  async getBrokerList(): Promise<BrokerConnection[]> {
    const response = await this.dashboardAPI.get<APIResponse<BrokerConnection[]>>('/api/broker/list');
    return response.data.data;
  }

  async testBrokerConnection(broker?: string): Promise<{ connected: boolean; broker: string; latency: number }> {
    const response = await this.dashboardAPI.post('/api/broker/test-connection', { broker });
    return response.data.data;
  }

  async connectBroker(broker: string, credentials: Record<string, string>): Promise<{ connected: boolean; message: string }> {
    const response = await this.dashboardAPI.post('/api/broker/connect', { broker, credentials });
    return response.data.data;
  }

  async testAlpacaConnection(): Promise<{ connected: boolean; account?: any }> {
    try {
      const response = await this.brokerAPI.post('/api/broker/test-alpaca');
      return response.data.data;
    } catch {
      return { connected: false };
    }
  }

  async getAlpacaBrokerAccount(): Promise<any> {
    const response = await this.brokerAPI.get('/api/broker/alpaca/account');
    return response.data.data;
  }

  // ==================================================
  // Banking Service (port 3012)
  // ==================================================
  async getBankAccounts(): Promise<BankAccount[]> {
    try {
      const response = await this.bankingService.get('/api/banking/accounts');
      return response.data.data || [];
    } catch {
      // Fall back to dashboard API proxy
      const response = await this.dashboardAPI.get('/api/banking/accounts');
      return response.data.data || [];
    }
  }

  async getTradingAccountBalance(): Promise<TradingAccount> {
    try {
      const response = await this.bankingService.get('/api/banking/trading-account');
      return response.data.data;
    } catch {
      const response = await this.dashboardAPI.get('/api/banking/trading-account');
      return response.data.data;
    }
  }

  async deposit(amount: number, fromAccountId: string): Promise<Transaction> {
    const response = await this.dashboardAPI.post('/api/banking/deposit', { amount, fromAccountId });
    return response.data.data;
  }

  async withdraw(amount: number, toAccountId: string): Promise<Transaction> {
    const response = await this.dashboardAPI.post('/api/banking/withdraw', { amount, toAccountId });
    return response.data.data;
  }

  async getTransactions(limit?: number): Promise<Transaction[]> {
    const response = await this.dashboardAPI.get(`/api/banking/transactions${limit ? `?limit=${limit}` : ''}`);
    return response.data.data || [];
  }

  async linkBankAccount(accountDetails: { bankName: string; accountNumber: string; routingNumber: string }): Promise<BankAccount> {
    const response = await this.dashboardAPI.post('/api/banking/link-account', accountDetails);
    return response.data.data;
  }

  // ==================================================
  // Service Health Checks
  // ==================================================
  async checkServiceHealth(serviceName: string, port: number): Promise<ServiceHealth> {
    const startTime = Date.now();

    // Different services use different health endpoints
    const healthEndpoints: Record<string, string[]> = {
      'Stock Bot': ['/api/trading/status', '/health', '/api/health'],
      'Forex Bot': ['/api/forex/status', '/health', '/api/health'],
      'Crypto Bot': ['/api/crypto/status', '/health', '/api/health'],
      'Market Data': ['/api/health', '/health', '/api/market/quote/SPY'],
      'AI Service': ['/health', '/api/health'],
    };

    const endpoints = healthEndpoints[serviceName] || ['/health', '/api/health'];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`http://localhost:${port}${endpoint}`, { timeout: 3000 });
        if (response.status === 200) {
          return {
            name: serviceName,
            status: 'online',
            port,
            latency: Date.now() - startTime,
            lastCheck: new Date().toISOString(),
          };
        }
      } catch {
        continue; // Try next endpoint
      }
    }

    return {
      name: serviceName,
      status: 'offline',
      port,
      latency: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
    };
  }

  async getAllServicesHealth(): Promise<ServiceHealth[]> {
    const services = [
      { name: 'Stock Bot',   port: 3002 },
      { name: 'Forex Bot',   port: 3005 },
      { name: 'Crypto Bot',  port: 3006 },
      { name: 'Market Data', port: 3001 },
      { name: 'AI Service',  port: 5001 },
    ];

    const results = await Promise.all(
      services.map(s => this.checkServiceHealth(s.name, s.port))
    );

    return results;
  }

  // ==================================================
  // Account Management (with fallbacks)
  // ==================================================
  async getAccountSummary() {
    try {
      // Call the correct endpoint for account data
      const response = await this.tradingEngine.get('/api/accounts/summary');
      return response.data.data;
    } catch {
      // Return mock data if endpoint unavailable
      return {
        activeAccount: 'demo',
        realAccount: {
          balance: 100000,
          equity: 100000,
          pnl: 0,
          pnlPercent: 0,
          linkedBanks: [],
        },
        demoAccount: {
          balance: 100000,
          equity: 100000,
          pnl: 0,
          pnlPercent: 0,
          canReset: true,
        },
      };
    }
  }

  async switchAccount(type: 'real' | 'demo') {
    const response = await this.tradingEngine.post('/api/accounts/switch', { type });
    return response.data.data;
  }

  async resetDemoAccount() {
    const response = await this.tradingEngine.post('/api/accounts/demo/reset');
    return response.data.data;
  }

  async withdrawFunds(amount: number, bankId: string) {
    const response = await this.dashboardAPI.post('/api/banking/withdraw', { amount, bankId });
    return response.data.data;
  }
}

export const apiClient = new APIClient();
export { SERVICE_CONFIG };
