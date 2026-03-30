/**
 * Signal Analytics — self-contained module for Railway deploy.
 * Inlines the Analytics class + createSignalEndpoints so they work
 * without services/signals/ or services/backtesting-js/ being available.
 */

// ── Analytics class (Spearman IC, regime heatmap, noise report) ──────────────

class Analytics {
  computeIC(trades, componentName) {
    const pairs = trades
      .filter(t => t.components && t.components[componentName] !== undefined)
      .map(t => ({ score: t.components[componentName], pnl: t.netPnlPct }));
    const n = pairs.length;
    if (n < 10) return { ic: 0, pValue: 1, significant: false, classification: 'insufficient_data', n, ci95: [0, 0] };

    const ic = this._spearman(pairs.map(p => p.score), pairs.map(p => p.pnl));
    const tStat = ic * Math.sqrt((n - 2) / (1 - ic * ic + 1e-10));
    const pValue = this._tTestPValue(tStat, n - 2);
    const ci95 = this._fisherCI(ic, n);

    let classification = 'insufficient_data';
    if (n >= 100) {
      if (ic > 0.03 && ci95[0] > 0 && pValue < 0.05) classification = 'signal';
      else if (ic > 0.02 && pValue < 0.10) classification = 'weak';
      else if (ic < -0.03 && ci95[1] < 0 && pValue < 0.05) classification = 'contrarian';
      else classification = 'noise';
    } else if (n >= 30) {
      if (ic > 0.05 && pValue < 0.05) classification = 'signal';
      else if (Math.abs(ic) < 0.02) classification = 'noise';
      else classification = 'weak';
    }
    return { ic: Math.round(ic * 1000) / 1000, pValue: Math.round(pValue * 1000) / 1000, significant: pValue < 0.05, classification, n, ci95 };
  }

