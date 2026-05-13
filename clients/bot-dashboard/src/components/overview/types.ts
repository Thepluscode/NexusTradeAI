export type BotKey = 'stock' | 'forex' | 'crypto';

export interface BotData {
  key: BotKey;
  name: string;
  online: boolean;
  isRunning: boolean;
  mode: 'LIVE' | 'PAPER';
  dailyPnL: number;
  intradayEquity?: number[];
}

export type EdgeStatus = 'positive' | 'inconclusive' | 'low_n' | 'negative';

export interface EdgeAttributionRow {
  bot: string;
  strategy: string;
  n: number;
  win_rate_pct: number;
  total_pnl_usd: number;
  pnl_pct_ci_low: number;
  pnl_pct_ci_high: number;
  status: EdgeStatus;
  /** ISO timestamp of the most recent closed trade in this bucket. */
  most_recent_trade?: string;
}

export type AlertSeverity = 'info' | 'warning' | 'error';

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
}

export type TradeSide = 'LONG' | 'SHORT';

export interface TradeItem {
  id: string;
  symbol: string;
  bot: BotKey;
  side: TradeSide;
  pnl_usd: number;
  pnl_pct: number;
  exit_reason: string;
  closed_at: string;
}
