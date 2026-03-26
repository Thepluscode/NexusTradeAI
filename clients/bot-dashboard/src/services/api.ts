import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  TradingEngineStatus,
  AIServiceHealth,
  MarketDataStatus,
  Position,
  AutomationStatus,
  ServiceHealth,
  AlpacaPosition,
  BotConfig,
  BacktestReport,
  BacktestScanResult,
  TradeRecord,
  TradesSummaryResult,
  TradeAnalyticsHour,
  TradeAnalyticsRegime,
  TradeAnalyticsStrategy,
  TradeAnalyticsSymbol,
  TradeAnalyticsTier,
  EquityCurvePoint,
} from '@/types';

// ── Service URLs ─────────────────────────────────────────────────────────────
// VITE_* env vars are baked in at build time.
// Fallbacks point to Railway production URLs so the deployed dashboard works
// without needing any env vars set. For local dev, create .env.local to override.

export const SERVICE_URLS = {
  stockBot:   import.meta.env.VITE_STOCK_BOT_URL   || 'https://nexus-stock-bot-production.up.railway.app',
  forexBot:   import.meta.env.VITE_FOREX_BOT_URL   || 'https://nexus-forex-bot-production.up.railway.app',
  cryptoBot:  import.meta.env.VITE_CRYPTO_BOT_URL  || 'https://nexus-crypto-bot-production.up.railway.app',
  marketData: import.meta.env.VITE_MARKET_DATA_URL || 'https://nexus-stock-bot-production.up.railway.app',
  aiService:  import.meta.env.VITE_AI_SERVICE_URL  || 'https://nexus-strategy-bridge-production.up.railway.app',
};

// ── Safe localStorage helpers ────────────────────────────────────────────────
function safeParseUser(): { id?: string; email?: string } {
  try {
    return JSON.parse(localStorage.getItem('nexus_user') || '{}');
  } catch {
    return {};
  }
}

// ── Auth token helpers ────────────────────────────────────────────────────────
function getAccessToken() { return localStorage.getItem('nexus_access_token'); }
function getRefreshToken() { return localStorage.getItem('nexus_refresh_token'); }

// Attach Bearer token to every outgoing request
function addAuthInterceptor(instance: AxiosInstance) {
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}

// On 401: try to refresh, then retry original request once
let _refreshing = false;
let _refreshSubscribers: Array<(token: string) => void> = [];

