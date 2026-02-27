import axios, { AxiosInstance } from 'axios';
import type {
  TradingEngineStatus,
  AIServiceHealth,
  MarketDataStatus,
  Position,
  AutomationStatus,
  ServiceHealth,
  AlpacaPosition,
} from '@/types';

// ── Active service ports ────────────────────────────────────────────────────
//   3002  Stock Bot (unified-trading-bot.js)
//   3005  Forex Bot (unified-forex-bot.js)
//   3006  Crypto Bot (unified-crypto-bot.js)
//   3001  Market Data (optional, may not be running)
//   5001  AI Service  (optional, may not be running)

class APIClient {
  private tradingEngine: AxiosInstance;  // port 3002
  private forexService: AxiosInstance;   // port 3005
  private cryptoService: AxiosInstance;  // port 3006
  private marketData: AxiosInstance;     // port 3001 (optional)
  private aiService: AxiosInstance;      // port 5001 (optional)

  constructor() {
    this.tradingEngine = axios.create({ baseURL: 'http://localhost:3002', timeout: 10000 });
    this.forexService  = axios.create({ baseURL: 'http://localhost:3005', timeout: 10000 });
    this.cryptoService = axios.create({ baseURL: 'http://localhost:3006', timeout: 10000 });
    this.marketData    = axios.create({ baseURL: 'http://localhost:3001', timeout: 5000 });
    this.aiService     = axios.create({ baseURL: 'http://localhost:5001', timeout: 5000 });
  }

  // ── Stock Bot (port 3002) ─────────────────────────────────────────────────

  async getTradingEngineStatus(): Promise<TradingEngineStatus> {
    const response = await this.tradingEngine.get('/api/trading/status');
    // Stock bot sends a flat response (no {data:} wrapper)
    return response.data.data || response.data;
  }

  async getActivePositions(): Promise<Position[]> {
    const response = await this.tradingEngine.get('/api/trading/status');
    // Stock bot sends positions at top level, not nested under data
    const payload = response.data.data || response.data;
    return payload?.positions || [];
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
    return response.data.data;
  }

  async resetDemoAccount() {
    const response = await this.tradingEngine.post('/api/accounts/demo/reset');
    return response.data.data;
  }

  async getBotConfig(): Promise<any> {
    try {
      const response = await this.tradingEngine.get('/api/config');
      return response.data.data;
    } catch {
      return null;
    }
  }

  async getBacktestReport(): Promise<any> {
    try {
      const response = await this.tradingEngine.get('/api/backtest/report');
      return response.data.data;
    } catch {
      return null;
    }
  }

  // Automation — proxied through the real trading start/stop endpoints
  async getAutomationStatus(): Promise<AutomationStatus> {
    try {
      const response = await this.tradingEngine.get('/api/trading/status');
      // Stock bot sends flat response — no {data:} wrapper
      const data = response.data.data || response.data;
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
    await this.tradingEngine.post('/api/config/mode', { mode: 'live' });
    return { realTradingEnabled: true, confirmation: 'Switched to live trading' };
  }

  async disableRealTrading(): Promise<{ realTradingEnabled: boolean; confirmation: string }> {
    await this.tradingEngine.post('/api/config/mode', { mode: 'paper' });
    return { realTradingEnabled: false, confirmation: 'Switched to paper trading' };
  }

  // Alpaca positions — same bot, different endpoints
  async getAlpacaPositions(): Promise<AlpacaPosition[]> {
    const response = await this.tradingEngine.get('/api/positions');
    return response.data.positions || [];
  }

  // ── Forex Bot (port 3005) ─────────────────────────────────────────────────

  async getForexStatus(): Promise<any> {
    try {
      const response = await this.forexService.get('/api/forex/status');
      // Forex bot sends flat JSON (no {data:} wrapper), handle both shapes
      return response.data.data || response.data;
    } catch {
      return {
        isRunning: false, marketOpen: false,
        session: 'OFF_PEAK',
        positions: [], performance: { totalTrades: 0, activePositions: 0 },
        portfolioValue: 0, dailyPnL: 0,
      };
    }
  }

  async getForexPositions(): Promise<any[]> {
    try {
      const response = await this.forexService.get('/api/forex/status');
      const data = response.data.data || response.data;
      return data?.positions || [];
    } catch {
      return [];
    }
  }

  async getForexAccount(): Promise<any> {
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

  async scanForexSignals(): Promise<any[]> {
    const response = await this.forexService.post('/api/forex/scan');
    return response.data.signals || [];
  }

  // ── Crypto Bot (port 3006) ────────────────────────────────────────────────

  async getCryptoStatus(): Promise<any> {
    try {
      const response = await this.cryptoService.get('/api/crypto/status');
      return response.data.data || response.data;
    } catch {
      return {
        isRunning: false, positions: [],
        portfolioValue: 0, equity: 0,
        performance: { totalTrades: 0, activePositions: 0 },
      };
    }
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

  async checkServiceHealth(serviceName: string, port: number): Promise<ServiceHealth> {
    const startTime = Date.now();
    const healthEndpoints: Record<string, string[]> = {
      'Stock Bot':   ['/health', '/api/trading/status'],
      'Forex Bot':   ['/health', '/api/forex/status'],
      'Crypto Bot':  ['/health', '/api/crypto/status'],
      'Market Data': ['/health', '/api/market/status'],
      'AI Service':  ['/health'],
    };
    const endpoints = healthEndpoints[serviceName] || ['/health'];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`http://localhost:${port}${endpoint}`, { timeout: 3000 });
        if (response.status === 200) {
          return { name: serviceName, status: 'online', port, latency: Date.now() - startTime, lastCheck: new Date().toISOString() };
        }
      } catch { continue; }
    }
    return { name: serviceName, status: 'offline', port, latency: Date.now() - startTime, lastCheck: new Date().toISOString() };
  }

  async getAllServicesHealth(): Promise<ServiceHealth[]> {
    const services = [
      { name: 'Stock Bot',   port: 3002 },
      { name: 'Forex Bot',   port: 3005 },
      { name: 'Crypto Bot',  port: 3006 },
      { name: 'Market Data', port: 3001 },
      { name: 'AI Service',  port: 5001 },
    ];
    // allSettled so one unreachable service doesn't reject the whole batch
    const results = await Promise.allSettled(
      services.map(s => this.checkServiceHealth(s.name, s.port))
    );
    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { name: services[i].name, status: 'offline' as const, port: services[i].port, latency: 0, lastCheck: new Date().toISOString() }
    );
  }
}

export const apiClient = new APIClient();
