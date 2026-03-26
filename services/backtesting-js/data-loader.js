const fs = require('fs');
const path = require('path');
const https = require('https');

class DataLoader {
  constructor(config = {}) {
    this.cacheDir = config.cacheDir || path.join(__dirname, 'cache');
    this.alpacaKey = config.alpacaKey || process.env.ALPACA_API_KEY;
    this.alpacaSecret = config.alpacaSecret || process.env.ALPACA_SECRET_KEY;
    this.oandaToken = config.oandaToken || process.env.OANDA_API_TOKEN;
    this.krakenKey = config.krakenKey || process.env.KRAKEN_API_KEY;

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getCacheKey(bot, symbol, timeframe, days) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    return `${bot}_${symbol}_${timeframe}_${startDate}_${endDate}`;
  }

  loadFromCache(key) {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const stat = fs.statSync(filePath);
      const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
      if (ageHours > 24) return null; // stale
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  saveToCache(key, bars) {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(bars));
  }

  async fetchAlpacaBars(symbol, timeframe, startDate, endDate) {
    const tfMap = { '1m': '1Min', '5m': '5Min', '15m': '15Min', '1h': '1Hour', '4h': '4Hour', '1D': '1Day' };
    const tf = tfMap[timeframe] || '5Min';
    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${tf}&start=${startDate}T00:00:00Z&end=${endDate}T23:59:59Z&limit=10000&feed=iex`;

    return this._fetchJSON(url, {
      'APCA-API-KEY-ID': this.alpacaKey,
      'APCA-API-SECRET-KEY': this.alpacaSecret
    }).then(data => {
      if (!data.bars) return [];
      return data.bars.map(b => ({
        time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v
      }));
    });
  }

  async fetchKrakenBars(symbol, timeframe, days) {
    const tfMap = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440 };
    const interval = tfMap[timeframe] || 5;
    const since = Math.floor((Date.now() - days * 86400000) / 1000);
    const pair = symbol.replace('_', '');
    const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}&since=${since}`;

    return this._fetchJSON(url).then(data => {
      const key = Object.keys(data.result || {}).find(k => k !== 'last');
      if (!key) return [];
      return data.result[key].map(b => ({
        time: new Date(b[0] * 1000).toISOString(),
        open: parseFloat(b[1]), high: parseFloat(b[2]),
        low: parseFloat(b[3]), close: parseFloat(b[4]),
        volume: parseFloat(b[6])
      }));
    });
  }

  async fetchOandaBars(symbol, timeframe, days) {
    const tfMap = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '1h': 'H1', '4h': 'H4', '1D': 'D' };
    const gran = tfMap[timeframe] || 'M5';
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const instrument = symbol.replace('_', '/').replace('/', '_');
    const url = `https://api-fxpractice.oanda.com/v3/instruments/${instrument}/candles?granularity=${gran}&from=${from}&count=5000`;

    return this._fetchJSON(url, {
      'Authorization': `Bearer ${this.oandaToken}`,
      'Content-Type': 'application/json'
    }).then(data => {
      if (!data.candles) return [];
      return data.candles.filter(c => c.complete).map(c => ({
        time: c.time, open: parseFloat(c.mid.o), high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l), close: parseFloat(c.mid.c),
        volume: c.volume || 0
      }));
    });
  }

  async loadBars(bot, symbol, timeframe, days) {
    const key = this.getCacheKey(bot, symbol, timeframe, days);
    const cached = this.loadFromCache(key);
    if (cached) return { bars: cached, source: bot, cached: true };

    let bars;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    if (bot === 'stock') {
      bars = await this.fetchAlpacaBars(symbol, timeframe, startDate, endDate);
    } else if (bot === 'forex') {
      bars = await this.fetchOandaBars(symbol, timeframe, days);
    } else if (bot === 'crypto') {
      bars = await this.fetchKrakenBars(symbol, timeframe, days);
    } else {
      throw new Error(`Unknown bot type: ${bot}`);
    }

    if (bars.length > 0) {
      this.saveToCache(key, bars);
    }

    return { bars, source: bot, cached: false };
  }

  async loadMultiTimeframeBars(bot, symbol, days) {
    const timeframes = ['5m', '15m', '1h', '4h', '1D'];
    const keyMap = { '5m': 'm5', '15m': 'm15', '1h': 'h1', '4h': 'h4', '1D': 'd1' };
    const out = { m5: [], m15: [], h1: [], h4: [], d1: [] };

    for (const tf of timeframes) {
      try {
        const { bars } = await this.loadBars(bot, symbol, tf, days);
        out[keyMap[tf]] = bars;
      } catch (err) {
        console.warn(`Failed to load ${tf} bars for ${symbol}: ${err.message}`);
      }
    }

    return out;
  }

  /**
   * Aggregate lower-timeframe bars into higher timeframes.
   * DEBUG/FALLBACK ONLY — primary path loads each TF independently from provider.
   */
  aggregateBars(bars, targetTimeframe) {
    const tfMinutes = { '15m': 15, '1h': 60, '4h': 240, '1D': 1440 };
    const minutes = tfMinutes[targetTimeframe];
    if (!minutes || !bars || bars.length === 0) return [];

    const grouped = {};
    for (const bar of bars) {
      const t = new Date(bar.time).getTime();
      const bucket = Math.floor(t / (minutes * 60000)) * minutes * 60000;
      if (!grouped[bucket]) {
        grouped[bucket] = { time: new Date(bucket).toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: 0 };
      }
      const g = grouped[bucket];
      g.high = Math.max(g.high, bar.high);
      g.low = Math.min(g.low, bar.low);
      g.close = bar.close;
      g.volume += bar.volume;
    }

    return Object.values(grouped).sort((a, b) => new Date(a.time) - new Date(b.time));
  }

  _fetchJSON(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname, path: parsed.pathname + parsed.search,
        method: 'GET', headers
      };
      const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Invalid JSON from ${url}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
      req.end();
    });
  }
}

module.exports = { DataLoader };