function subscribeRefresh(cb: (token: string) => void) {
  _refreshSubscribers.push(cb);
}
function notifyRefreshed(token: string) {
  _refreshSubscribers.forEach(cb => cb(token));
  _refreshSubscribers = [];
}

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${SERVICE_URLS.stockBot}/api/auth/refresh`, { refreshToken });
    localStorage.setItem('nexus_access_token', data.accessToken);
    localStorage.setItem('nexus_refresh_token', data.refreshToken);
    return data.accessToken;
  } catch (err: unknown) {
    // Only clear session on explicit auth rejection (401/403), not network errors
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('nexus_access_token');
      localStorage.removeItem('nexus_refresh_token');
      window.location.href = '/login';
    }
    return null;
  }
}

function addRefreshInterceptor(instance: AxiosInstance) {
  instance.interceptors.response.use(
    r => r,
    async error => {
      const original = error.config;
      if (error.response?.status !== 401 || original._retry) return Promise.reject(error);
      original._retry = true;

      if (_refreshing) {
        return new Promise(resolve => {
          subscribeRefresh(token => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(instance(original));
          });
        });
      }

      _refreshing = true;
      const newToken = await tryRefreshToken();
      _refreshing = false;
      if (newToken) {
        notifyRefreshed(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return instance(original);
      }
      return Promise.reject(error);
    }
  );
}

class APIClient {
  private tradingEngine: AxiosInstance;
  private forexService: AxiosInstance;
  private cryptoService: AxiosInstance;
  private marketData: AxiosInstance;
  private aiService: AxiosInstance;

  constructor() {
    this.tradingEngine = axios.create({ baseURL: SERVICE_URLS.stockBot,   timeout: 10000 });
    this.forexService  = axios.create({ baseURL: SERVICE_URLS.forexBot,   timeout: 10000 });
    this.cryptoService = axios.create({ baseURL: SERVICE_URLS.cryptoBot,  timeout: 10000 });
    this.marketData    = axios.create({ baseURL: SERVICE_URLS.marketData, timeout: 5000 });
    this.aiService     = axios.create({ baseURL: SERVICE_URLS.aiService,  timeout: 5000 });

    // Apply auth token header to all instances (JWT Bearer for dashboard routes)
    [this.tradingEngine, this.forexService, this.cryptoService, this.marketData, this.aiService]
      .forEach(inst => addAuthInterceptor(inst));
    // JWT refresh on all three bot instances — stock-bot hosts the /api/auth/refresh endpoint
    [this.tradingEngine, this.forexService, this.cryptoService]
      .forEach(inst => addRefreshInterceptor(inst));
  }

  // ── Stock Bot (port 3002) ─────────────────────────────────────────────────

  async getTradingEngineStatus(): Promise<TradingEngineStatus> {
    const response = await this.tradingEngine.get('/api/trading/status');
    // Bot sends a flat JSON response (no {data:} wrapper)
    return response.data;
  }

  async getActivePositions(): Promise<Position[]> {
    const response = await this.tradingEngine.get('/api/trading/status');
    return response.data?.positions || [];
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

  async getAccountSummary() {
    try {
      const response = await this.tradingEngine.get('/api/accounts/summary');
      return response.data.data;
    } catch {
      return {
        activeAccount: 'demo',
        realAccount:  { balance: 0, equity: 0, pnl: 0, pnlPercent: 0, linkedBanks: [] },
        demoAccount:  { balance: 0, equity: 0, pnl: 0, pnlPercent: 0, canReset: true },
      };
    }
  }

  async switchAccount(type: 'real' | 'demo') {
    const response = await this.tradingEngine.post('/api/accounts/switch', { type });
    return response.data; // flat: { success, activeAccount }
  }

  async resetDemoAccount() {
    const response = await this.tradingEngine.post('/api/accounts/demo/reset');
    return response.data; // flat: { success, message }
  }

  async getBotConfig(): Promise<BotConfig | null> {
    try {
      const response = await this.tradingEngine.get('/api/config');
      return response.data.data;
    } catch {
      return null;
    }
  }

  async getBacktestReport(): Promise<BacktestReport | null> {
    try {
      const response = await this.tradingEngine.get('/api/backtest/report');
      return response.data.data;
    } catch {
      return null;
    }
  }

  async runBacktest(): Promise<BacktestScanResult | null> {
    try {
      const response = await this.tradingEngine.post('/api/backtest/run');
      return response.data;
    } catch {
      return null;
    }
  }

  async getThresholdAnalysis(thresholds?: Record<string, number>): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.tradingEngine.post('/api/backtest/threshold-analysis', thresholds || {});
      return response.data;
    } catch {
      return null;
    }
  }

  async getTrades(params?: { bot?: string; limit?: number; mine?: boolean }): Promise<TradeRecord[]> {
    try {
      const response = await this.tradingEngine.get('/api/trades', { params });
      return response.data.trades ?? [];
    } catch {
      return [];
    }
  }

  async getTradesSummary(days = 30, mine = false): Promise<TradesSummaryResult | null> {
    try {
      const response = await this.tradingEngine.get('/api/trades/summary', { params: { days, mine } });
      return response.data;
    } catch {
      return null;
    }
  }

  async getEquityCurve(days = 90, bot?: string): Promise<EquityCurvePoint[]> {
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (bot) params.set('bot', bot);
      const response = await this.tradingEngine.get(`/api/performance/equity?${params}`);
      return response.data.data ?? [];
    } catch {
      return [];
    }
  }

  async getTradeAnalytics(days = 30, mine = false, bot?: string): Promise<{
    byHour: TradeAnalyticsHour[];
    bySymbol: TradeAnalyticsSymbol[];
    byTier: TradeAnalyticsTier[];
    byStrategy: TradeAnalyticsStrategy[];
    byRegime: TradeAnalyticsRegime[];
  }> {
    try {
      const params: Record<string, unknown> = { days, mine };
      if (bot) params.bot = bot;
      const response = await this.tradingEngine.get('/api/trades/analytics', { params });
      return response.data.data ?? { byHour: [], bySymbol: [], byTier: [], byStrategy: [], byRegime: [] };
    } catch {
      return { byHour: [], bySymbol: [], byTier: [], byStrategy: [], byRegime: [] };
    }
  }

  async warmupBridge(): Promise<{ seeded: string[]; failed: string[] } | null> {
    try {
      const response = await this.tradingEngine.post('/api/bridge/warmup', {}, { timeout: 60000 });
      return response.data;
    } catch {
      return null;
    }
  }

  // Automation — proxied through the real trading start/stop endpoints
  async getAutomationStatus(): Promise<AutomationStatus> {
    try {
      const response = await this.tradingEngine.get('/api/trading/status');
      // Stock bot sends flat response — no {data:} wrapper
      const data = response.data;
      return {
        isRunning: data?.isRunning || false,
        mode: data?.mode || (data?.isRunning ? 'Paper' : 'Offline'),
        strategiesActive: data?.stats?.totalTrades > 0 ? 3 : 0,  // 3 tiers active when trading
        symbolsMonitored: data?.config?.symbols?.length || 0,
        dailyPnL: data?.dailyPnL || 0,
        tradesExecutedToday: data?.stats?.totalTradesToday || data?.stats?.totalTrades || 0,
        activePositions: data?.positions?.length || 0,
        realTradingEnabled: import.meta.env.VITE_REAL_TRADING_ENABLED === 'true',
        paperTradingMode: import.meta.env.VITE_REAL_TRADING_ENABLED !== 'true',
        systemUptime: 0,
      };
    } catch {
      return {
        isRunning: false, mode: 'Paper', strategiesActive: 0,
        symbolsMonitored: 0, dailyPnL: 0, tradesExecutedToday: 0,
        activePositions: 0, realTradingEnabled: false, paperTradingMode: true, systemUptime: 0,
      };
    }
  }

  async startAutomation(_config?: { symbols?: string[]; maxDailyLoss?: number }): Promise<AutomationStatus> {
    await this.tradingEngine.post('/api/trading/start');
    return this.getAutomationStatus();
  }

  async stopAutomation(): Promise<void> {
    await this.tradingEngine.post('/api/trading/stop');
  }

  // Real-trading toggle now goes through /api/config/mode
  async enableRealTrading(): Promise<{ realTradingEnabled: boolean; confirmation: string }> {
    await Promise.allSettled([
      this.tradingEngine.post('/api/config/mode', { mode: 'live' }),
      this.cryptoService.post('/api/config/mode', { mode: 'live' }),
    ]);
    return { realTradingEnabled: true, confirmation: 'Switched to live trading' };
  }

  async disableRealTrading(): Promise<{ realTradingEnabled: boolean; confirmation: string }> {
    await Promise.allSettled([
      this.tradingEngine.post('/api/config/mode', { mode: 'paper' }),
      this.cryptoService.post('/api/config/mode', { mode: 'paper' }),
    ]);
    return { realTradingEnabled: false, confirmation: 'Switched to paper trading' };
  }

  // Alpaca positions — derived from the status endpoint (no dedicated /api/positions route)
  async getAlpacaPositions(): Promise<AlpacaPosition[]> {
    try {
      const response = await this.tradingEngine.get('/api/trading/status');
      return response.data?.positions ?? [];
    } catch {
      return [];
    }
  }

  // ── Evaluations (signal intelligence) ─────────────────────────────────────

  async getStockEvaluations() {
    try {
      const response = await this.tradingEngine.get('/api/trading/evaluations');
      return response.data?.data || null;
    } catch {
      return null;
    }
  }

  async getForexEvaluations() {
    try {
      const response = await this.forexService.get('/api/forex/evaluations');
      return response.data?.data || null;
    } catch {
      return null;
    }
  }

  async getCryptoEvaluations() {
    try {
      const response = await this.cryptoService.get('/api/crypto/evaluations');
      return response.data?.data || null;
    } catch {
      return null;
    }
  }

  // ── Signal Intelligence ──────────────────────────────────────────────────

  private _getBotInstance(bot: 'stock' | 'forex' | 'crypto'): { instance: AxiosInstance; prefix: string } {
    switch (bot) {
      case 'stock':  return { instance: this.tradingEngine, prefix: 'trading' };
      case 'forex':  return { instance: this.forexService,  prefix: 'forex' };
      case 'crypto': return { instance: this.cryptoService, prefix: 'crypto' };
    }
  }

  async getNoiseReport(bot: 'stock' | 'forex' | 'crypto'): Promise<Record<string, unknown> | null> {
    try {
      const { instance, prefix } = this._getBotInstance(bot);
      const response = await instance.get(`/api/${prefix}/noise-report`);
      return response.data?.data || null;
    } catch {
      return null;
    }
  }

  async refreshNoiseReport(bot: 'stock' | 'forex' | 'crypto'): Promise<void> {
    const { instance, prefix } = this._getBotInstance(bot);
    await instance.post(`/api/${prefix}/noise-report/refresh`);
  }

  async getSignalTimeline(bot: 'stock' | 'forex' | 'crypto', limit = 50): Promise<Record<string, unknown>[]> {
    try {
      const { instance, prefix } = this._getBotInstance(bot);
      const response = await instance.get(`/api/${prefix}/signal-timeline`, { params: { limit } });
      return response.data?.data || [];
    } catch {
      return [];
    }
  }

  async getRegimeHeatmap(bot: 'stock' | 'forex' | 'crypto'): Promise<Record<string, unknown> | null> {
    try {
      const { instance, prefix } = this._getBotInstance(bot);
      const response = await instance.get(`/api/${prefix}/regime-heatmap`);
      return response.data?.data || null;
    } catch {
      return null;
    }
  }

  async getThresholdCurve(bot: 'stock' | 'forex' | 'crypto'): Promise<Record<string, unknown> | null> {
    try {
      const { instance, prefix } = this._getBotInstance(bot);
      const response = await instance.get(`/api/${prefix}/threshold-curve`);
      return response.data?.data || null;
    } catch {
      return null;
    }
  }

  // ── Forex Bot (port 3005) ─────────────────────────────────────────────────

  async getForexStatus(): Promise<Record<string, unknown>> {
    try {
      const response = await this.forexService.get('/api/forex/status');
      // Forex bot sends flat JSON (no {data:} wrapper)
      return response.data;
    } catch {
      return {
        isRunning: false, marketOpen: false,
        session: 'OFF_PEAK',
        positions: [], performance: { totalTrades: 0, activePositions: 0 },
        portfolioValue: 0, dailyPnL: 0,
      };
    }
  }

  async getForexPositions(): Promise<Position[]> {
    try {
      const response = await this.forexService.get('/api/forex/status');
      return (response.data?.positions as Position[]) || [];
    } catch {
      return [];
    }
  }

  async getForexAccount(): Promise<Record<string, unknown>> {
    try {
      const response = await this.forexService.get('/api/accounts/summary');
      return response.data.data;
    } catch {
      return { realAccount: { balance: 0, equity: 0 }, demoAccount: { balance: 0, equity: 0 } };
    }
  }

  async startForexTrading(): Promise<void> {
    await this.forexService.post('/api/forex/start');
  }

  async stopForexTrading(): Promise<void> {
    await this.forexService.post('/api/forex/stop');
  }

  async scanForexSignals(): Promise<Record<string, unknown>[]> {
    try {
      const response = await this.forexService.post('/api/forex/scan');
      return response.data.signals || [];
    } catch {
      return [];
    }
  }

  // ── Crypto Bot (port 3006) ────────────────────────────────────────────────

  async getCryptoStatus(): Promise<Record<string, unknown>> {
    try {
      const engineResponse = await this.cryptoService.get('/api/crypto/engine/status');
      if (engineResponse.data && engineResponse.data.credentialsRequired !== true) {
        return engineResponse.data;
      }
    } catch {
      // Fall back to the shared public engine status when JWT-scoped status
      // is unavailable or credentials have not been configured yet.
    }

    try {
      const response = await this.cryptoService.get('/api/crypto/status');
      return response.data;
    } catch {
      return {
        isRunning: false, positions: [],
        portfolioValue: 0, equity: 0,
        performance: { totalTrades: 0, activePositions: 0 },
      };
    }
  }

  // ── Per-user engine endpoints (JWT-scoped) ────────────────────────────────
  // These endpoints return the calling user's personal engine state.
  // Auth interceptor attaches the stored JWT Bearer token automatically.

  async getStockEngineStatus(): Promise<Record<string, unknown>> {
    try {
      const response = await this.tradingEngine.get('/api/trading/engine/status');
      return response.data;
    } catch {
      return { credentialsRequired: true };
    }
  }

  async startStockEngine(): Promise<Record<string, unknown>> {
    const response = await this.tradingEngine.post('/api/trading/engine/start');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to start engine');
    return response.data;
  }

  async stopStockEngine(): Promise<Record<string, unknown>> {
    const response = await this.tradingEngine.post('/api/trading/engine/stop');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to stop engine');
    return response.data;
  }

  async pauseStockEngine(): Promise<Record<string, unknown>> {
    const response = await this.tradingEngine.post('/api/trading/engine/pause');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to pause engine');
    return response.data;
  }

  async closeAllStockPositions(): Promise<Record<string, unknown>> {
    const response = await this.tradingEngine.post('/api/trading/engine/close-all');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to close positions');
    return response.data;
  }

  async getForexEngineStatus(): Promise<Record<string, unknown>> {
    try {
      const response = await this.forexService.get('/api/forex/engine/status');
      return response.data;
    } catch {
      return { credentialsRequired: true };
    }
  }

  async startForexEngine(): Promise<Record<string, unknown>> {
    const response = await this.forexService.post('/api/forex/engine/start');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to start engine');
    return response.data;
  }

  async stopForexEngine(): Promise<Record<string, unknown>> {
    const response = await this.forexService.post('/api/forex/engine/stop');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to stop engine');
    return response.data;
  }

  async pauseForexEngine(): Promise<Record<string, unknown>> {
    const response = await this.forexService.post('/api/forex/engine/pause');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to pause engine');
    return response.data;
  }

  async closeAllForexPositions(): Promise<Record<string, unknown>> {
    const response = await this.forexService.post('/api/forex/engine/close-all');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to close positions');
    return response.data;
  }

  async getCryptoEngineStatus(): Promise<Record<string, unknown>> {
    try {
      const response = await this.cryptoService.get('/api/crypto/engine/status');
      return response.data;
    } catch {
      return { credentialsRequired: true };
    }
  }

  async startCryptoEngine(): Promise<Record<string, unknown>> {
    const response = await this.cryptoService.post('/api/crypto/engine/start');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to start engine');
    return response.data;
  }

  async stopCryptoEngine(): Promise<Record<string, unknown>> {
    const response = await this.cryptoService.post('/api/crypto/engine/stop');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to stop engine');
    return response.data;
  }

  async pauseCryptoEngine(): Promise<Record<string, unknown>> {
    const response = await this.cryptoService.post('/api/crypto/engine/pause');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to pause engine');
    return response.data;
  }

  async closeAllCryptoPositions(): Promise<Record<string, unknown>> {
    const response = await this.cryptoService.post('/api/crypto/engine/close-all');
    if (response.data?.success === false) throw new Error(response.data?.error || 'Failed to close positions');
    return response.data;
  }

  // ── AI Service (port 5001 — optional) ────────────────────────────────────

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
      return { status: 'offline', healthy: false, models_loaded: 0 };
    }
  }

  // ── Market Data (port 3001 — optional) ───────────────────────────────────

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
      return { connected: false, providers: {}, totalQuotes: 0, dataQuality: 'Offline', avgLatency: 0 };
    }
  }

  // ── Service Health Checks ─────────────────────────────────────────────────

  async checkServiceHealth(serviceName: string, port: number, baseURL?: string): Promise<ServiceHealth> {
    const startTime = Date.now();
    const healthEndpoints: Record<string, string[]> = {
      'Stock Bot':   ['/health', '/api/trading/status'],
      'Forex Bot':   ['/health', '/api/forex/status'],
      'Crypto Bot':  ['/health', '/api/crypto/status'],
      'Market Data': ['/health', '/api/market/status'],
      'AI Service':  ['/health'],
    };
    const endpoints = healthEndpoints[serviceName] || ['/health'];
    const origin = baseURL || `http://localhost:${port}`;

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${origin}${endpoint}`, { timeout: 3000 });
        if (response.status === 200) {
          return { name: serviceName, status: 'online', port, latency: Date.now() - startTime, lastCheck: new Date().toISOString() };
        }
      } catch { continue; }
    }
    return { name: serviceName, status: 'offline', port, latency: Date.now() - startTime, lastCheck: new Date().toISOString() };
  }

  async getAllServicesHealth(): Promise<ServiceHealth[]> {
    const services = [
      { name: 'Stock Bot',   port: 3002, baseURL: SERVICE_URLS.stockBot,   optional: false },
      { name: 'Forex Bot',   port: 3005, baseURL: SERVICE_URLS.forexBot,   optional: false },
      { name: 'Crypto Bot',  port: 3006, baseURL: SERVICE_URLS.cryptoBot,  optional: false },
      { name: 'Market Data', port: 3001, baseURL: SERVICE_URLS.marketData, optional: true },
      { name: 'AI Service',  port: 5001, baseURL: SERVICE_URLS.aiService,  optional: true },
    ];
    // allSettled so one unreachable service doesn't reject the whole batch
    const results = await Promise.allSettled(
      services.map(s => this.checkServiceHealth(s.name, s.port, s.baseURL))
    );
    return results.map((r, i) => {
      const base = r.status === 'fulfilled'
        ? r.value
        : { name: services[i].name, status: 'offline' as const, port: services[i].port, latency: 0, lastCheck: new Date().toISOString() };
      return { ...base, optional: services[i].optional };
    });
  }

  async getAdminUsers(): Promise<Record<string, unknown>[]> {
    try {
      const response = await this.tradingEngine.get('/api/admin/users');
      return response.data.users ?? [];
    } catch {
      return [];
    }
  }

  async fixStuckTrades(params?: { symbols?: string[]; bot?: string }): Promise<{ fixed: number; trades: unknown[] }> {
    const response = await this.tradingEngine.post('/api/admin/trades/fix-stuck', params || {});
    return response.data;
  }

  // ── Agent System (Strategy Bridge) ────────────────────────────────────────

  async getAgentStats(): Promise<Record<string, unknown>> {
    try {
      const response = await this.aiService.get('/agent/stats', { timeout: 10000 });
      return response.data;
    } catch {
      return {};
    }
  }

  async getBanditStats(): Promise<Record<string, unknown>> {
    try {
      const response = await this.aiService.get('/agent/bandit/stats');
      return response.data;
    } catch {
      return {};
    }
  }

  async getBanditContextDetail(regime: string, assetClass: string, tier: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.aiService.post('/agent/bandit/context', {
        regime, asset_class: assetClass, tier,
      });
      return response.data;
    } catch {
      return {};
    }
  }

  async agentKill(reason: string): Promise<{ status: string }> {
    const response = await this.aiService.post('/agent/kill', null, { params: { reason } });
    return response.data;
  }

  async agentResume(): Promise<{ status: string }> {
    const response = await this.aiService.post('/agent/resume');
    return response.data;
  }

  async agentBackfill(limit = 500, sinceDays = 90): Promise<Record<string, unknown>> {
    const response = await this.aiService.post('/agent/backfill', {
      limit, since_days: sinceDays,
    }, { timeout: 30000 });
    return response.data;
  }

  async agentDailyTraining(): Promise<Record<string, unknown>> {
    const response = await this.aiService.post('/agent/daily-training', {}, { timeout: 30000 });
    return response.data;
  }

  async getAgentDecisions(limit = 50): Promise<{ decisions: Record<string, unknown>[]; total: number }> {
    try {
      const response = await this.aiService.get('/agent/decisions', { params: { limit }, timeout: 10000 });
      return response.data;
    } catch {
      return { decisions: [], total: 0 };
    }
  }

  async getAgentRankings(): Promise<Record<string, unknown>> {
    try {
      const response = await this.aiService.get('/agent/rankings');
      return response.data;
    } catch {
      return {};
    }
  }

  async updateAgentRankings(): Promise<Record<string, unknown>> {
    const response = await this.aiService.post('/agent/rankings/update', {}, { timeout: 15000 });
    return response.data;
  }

  async getPortfolioRisk(): Promise<Record<string, unknown>> {
    const response = await this.aiService.get('/agent/portfolio', { timeout: 10000 });
    return response.data;
  }

  // ── Public API Key Management ──────────────────────────────────────────

  private get apiSecret(): string {
    return import.meta.env.VITE_NEXUS_API_SECRET || '';
  }

  async getAPIKeys(): Promise<{ keys: Record<string, unknown>[]; total: number }> {
    if (!this.apiSecret) return { keys: [], total: 0 };
    try {
      const user = safeParseUser();
      const userId = user.id || 1;
      const response = await this.aiService.get('/api/v1/keys', {
        params: { user_id: userId },
        headers: { 'X-API-Secret': this.apiSecret },
        timeout: 10000,
      });
      return response.data;
    } catch {
      return { keys: [], total: 0 };
    }
  }

  async createAPIKey(name: string, tier: string): Promise<Record<string, unknown>> {
    const user = safeParseUser();
    const userId = user.id || 1;
    const response = await this.aiService.post('/api/v1/keys',
      { user_id: userId, name, tier },
      { headers: { 'X-API-Secret': this.apiSecret }, timeout: 10000 },
    );
    return response.data;
  }

  async revokeAPIKey(keyId: number): Promise<Record<string, unknown>> {
    const user = safeParseUser();
    const userId = user.id || 1;
    const response = await this.aiService.delete(`/api/v1/keys/${keyId}`, {
      params: { user_id: userId },
      headers: { 'X-API-Secret': this.apiSecret },
    });
    return response.data;
  }

  async getAPIUsage(): Promise<Record<string, unknown>> {
    if (!this.apiSecret) {
      return { calls_today: 0, calls_month: 0, monthly_limit: 100, active_keys: 0 };
    }
    try {
      const user = safeParseUser();
      const userId = user.id || 1;
      const response = await this.aiService.get('/api/v1/usage', {
        params: { user_id: userId },
        headers: { 'X-API-Secret': this.apiSecret },
        timeout: 10000,
      });
      return response.data;
    } catch {
      return { calls_today: 0, calls_month: 0, monthly_limit: 100, active_keys: 0 };
    }
  }

  // ── Stripe Billing ──────────────────────────────────────────────────

  async createCheckout(tier: 'pro' | 'enterprise'): Promise<{ checkout_url: string; session_id: string }> {
    const user = safeParseUser();
    const userId = user.id || 1;
    const response = await this.aiService.post('/api/v1/billing/checkout',
      { user_id: userId, tier, email: user.email },
      { headers: { 'X-API-Secret': this.apiSecret }, timeout: 15000 },
    );
    return response.data;
  }

  async createBillingPortal(): Promise<{ portal_url: string }> {
    const user = safeParseUser();
    const userId = user.id || 1;
    const response = await this.aiService.post('/api/v1/billing/portal',
      { user_id: userId },
      { headers: { 'X-API-Secret': this.apiSecret }, timeout: 15000 },
    );
    return response.data;
  }
}

export const apiClient = new APIClient();
