// Alpaca Broker Integration
// Production-ready integration with Alpaca Markets for US stocks and crypto trading

const axios = require('axios');
const WebSocket = require('ws');

class AlpacaBroker {
  constructor(options = {}) {
    this.name = 'alpaca';
    this.logger = options.logger;
    
    // API Configuration
    this.config = {
      apiKey: options.apiKey,
      secretKey: options.secretKey,
      baseUrl: options.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets',
      dataUrl: options.paper ? 'https://data.alpaca.markets' : 'https://data.alpaca.markets',
      wsUrl: options.paper ? 'wss://stream.data.alpaca.markets/v2/iex' : 'wss://stream.data.alpaca.markets/v2/iex',
      paper: options.paper || false
    };
    
    // HTTP client with authentication
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'APCA-API-KEY-ID': this.config.apiKey,
        'APCA-API-SECRET-KEY': this.config.secretKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    // Performance tracking
    this.metrics = {
      totalOrders: 0,
      successfulOrders: 0,
      averageLatency: 0,
      lastHealthCheck: null,
      isHealthy: true
    };
    
    // Supported symbols cache
    this.supportedSymbols = new Set();
    this.symbolsLastUpdated = null;
    
    this.initializeConnection();
  }

  /**
   * Initialize connection and load supported symbols
   */
  async initializeConnection() {
    try {
      // Test connection
      await this.getAccount();
      
      // Load supported symbols
      await this.loadSupportedSymbols();
      
      this.logger?.info(`✅ Alpaca broker initialized (${this.config.paper ? 'Paper' : 'Live'} trading)`);
      
    } catch (error) {
      this.logger?.error('Failed to initialize Alpaca broker:', error);
      this.metrics.isHealthy = false;
    }
  }

  /**
   * Load supported trading symbols
   */
  async loadSupportedSymbols() {
    try {
      const response = await this.client.get('/v2/assets', {
        params: {
          status: 'active',
          asset_class: 'us_equity'
        }
      });
      
      this.supportedSymbols.clear();
      response.data.forEach(asset => {
        this.supportedSymbols.add(asset.symbol);
      });
      
      // Add crypto symbols if available
      try {
        const cryptoResponse = await this.client.get('/v1beta1/crypto/assets');
        cryptoResponse.data.forEach(asset => {
          this.supportedSymbols.add(asset.symbol);
        });
      } catch (cryptoError) {
        // Crypto not available in this account
      }
      
      this.symbolsLastUpdated = Date.now();
      this.logger?.info(`Loaded ${this.supportedSymbols.size} supported symbols from Alpaca`);
      
    } catch (error) {
      this.logger?.error('Error loading Alpaca symbols:', error);
    }
  }

  /**
   * Submit order to Alpaca
   */
  async submitOrder(order) {
    const startTime = Date.now();
    
    try {
      // Convert order to Alpaca format
      const alpacaOrder = this.convertToAlpacaOrder(order);
      
      // Submit order
      const response = await this.client.post('/v2/orders', alpacaOrder);
      
      // Update metrics
      this.metrics.totalOrders++;
      this.metrics.successfulOrders++;
      this.updateLatencyMetrics(Date.now() - startTime);
      
      this.logger?.info(`Order submitted to Alpaca: ${response.data.id}`);
      
      return {
        success: true,
        brokerOrderId: response.data.id,
        status: response.data.status,
        submittedAt: response.data.submitted_at
      };
      
    } catch (error) {
      this.metrics.totalOrders++;
      this.updateLatencyMetrics(Date.now() - startTime);
      
      this.logger?.error('Alpaca order submission failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: this.parseAlpacaError(error),
        code: error.response?.status
      };
    }
  }