  correlationMatrix(trades) {
    const components = Object.keys(trades[0]?.components || {});
    const n = components.length;
    const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
    const redundantPairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        if (i === j) { matrix[i][j] = 1; continue; }
        const a = trades.map(t => t.components[components[i]] || 0);
        const b = trades.map(t => t.components[components[j]] || 0);
        const r = this._spearman(a, b);
        matrix[i][j] = r; matrix[j][i] = r;
        if (Math.abs(r) > 0.6) {
          const icA = this.computeIC(trades, components[i]);
          const icB = this.computeIC(trades, components[j]);
          const keep = Math.abs(icA.ic) >= Math.abs(icB.ic) ? components[i] : components[j];
          const drop = keep === components[i] ? components[j] : components[i];
          redundantPairs.push({ a: components[i], b: components[j], r: Math.round(r * 1000) / 1000, recommendation: `Keep ${keep} (higher IC), reduce ${drop} weight` });
        }
      }
    }
    return { matrix, components, redundantPairs };
  }

  regimeConditionalIC(trades) {
    const components = Object.keys(trades[0]?.components || {});
    const regimes = ['trending', 'ranging', 'volatile'];
    const matrix = {};
    const recommendations = [];
    for (const comp of components) {
      matrix[comp] = {};
      const results = [];
      for (const regime of regimes) {
        const regimeTrades = trades.filter(t => t.regime === regime);
        if (regimeTrades.length < 30) {
          matrix[comp][regime] = { ic: 0, pValue: 1, n: regimeTrades.length, classification: 'insufficient_data' };
        } else {
          matrix[comp][regime] = this.computeIC(regimeTrades, comp);
        }
        results.push({ regime, ...matrix[comp][regime] });
      }
      const sig = results.filter(r => r.classification === 'signal');
      const noise = results.filter(r => r.classification === 'noise');
      if (sig.length > 0 && noise.length > 0) {
        recommendations.push(`${comp} is signal in ${sig.map(s => s.regime).join('/')} but noise in ${noise.map(s => s.regime).join('/')}`);
      }
    }
    return { matrix, recommendations };
  }

  estimateDecay(trades, componentName, windowSize = 50) {
    if (trades.length < windowSize * 2) return { windows: [], halfLife: null, stable: null, recommendation: 'insufficient data' };
    const step = Math.floor(windowSize / 2);
    const windows = [];
    for (let start = 0; start + windowSize <= trades.length; start += step) {
      const slice = trades.slice(start, start + windowSize);
      const ic = this.computeIC(slice, componentName);
      windows.push({ startIdx: start, endIdx: start + windowSize, ic: ic.ic, pValue: ic.pValue, n: ic.n });
    }
    if (windows.length < 3) return { windows, halfLife: null, stable: null, recommendation: 'insufficient data' };
    const ics = windows.map(w => w.ic);
    const variance = this._variance(ics);
    const stable = variance < 0.02;
    const slope = this._linearSlope(ics);
    const halfLife = (slope < -0.001 && ics[0] > 0) ? Math.round((-ics[0] / (2 * slope)) * (windowSize / step)) : null;
    const recommendation = stable ? 'stable, 90-day lookback is fine' : halfLife ? `decaying (half-life ~${halfLife} trades), use shorter lookback` : 'unstable but no clear decay trend';
    return { windows, halfLife, stable, recommendation };
  }

  generateNoiseReport(trades, componentNames) {
    const rankings = componentNames.map(name => {
      const ic = this.computeIC(trades, name);
      return { name, ...ic };
    }).sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));

    const corr = this.correlationMatrix(trades);
    const regimeMatrix = this.regimeConditionalIC(trades);
    const decayEstimates = {};
    for (const name of componentNames) decayEstimates[name] = this.estimateDecay(trades, name);

    const recommendations = [];
    for (const r of rankings) {
      if (r.classification === 'noise') recommendations.push(`KILL: ${r.name} (IC=${r.ic}, p=${r.pValue}) — noise`);
      else if (r.classification === 'contrarian') recommendations.push(`FLIP OR KILL: ${r.name} (IC=${r.ic}) — contrarian signal`);
    }
    for (const p of corr.redundantPairs) recommendations.push(`MERGE: ${p.a} + ${p.b} (r=${p.r}) — ${p.recommendation}`);
    for (const rec of regimeMatrix.recommendations) recommendations.push(`REGIME GATE: ${rec}`);
    for (const [name, decay] of Object.entries(decayEstimates)) {
      if (decay.halfLife && decay.halfLife < 100) recommendations.push(`SHORTEN LOOKBACK: ${name} half-life ~${decay.halfLife} trades`);
    }

    const warnings = [];
    if (trades.length < 100) warnings.push(`LOW TRADE COUNT: Only ${trades.length} trades. Results may not be reliable.`);
    if (rankings.every(r => r.classification !== 'signal')) warnings.push('ALL COMPONENTS WEAK: No component shows strong IC. Review data quality or signal logic.');

    const timestamps = trades.map(t => t.timestamp || t.entryTime).filter(Boolean).sort();
    const dateRange = timestamps.length > 0 ? { from: timestamps[0], to: timestamps[timestamps.length - 1] } : { from: null, to: null };

    return { bot: trades[0]?.bot || 'unknown', tradeCount: trades.length, dateRange, optimalThreshold: null, componentRankings: rankings, redundantPairs: corr.redundantPairs, regimeMatrix: regimeMatrix.matrix, decayEstimates, recommendations, warnings };
  }

  // ── Statistical helpers ──

  _spearman(x, y) { return this._pearson(this._rank(x), this._rank(y)); }

  _rank(arr) {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
      const avgRank = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
      i = j;
    }
    return ranks;
  }

  _pearson(x, y) {
    const n = x.length;
    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  }

  _tTestPValue(t, df) { return this._incompleteBeta(df / 2, 0.5, df / (df + t * t)); }

  _incompleteBeta(a, b, x) {
    if (x <= 0) return 1; if (x >= 1) return 0;
    const bt = Math.exp(this._lnGamma(a + b) - this._lnGamma(a) - this._lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * this._betaCF(a, b, x) / a;
    return 1 - bt * this._betaCF(b, a, 1 - x) / b;
  }

  _betaCF(a, b, x) {
    const maxIter = 100;
    let qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d; let h = d;
    for (let m = 1; m <= maxIter; m++) {
      let m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-7) break;
    }
    return h;
  }

  _lnGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  _fisherCI(r, n) {
    const z = 0.5 * Math.log((1 + r) / (1 - r + 1e-10));
    const se = 1 / Math.sqrt(Math.max(n - 3, 1));
    const zLow = z - 1.96 * se, zHigh = z + 1.96 * se;
    return [
      Math.round(((Math.exp(2 * zLow) - 1) / (Math.exp(2 * zLow) + 1)) * 1000) / 1000,
      Math.round(((Math.exp(2 * zHigh) - 1) / (Math.exp(2 * zHigh) + 1)) * 1000) / 1000
    ];
  }

  _variance(arr) { const m = arr.reduce((s, v) => s + v, 0) / arr.length; return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length; }

  _linearSlope(arr) {
    const n = arr.length, mx = (n - 1) / 2, my = arr.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - mx) * (arr[i] - my); den += (i - mx) ** 2; }
    return den > 0 ? num / den : 0;
  }
}

// ── Endpoint factory ─────────────────────────────────────────────────────────

