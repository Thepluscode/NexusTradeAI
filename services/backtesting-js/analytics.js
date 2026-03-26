class Analytics {
  /**
   * Spearman rank correlation between component scores and P&L.
   */
  computeIC(trades, componentName) {
    const pairs = trades
      .filter(t => t.components && t.components[componentName] !== undefined)
      .map(t => ({ score: t.components[componentName], pnl: t.netPnlPct }));

    const n = pairs.length;
    if (n < 10) {
      return { ic: 0, pValue: 1, significant: false, classification: 'insufficient_data', n, ci95: [0, 0] };
    }

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
        matrix[i][j] = r;
        matrix[j][i] = r;

        if (Math.abs(r) > 0.6) {
          const icA = this.computeIC(trades, components[i]);
          const icB = this.computeIC(trades, components[j]);
          const keep = Math.abs(icA.ic) >= Math.abs(icB.ic) ? components[i] : components[j];
          const drop = keep === components[i] ? components[j] : components[i];
          redundantPairs.push({
            a: components[i], b: components[j],
            r: Math.round(r * 1000) / 1000,
            recommendation: `Keep ${keep} (higher IC), reduce ${drop} weight`
          });
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
        recommendations.push(
          `${comp} is signal in ${sig.map(s=>s.regime).join('/')} but noise in ${noise.map(s=>s.regime).join('/')}`
        );
      }
    }

    return { matrix, recommendations };
  }

  estimateDecay(trades, componentName, windowSize = 50) {
    if (trades.length < windowSize * 2) {
      return { windows: [], halfLife: null, stable: null, recommendation: 'insufficient data' };
    }

    const step = Math.floor(windowSize / 2);
    const windows = [];
    for (let start = 0; start + windowSize <= trades.length; start += step) {
      const slice = trades.slice(start, start + windowSize);
      const ic = this.computeIC(slice, componentName);
      windows.push({
        startIdx: start, endIdx: start + windowSize,
        ic: ic.ic, pValue: ic.pValue, n: ic.n
      });
    }

    if (windows.length < 3) {
      return { windows, halfLife: null, stable: null, recommendation: 'insufficient data' };
    }

    const ics = windows.map(w => w.ic);
    const variance = this._variance(ics);
    const stable = variance < 0.02;

    const slope = this._linearSlope(ics);
    const halfLife = (slope < -0.001 && ics[0] > 0)
      ? Math.round((-ics[0] / (2 * slope)) * (windowSize / step))
      : null;

    const recommendation = stable
      ? 'stable, 90-day lookback is fine'
      : halfLife
        ? `decaying (half-life ~${halfLife} trades), use shorter lookback`
        : 'unstable but no clear decay trend';

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
    for (const name of componentNames) {
      decayEstimates[name] = this.estimateDecay(trades, name);
    }

    const recommendations = [];
    for (const r of rankings) {
      if (r.classification === 'noise') {
        recommendations.push(`KILL: ${r.name} (IC=${r.ic}, p=${r.pValue}) — noise`);
      } else if (r.classification === 'contrarian') {
        recommendations.push(`FLIP OR KILL: ${r.name} (IC=${r.ic}) — contrarian signal`);
      }
    }
    for (const p of corr.redundantPairs) {
      recommendations.push(`MERGE: ${p.a} + ${p.b} (r=${p.r}) — ${p.recommendation}`);
    }
    for (const rec of regimeMatrix.recommendations) {
      recommendations.push(`REGIME GATE: ${rec}`);
    }
    for (const [name, decay] of Object.entries(decayEstimates)) {
      if (decay.halfLife && decay.halfLife < 100) {
        recommendations.push(`SHORTEN LOOKBACK: ${name} half-life ~${decay.halfLife} trades`);
      }
    }

    const warnings = [];
    if (trades.length < 100) warnings.push(`LOW TRADE COUNT: Only ${trades.length} trades. Results may not be reliable.`);
    if (rankings.every(r => r.classification !== 'signal')) {
      warnings.push('ALL COMPONENTS WEAK: No component shows strong IC. Review data quality or signal logic.');
    }

    const timestamps = trades.map(t => t.timestamp || t.entryTime).filter(Boolean).sort();
    const dateRange = timestamps.length > 0
      ? { from: timestamps[0], to: timestamps[timestamps.length - 1] }
      : { from: null, to: null };

    let optimalThreshold = null;
    try {
      const fs = require('fs');
      const path = require('path');
      const sweepPath = path.join(__dirname, 'cache', `${trades[0]?.bot || 'unknown'}-threshold-sweep.json`);
      if (fs.existsSync(sweepPath)) {
        optimalThreshold = JSON.parse(fs.readFileSync(sweepPath, 'utf8'));
      }
    } catch {}

    return {
      bot: trades[0]?.bot || 'unknown',
      tradeCount: trades.length,
      dateRange,
      optimalThreshold,
      componentRankings: rankings,
      redundantPairs: corr.redundantPairs,
      regimeMatrix: regimeMatrix.matrix,
      decayEstimates,
      recommendations,
      warnings
    };
  }

  // --- Statistical helpers ---

  _spearman(x, y) {
    const rx = this._rank(x);
    const ry = this._rank(y);
    return this._pearson(rx, ry);
  }

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
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx += (x[i] - mx) ** 2;
      dy += (y[i] - my) ** 2;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  }

  _tTestPValue(t, df) {
    const x = df / (df + t * t);
    return this._incompleteBeta(df / 2, 0.5, x);
  }

  _incompleteBeta(a, b, x) {
    if (x <= 0) return 1;
    if (x >= 1) return 0;
    const bt = Math.exp(
      this._lnGamma(a + b) - this._lnGamma(a) - this._lnGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      return bt * this._betaCF(a, b, x) / a;
    }
    return 1 - bt * this._betaCF(b, a, 1 - x) / b;
  }

  _betaCF(a, b, x) {
    const maxIter = 100;
    let qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= maxIter; m++) {
      let m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-7) break;
    }
    return h;
  }

  _lnGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  _fisherCI(r, n) {
    const z = 0.5 * Math.log((1 + r) / (1 - r + 1e-10));
    const se = 1 / Math.sqrt(Math.max(n - 3, 1));
    const zLow = z - 1.96 * se;
    const zHigh = z + 1.96 * se;
    return [
      Math.round(((Math.exp(2 * zLow) - 1) / (Math.exp(2 * zLow) + 1)) * 1000) / 1000,
      Math.round(((Math.exp(2 * zHigh) - 1) / (Math.exp(2 * zHigh) + 1)) * 1000) / 1000
    ];
  }

  _variance(arr) {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  }

  _linearSlope(arr) {
    const n = arr.length;
    const mx = (n - 1) / 2;
    const my = arr.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - mx) * (arr[i] - my);
      den += (i - mx) ** 2;
    }
    return den > 0 ? num / den : 0;
  }
}

module.exports = { Analytics };