  /**
   * Convert internal order format to Alpaca format
   */
  convertToAlpacaOrder(order) {
    const alpacaOrder = {
      symbol: order.symbol,
      qty: order.quantity.toString(),
      side: order.side.toLowerCase(),
      type: this.convertOrderType(order.orderType),
      time_in_force: order.timeInForce || 'day'
    };
    
    // Add price for limit orders
    if (order.orderType === 'LIMIT' && order.price) {
      alpacaOrder.limit_price = order.price.toString();
    }
    
    // Add stop price for stop orders
    if (order.orderType === 'STOP' && order.stopPrice) {
      alpacaOrder.stop_price = order.stopPrice.toString();
    }
    
    // Add both prices for stop-limit orders
    if (order.orderType === 'STOP_LIMIT') {
      if (order.price) alpacaOrder.limit_price = order.price.toString();
      if (order.stopPrice) alpacaOrder.stop_price = order.stopPrice.toString();
    }
    
    // Add client order ID if provided
    if (order.clientOrderId) {
      alpacaOrder.client_order_id = order.clientOrderId;
    }
    
    return alpacaOrder;
  }

  /**
   * Convert order type to Alpaca format
   */
  convertOrderType(orderType) {
    const typeMap = {
      'MARKET': 'market',
      'LIMIT': 'limit',
      'STOP': 'stop',
      'STOP_LIMIT': 'stop_limit'
    };
    
    return typeMap[orderType] || 'market';
  }

  /**
   * Get order status from Alpaca
   */
  async getOrderStatus(brokerOrderId) {
    try {
      const response = await this.client.get(`/v2/orders/${brokerOrderId}`);
      const alpacaOrder = response.data;
      
      return {
        status: this.convertAlpacaStatus(alpacaOrder.status),
        fills: this.convertAlpacaFills(alpacaOrder),
        reason: alpacaOrder.cancel_reason || null
      };
      
    } catch (error) {
      this.logger?.error(`Error getting Alpaca order status for ${brokerOrderId}:`, error);
      return {
        status: 'UNKNOWN',
        fills: [],
        reason: 'Error retrieving status'
      };
    }
  }

  /**
   * Convert Alpaca status to internal format
   */
  convertAlpacaStatus(alpacaStatus) {
    const statusMap = {
      'new': 'SUBMITTED',
      'partially_filled': 'PARTIALLY_FILLED',
      'filled': 'FILLED',
      'done_for_day': 'CANCELLED',
      'canceled': 'CANCELLED',
      'expired': 'CANCELLED',
      'replaced': 'REPLACED',
      'pending_cancel': 'PENDING_CANCEL',
      'pending_replace': 'PENDING_REPLACE',
      'accepted': 'SUBMITTED',
      'pending_new': 'PENDING',
      'accepted_for_bidding': 'SUBMITTED',
      'stopped': 'CANCELLED',
      'rejected': 'REJECTED',
      'suspended': 'SUSPENDED'
    };
    
    return statusMap[alpacaStatus] || 'UNKNOWN';
  }

  /**
   * Convert Alpaca fills to internal format
   */
  convertAlpacaFills(alpacaOrder) {
    if (!alpacaOrder.filled_qty || parseFloat(alpacaOrder.filled_qty) === 0) {
      return [];
    }
    
    // Alpaca doesn't provide detailed fill information in the order object
    // For detailed fills, we'd need to call the separate fills endpoint
    return [{
      id: `${alpacaOrder.id}_fill`,
      quantity: parseFloat(alpacaOrder.filled_qty),
      price: parseFloat(alpacaOrder.filled_avg_price || alpacaOrder.limit_price || 0),
      timestamp: alpacaOrder.filled_at || alpacaOrder.updated_at,
      commission: 0 // Alpaca is commission-free
    }];
  }

  /**
   * Cancel order
   */
  async cancelOrder(brokerOrderId) {
    try {
      await this.client.delete(`/v2/orders/${brokerOrderId}`);
      
      this.logger?.info(`Cancelled Alpaca order: ${brokerOrderId}`);
      return { success: true };
      
    } catch (error) {
      this.logger?.error(`Error cancelling Alpaca order ${brokerOrderId}:`, error);
      return { 
        success: false, 
        error: this.parseAlpacaError(error) 
      };
    }
  }

