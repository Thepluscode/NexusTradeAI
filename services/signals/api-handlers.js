const { Analytics } = require('../backtesting-js/analytics');

const analytics = new Analytics();
const reportCache = new Map(); // bot → { report, timestamp }

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
      const fs = require('fs');
      const path = require('path');
      const cachePath = path.join(__dirname, '..', 'backtesting-js', 'cache', `${bot}-threshold-sweep.json`);
      if (fs.existsSync(cachePath)) {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        return res.json({ success: true, data });
      }
      res.json({ success: true, data: null, message: 'No threshold sweep data. Run CLI: node services/backtesting-js/cli.js --bot ' + bot + ' --sweep-threshold' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { createSignalEndpoints };
