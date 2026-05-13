import axios from 'axios';
import { SERVICE_URLS } from '@/services/api';
import type { BotKey, EdgeAttributionRow, EdgeStatus, AlertItem, TradeItem } from './types';

export interface BotStatus {
  key: BotKey;
  name: string;
  online: boolean;
  isRunning: boolean;
  mode: string;
  equity: number;
  positions: number;
  dailyPnL: number;
  totalTrades: number;
  winRate: number;
}

interface BotEndpoint {
  key: BotKey;
  name: string;
  baseURL: string;
  statusPath: string;
}

const BOT_ENDPOINTS: BotEndpoint[] = [
  { key: 'stock', name: 'Stock', baseURL: SERVICE_URLS.stockBot, statusPath: '/api/trading/status' },
  { key: 'forex', name: 'Forex', baseURL: SERVICE_URLS.forexBot, statusPath: '/api/forex/status' },
  { key: 'crypto', name: 'Crypto', baseURL: SERVICE_URLS.cryptoBot, statusPath: '/api/crypto/status' },
];

async function fetchOneBotStatus(endpoint: BotEndpoint): Promise<BotStatus> {
  try {
    const res = await axios.get(`${endpoint.baseURL}${endpoint.statusPath}`, { timeout: 3000 });
    const d = res.data?.data || res.data;
    const isRunning = d?.isRunning ?? false;
    const equity = d?.account?.equity ?? d?.equity ?? d?.portfolioValue ?? d?.performance?.equity ?? 0;
    const positions =
      d?.performance?.activePositions ??
      d?.positions?.length ??
      (Array.isArray(d?.positions) ? d.positions.length : 0);
    const dailyPnLFromReturn = (() => {
      const r = d?.dailyReturn;
      if (r == null || !equity) return null;
      const ratio = typeof r === 'number' && Math.abs(r) > 1 ? r / 100 : r;
      return ratio * equity;
    })();
    const dailyPnL = d?.dailyPnL ?? d?.performance?.dailyPnL ?? dailyPnLFromReturn ?? d?.stats?.totalPnL ?? 0;
    const totalTrades = d?.performance?.totalTrades ?? d?.stats?.totalTrades ?? d?.totalTrades ?? 0;
    const rawWinRate = d?.performance?.winRate ?? d?.stats?.winRate ?? d?.winRate ?? 0;
    const winRate = typeof rawWinRate === 'string' ? parseFloat(rawWinRate) : rawWinRate;
    const mode = d?.mode ?? d?.tradingMode ?? (isRunning ? 'PAPER' : 'STOPPED');
    return { key: endpoint.key, name: endpoint.name, online: true, isRunning, mode, equity, positions, dailyPnL, totalTrades, winRate };
  } catch {
    return { key: endpoint.key, name: endpoint.name, online: false, isRunning: false, mode: 'OFFLINE', equity: 0, positions: 0, dailyPnL: 0, totalTrades: 0, winRate: 0 };
  }
}

export async function fetchAllBotStatuses(): Promise<BotStatus[]> {
  return Promise.all(BOT_ENDPOINTS.map(fetchOneBotStatus));
}

interface EdgeAttributionResponse {
  success: boolean;
  window_days: number;
  min_n: number;
  data: EdgeAttributionRow[];
}

export async function fetchEdgeAttribution(window = 30, minN = 10): Promise<EdgeAttributionRow[]> {
  const res = await axios.get<EdgeAttributionResponse>(
    `${SERVICE_URLS.forexBot}/api/edge-attribution`,
    { params: { window, minN }, timeout: 8000 },
  );
  if (!res.data?.success || !Array.isArray(res.data.data)) return [];
  return res.data.data;
}

export interface KillSwitchRow {
  bot: string;
  strategy: string;
  reason: string;
  killed_at?: string;
  status?: EdgeStatus;
}

interface KillSwitchResponse {
  success: boolean;
  mode: string;
  data: KillSwitchRow[];
  count: number;
}

export async function fetchKillSwitchRows(): Promise<KillSwitchRow[]> {
  try {
    const res = await axios.get<KillSwitchResponse>(`${SERVICE_URLS.forexBot}/api/kill-switches`, {
      timeout: 4000,
    });
    if (!res.data?.success || !Array.isArray(res.data.data)) return [];
    return res.data.data;
  } catch {
    return [];
  }
}

interface IntradayEquityResponse {
  success: boolean;
  hours: number;
  generated_at: string;
  data: Partial<Record<BotKey, number[]>>;
}

export async function fetchIntradayEquity(hours = 24): Promise<Record<BotKey, number[]>> {
  const empty: Record<BotKey, number[]> = { stock: [], forex: [], crypto: [] };
  try {
    const res = await axios.get<IntradayEquityResponse>(
      `${SERVICE_URLS.forexBot}/api/intraday-equity`,
      { params: { hours }, timeout: 6000 },
    );
    if (!res.data?.success || !res.data.data) return empty;
    return {
      stock: res.data.data.stock ?? [],
      forex: res.data.data.forex ?? [],
      crypto: res.data.data.crypto ?? [],
    };
  } catch {
    return empty;
  }
}

interface RecentTradesResponse {
  success: boolean;
  count: number;
  data: TradeItem[];
}

export async function fetchRecentTrades(limit = 20): Promise<TradeItem[]> {
  try {
    const res = await axios.get<RecentTradesResponse>(
      `${SERVICE_URLS.forexBot}/api/recent-trades`,
      { params: { limit }, timeout: 6000 },
    );
    if (!res.data?.success || !Array.isArray(res.data.data)) return [];
    return res.data.data;
  } catch {
    return [];
  }
}

export async function fetchKillSwitchAlerts(): Promise<AlertItem[]> {
  try {
    const res = await axios.get<KillSwitchResponse>(`${SERVICE_URLS.forexBot}/api/kill-switches`, {
      timeout: 4000,
    });
    if (!res.data?.success || !Array.isArray(res.data.data)) return [];
    return res.data.data.map((row, idx) => ({
      id: `ks-${idx}-${row.bot}-${row.strategy}`,
      severity: 'warning' as const,
      message: `${row.bot}/${row.strategy} killed — ${row.reason}`,
      timestamp: row.killed_at || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}