  /**
   * Check if symbol is supported
   */
  async supportsSymbol(symbol) {
    // Refresh symbols cache if old
    if (!this.symbolsLastUpdated || Date.now() - this.symbolsLastUpdated > 3600000) {
      await this.loadSupportedSymbols();
    }
    
    return this.supportedSymbols.has(symbol);
  }

  /**
   * Estimate execution cost
   */
  async estimateExecutionCost(order) {
    try {
      // Get latest quote
      const quote = await this.getLatestQuote(order.symbol);
      
      const spread = quote.ask - quote.bid;
      const midPrice = (quote.ask + quote.bid) / 2;
      
      // Estimate slippage based on order size and spread
      const orderValue = order.quantity * midPrice;
      let slippage = spread / midPrice;
      
      // Increase slippage for larger orders
      if (orderValue > 100000) slippage *= 1.5;
      if (orderValue > 1000000) slippage *= 2;
      
      return {
        totalCost: slippage * orderValue,
        slippage: slippage,
        commission: 0, // Alpaca is commission-free
        liquidity: Math.min(quote.bidSize + quote.askSize, 10000) / 10000 // Normalized 0-1
      };
      
    } catch (error) {
      this.logger?.error('Error estimating Alpaca execution cost:', error);
      return {
        totalCost: 0.001, // Default 0.1% cost
        slippage: 0.001,
        commission: 0,
        liquidity: 0.5
      };
    }
  }

  /**
   * Get latest quote for symbol
   */
  async getLatestQuote(symbol) {
    try {
      const response = await axios.get(`${this.config.dataUrl}/v2/stocks/${symbol}/quotes/latest`, {
        headers: {
          'APCA-API-KEY-ID': this.config.apiKey,
          'APCA-API-SECRET-KEY': this.config.secretKey
        }
      });
      
      const quote = response.data.quote;
      return {
        bid: quote.bp,
        ask: quote.ap,
        bidSize: quote.bs,
        askSize: quote.as,
        timestamp: quote.t
      };
      
    } catch (error) {
      this.logger?.error(`Error getting quote for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get account information
   */
  async getAccount() {
    try {
      const response = await this.client.get('/v2/account');
      return response.data;
    } catch (error) {
      this.logger?.error('Error getting Alpaca account:', error);
      throw error;
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    const startTime = Date.now();
    
    try {
      await this.getAccount();
      
      const latency = Date.now() - startTime;
      this.metrics.lastHealthCheck = Date.now();
      this.metrics.isHealthy = true;
      
      return {
        isHealthy: true,
        latency,
        reliability: this.metrics.totalOrders > 0 
          ? this.metrics.successfulOrders / this.metrics.totalOrders 
          : 1.0,
        lastCheck: this.metrics.lastHealthCheck
      };
      
    } catch (error) {
      this.metrics.isHealthy = false;
      
      return {
        isHealthy: false,
        latency: Date.now() - startTime,
        reliability: 0,
        error: error.message,
        lastCheck: Date.now()
      };
    }
  }

  /**
   * Parse Alpaca error messages
   */
  parseAlpacaError(error) {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    
    if (error.response?.data?.code) {
      const errorCodes = {
        40010001: 'Insufficient buying power',
        40010002: 'Account is restricted',
        40010003: 'Order would exceed position limit',
        40310000: 'Symbol not found',
        42210000: 'Order rejected by exchange'
      };
      
      return errorCodes[error.response.data.code] || `Alpaca error: ${error.response.data.code}`;
    }
    
    return error.message || 'Unknown Alpaca error';
  }

  /**
   * Update latency metrics
   */
  updateLatencyMetrics(latency) {
    const total = this.metrics.averageLatency * (this.metrics.totalOrders - 1);
    this.metrics.averageLatency = (total + latency) / this.metrics.totalOrders;
  }
}

module.exports = AlpacaBroker;
