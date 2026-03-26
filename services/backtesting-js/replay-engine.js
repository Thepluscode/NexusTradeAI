const signals = require('../signals');
const { TradeSimulator } = require('./trade-simulator');

const WARMUP_REQUIREMENTS = {
  momentum: 1, orderFlow: 1, displacement: 5,
  volumeProfile: 50, fvg: 3, volumeRatio: 20,
  trend: 25, macd: 35, mtfConfluence: 25,
  regimeDetector: 14, stopManager: 14
};

class ReplayEngine {
  constructor(config = {}) {
    this.bot = config.bot || 'crypto';
    this.threshold = config.threshold ?? 0.45;
    this.warmupPeriod = config.warmupPeriod ?? Math.max(...Object.values(WARMUP_REQUIREMENTS));
    this.botConfig = config.botConfig || signals.BOT_COMPONENTS[this.bot];
    this.weights = config.weights || this.botConfig.weights;
    this.maxPositions = config.maxPositions || 5;
  }

  latestCompleted(htfBars, currentTime) {
    if (!htfBars || htfBars.length === 0) return [];
    const t = new Date(currentTime).getTime();
    let idx = -1;
    for (let i = htfBars.length - 1; i >= 0; i--) {
      if (new Date(htfBars[i].time).getTime() <= t) { idx = i; break; }
    }
    if (idx < 0) return [];
    return htfBars.slice(0, idx + 1);
  }

  replay(data) {
    const { m5, m15 = [], h1 = [], h4 = [] } = data;
    if (!m5 || m5.length < this.warmupPeriod + 1) {
      return { trades: [], signals: [], summary: this._emptySummary() };
    }

    const simulator = new TradeSimulator(this.bot);
    const allTrades = [];
    const allSignals = [];

    for (let i = this.warmupPeriod; i < m5.length - 1; i++) {
      const window = m5.slice(Math.max(0, i - this.warmupPeriod), i + 1);
      const currentBar = m5[i];
      const nextBar = m5[i + 1];

      const closed = simulator.checkExits(currentBar);
      allTrades.push(...closed);

      const regime = signals.detectRegime(window);
      const atr = signals.computeATR(window, 14);
      const price = currentBar.close;

      const mtfM15 = this.latestCompleted(m15, currentBar.time);
      const mtfH1 = this.latestCompleted(h1, currentBar.time);
      const mtfH4 = this.latestCompleted(h4, currentBar.time);

      const recentClose = currentBar.close;
      const prevClose = window.length >= 2 ? window[window.length - 2].close : recentClose;
      const direction = recentClose >= prevClose ? 'long' : 'short';
      const signalScores = this._computeSignals(window, atr, price, direction, mtfM15, mtfH1, mtfH4);
      const config = { ...this.botConfig, weights: this.weights };
      const committee = signals.computeCommitteeScore(signalScores, config, regime.regime);

      const snapshot = {
        time: currentBar.time, symbol: data.symbol || 'UNKNOWN',
        committeeScore: committee.confidence,
        components: committee.components,
        regime: regime.regime
      };
      allSignals.push(snapshot);

      const costs = signals.getRoundTripCost(this.bot, price);
      const entry = signals.qualifyEntry(committee, { threshold: this.threshold }, costs);

      if (entry.qualified && simulator.positions.size < this.maxPositions && !simulator.positions.has(snapshot.symbol)) {
        const stops = signals.computeStops(window, regime.regime, direction, nextBar.open);
        simulator.openPosition(
          snapshot.symbol, direction, nextBar.open,
          stops.stopLoss, stops.profitTarget,
          stops.trailingActivation, stops.trailingDistance,
          snapshot
        );
      }
    }

    // Close remaining positions at last bar
    const lastBar = m5[m5.length - 1];
    for (const [symbol, pos] of simulator.positions) {
      const costs = signals.getRoundTripCost(this.bot, pos.entryPrice);
      const grossPnlPct = pos.direction === 'long'
        ? ((lastBar.close - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - lastBar.close) / pos.entryPrice) * 100;
      allTrades.push({
        symbol, direction: pos.direction,
        entryTime: pos.entryTime, exitTime: lastBar.time,
        entryPrice: pos.entryPrice, exitPrice: lastBar.close,
        grossPnlPct, costsPct: costs.costPct,
        netPnlPct: grossPnlPct - costs.costPct,
        exitReason: 'endOfData',
        ...pos.signalSnapshot
      });
    }

    return { trades: allTrades, signals: allSignals, summary: this._computeSummary(allTrades) };
  }

  _computeSignals(window, atr, price, direction, mtfM15, mtfH1, mtfH4) {
    const nd = this.botConfig.neutralDefaults || {};
    const result = {};

    for (const comp of this.botConfig.components) {
      switch (comp) {
        case 'momentum': {
          const change = window.length >= 2
            ? ((window[window.length-1].close - window[window.length-2].close) / window[window.length-2].close) * 100
            : 0;
          result[comp] = signals.computeMomentum({ momentum: change });
          break;
        }
        case 'orderFlow':
          result[comp] = signals.computeOrderFlow(window);
          break;
        case 'displacement':
          result[comp] = signals.computeDisplacement(window, atr, 3, { neutralDefault: nd.displacement ?? 0.3 });
          break;
        case 'volumeProfile':
          result[comp] = signals.computeVolumeProfile(window, { currentPrice: price, direction });
          break;
        case 'fvg':
          result[comp] = signals.computeFVG(window, { neutralDefault: nd.fvg ?? 0.3 });
          break;
        case 'volumeRatio':
          result[comp] = signals.computeVolumeRatio(window);
          break;
        case 'trend':
          result[comp] = signals.computeTrend(window, direction);
          break;
        case 'macd':
          result[comp] = signals.computeMACD(window, direction);
          break;
        case 'mtfConfluence':
          result[comp] = signals.computeMTFScore(null, mtfM15, mtfH1, mtfH4, direction);
          break;
        default:
          result[comp] = { score: 0.5 };
      }
    }
    return result;
  }

  _computeSummary(trades) {
    if (trades.length === 0) return this._emptySummary();
    const wins = trades.filter(t => t.netPnlPct > 0);
    const losses = trades.filter(t => t.netPnlPct <= 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.netPnlPct, 0) / losses.length) : 0;
    const grossWins = wins.reduce((s, t) => s + t.netPnlPct, 0);
    const grossLosses = Math.abs(losses.reduce((s, t) => s + t.netPnlPct, 0));

    let peak = 0, maxDD = 0, cumPnl = 0;
    for (const t of trades) {
      cumPnl += t.netPnlPct;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDD) maxDD = dd;
    }

    const returns = trades.map(t => t.netPnlPct);
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

    return {
      totalTrades: trades.length,
      winRate: wins.length / trades.length,
      profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0,
      sharpe: Math.round(sharpe * 100) / 100,
      maxDrawdown: -Math.round(maxDD * 100) / 100,
      netPnl: Math.round(cumPnl * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100
    };
  }

  _emptySummary() {
    return { totalTrades: 0, winRate: 0, profitFactor: 0, sharpe: 0, maxDrawdown: 0, netPnl: 0, avgWin: 0, avgLoss: 0 };
  }
}

module.exports = { ReplayEngine, WARMUP_REQUIREMENTS };