const analytics = new Analytics();
const reportCache = new Map();

function createSignalEndpoints(app, routePrefix, bot, getEvaluations, getBotComponents) {
  // GET /api/{prefix}/noise-report
  app.get(`/api/${routePrefix}/noise-report`, (req, res) => {
    try {
      const cached = reportCache.get(bot);
      if (cached && Date.now() - cached.timestamp < 4 * 3600000) {
        return res.json({ success: true, data: cached.report });
      }
      const evaluations = getEvaluations();
      const components = getBotComponents();
      if (!evaluations || evaluations.length < 10) {
        return res.json({ success: true, data: null, message: 'Insufficient trade data for analysis' });
      }
      const trades = evaluations.map(ev => ({
        netPnlPct: (ev.pnlPct || ev.pnl || 0) * 100,
        components: ev.signals?.components || {},
        regime: ev.signals?.regime || ev.regime || 'trending',
        committeeScore: ev.signals?.committeeConfidence || ev.committeeScore || 0.5,
        bot
      }));
      const report = analytics.generateNoiseReport(trades, components);
      reportCache.set(bot, { report, timestamp: Date.now() });
      res.json({ success: true, data: report });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/{prefix}/noise-report/refresh
  app.post(`/api/${routePrefix}/noise-report/refresh`, (req, res) => {
    reportCache.delete(bot);
    res.json({ success: true, message: 'Cache cleared, next GET will regenerate' });
  });

  // GET /api/{prefix}/signal-timeline
  app.get(`/api/${routePrefix}/signal-timeline`, (req, res) => {
    try {
      const evaluations = getEvaluations();
      const limit = parseInt(req.query.limit) || 50;
      const timeline = evaluations.slice(-limit).reverse().map(ev => ({
        time: ev.timestamp || ev.entryTime,
        symbol: ev.symbol,
        direction: ev.direction,
        pnl: ev.pnl,
        pnlPct: ev.pnlPct,
        committeeScore: ev.signals?.committeeConfidence || 0,
        components: ev.signals?.components || {},
        regime: ev.signals?.regime || ev.regime || 'unknown',
        exitReason: ev.exitReason || 'unknown'
      }));
      res.json({ success: true, data: timeline });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/{prefix}/regime-heatmap
  app.get(`/api/${routePrefix}/regime-heatmap`, (req, res) => {
    try {
      const evaluations = getEvaluations();
      if (!evaluations || evaluations.length < 30) {
        return res.json({ success: true, data: null, message: 'Insufficient data' });
      }
      const trades = evaluations.map(ev => ({
        netPnlPct: (ev.pnlPct || ev.pnl || 0) * 100,
        components: ev.signals?.components || {},
        regime: ev.signals?.regime || ev.regime || 'trending'
      }));
      const result = analytics.regimeConditionalIC(trades);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/{prefix}/threshold-curve
  app.get(`/api/${routePrefix}/threshold-curve`, (req, res) => {
    try {
      const evaluations = getEvaluations();
      if (!evaluations || evaluations.length < 20) {
        return res.json({ success: true, data: null, message: 'Insufficient data for threshold sweep (need 20+ trades)' });
      }
      // Run a live threshold sweep over the evaluation data
      const thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80];
      const results = [];
      for (const threshold of thresholds) {
        const filtered = evaluations.filter(ev => (ev.signals?.committeeConfidence || 0) >= threshold);
        if (filtered.length < 5) continue;
        const wins = filtered.filter(e => (e.pnl || 0) > 0);
        const losses = filtered.filter(e => (e.pnl || 0) <= 0);
        const totalWin = wins.reduce((s, e) => s + Math.abs(e.pnl || 0), 0);
        const totalLoss = losses.reduce((s, e) => s + Math.abs(e.pnl || 0), 0);
        const pnls = filtered.map(e => e.pnlPct || 0);
        const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
        const std = Math.sqrt(pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length) || 1;
        results.push({
          threshold,
          totalTrades: filtered.length,
          winRate: parseFloat((wins.length / filtered.length).toFixed(3)),
          profitFactor: totalLoss > 0 ? parseFloat((totalWin / totalLoss).toFixed(2)) : totalWin > 0 ? 10 : 0,
          sharpe: parseFloat((mean / std * Math.sqrt(252)).toFixed(2)),
          netPnl: parseFloat((totalWin - totalLoss).toFixed(2))
        });
      }
      const optimal = results.reduce((best, r) => (!best || r.profitFactor > best.profitFactor) ? r.threshold : best, null);
      res.json({ success: true, data: { results, optimal } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { Analytics, createSignalEndpoints };
