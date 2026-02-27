// src/services/alertManagerService.js
class AlertManagerService {
  constructor({ logger, metrics, io }) {
    this.logger = logger;
    this.metrics = metrics;
    this.io = io;
  }

  async initialize() {
    this.logger.info('AlertManagerService initialized');
    return true;
  }
}

module.exports = AlertManagerService;
