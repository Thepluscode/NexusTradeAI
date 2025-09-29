const express = require('express');
const promClient = require('prom-client');
const router = express.Router();

router.get('/', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});

router.get('/json', async (req, res) => {
  try {
    const metrics = await promClient.register.getMetricsAsJSON();
    res.json({
      success: true,
      data: metrics,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get metrics',
      error: error.message
    });
  }
});

module.exports = router;