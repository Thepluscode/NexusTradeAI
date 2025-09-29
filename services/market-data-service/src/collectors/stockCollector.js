const BaseCollector = require('./baseCollector');
const axios = require('axios');

class StockCollector extends BaseCollector {
  getConfig() {
    return {
      exchanges: {
        iex: {
          wsUrl: 'wss://ws-api.iextrading.com/1.0/tops',
          restUrl: 'https://cloud.iexapis.com/stable',
          rateLimit: 100, // requests per second
          ratePeriod: 1000 // 1 second
        },
        alpaca: {
          wsUrl: 'wss://stream.data.alpaca.markets/v2/iex',
          restUrl: 'https://data.alpaca.markets/v2',
          rateLimit: 200, // requests per minute
          ratePeriod: 60000 // 1 minute
        },
        polygon: {
          wsUrl: 'wss://socket.polygon.io/stocks',
          restUrl: 'https://api.polygon.io/v2',
          rateLimit: 5, // requests per minute for free tier
          ratePeriod: 60000 // 1 minute
        },
        finnhub: {
          wsUrl: 'wss://ws.finnhub.io',
          restUrl: 'https://finnhub.io/api/v1',
          rateLimit: 60, // requests per minute
          ratePeriod: 60000 // 1 minute
        }
      }
    };
  }

  async initialize() {
    // Initialize API clients
    this.apiClients = new Map();
    
    // IEX Cloud
    if (process.env.IEX_API_KEY) {
      this.apiClients.set('iex', {
        baseURL: this.config.exchanges.iex.restUrl,
        token: process.env.IEX_API_KEY
      });
    }
    
    // Alpaca
    if (process.env.ALPACA_API_KEY) {
      this.apiClients.set('alpaca', {
        baseURL: this.config.exchanges.alpaca.restUrl,
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
          'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY
        }
      });
    }
    
    // Polygon
    if (process.env.POLYGON_API_KEY) {
      this.apiClients.set('polygon', {
        baseURL: this.config.exchanges.polygon.restUrl,
        apikey: process.env.POLYGON_API_KEY
      });
    }
    
    // Finnhub
    if (process.env.FINNHUB_API_KEY) {
      this.apiClients.set('finnhub', {
        baseURL: this.config.exchanges.finnhub.restUrl,
        token: process.env.FINNHUB_API_KEY
      });
    }
  }

  processMessage(exchangeId, message) {
    switch (exchangeId) {
      case 'iex':
        return this.processIEXMessage(message);
      case 'alpaca':
        return this.processAlpacaMessage(message);
      case 'polygon':
        return this.processPolygonMessage(message);
      case 'finnhub':
        return this.processFinnhubMessage(message);
      default:
        return null;
    }
  }

  processIEXMessage(message) {
    if (Array.isArray(message)) {
      return message.map(item => ({
        dataType: 'quote',
        symbol: item.symbol,
        price: item.lastSalePrice,
        size: item.lastSaleSize,
        timestamp: item.lastSaleTime,
        bid: item.bidPrice,
        ask: item.askPrice,
        bidSize: item.bidSize,
        askSize: item.askSize
      }));
    }
    
    return null;
  }

  processAlpacaMessage(message) {
    if (message.T === 't') { // Trade
      return {
        dataType: 'trade',
        symbol: message.S,
        price: message.p,
        size: message.s,
        timestamp: message.t,
        conditions: message.c
      };
    }
    
    if (message.T === 'q') { // Quote
      return {
        dataType: 'quote',
        symbol: message.S,
        bid: message.bp,
        ask: message.ap,
        bidSize: message.bs,
        askSize: message.as,
        timestamp: message.t
      };
    }
    
    if (message.T === 'b') { // Minute bar
      return {
        dataType: 'bar',
        symbol: message.S,
        open: message.o,
        high: message.h,
        low: message.l,
        close: message.c,
        volume: message.v,
        timestamp: message.t
      };
    }
    
    return null;
  }

  processPolygonMessage(message) {
    if (message.ev === 'T') { // Trade
      return {
        dataType: 'trade',
        symbol: message.sym,
        price: message.p,
        size: message.s,
        timestamp: message.t,
        exchange: message.x
      };
    }
    
    if (message.ev === 'Q') { // Quote
      return {
        dataType: 'quote',
        symbol: message.sym,
        bid: message.bp,
        ask: message.ap,
        bidSize: message.bs,
        askSize: message.as,
        timestamp: message.t
      };
    }
    
    if (message.ev === 'AM') { // Aggregate minute
      return {
        dataType: 'bar',
        symbol: message.sym,
        open: message.o,
        high: message.h,
        low: message.l,
        close: message.c,
        volume: message.v,
        timestamp: message.s
      };
    }
    
    return null;
  }

  processFinnhubMessage(message) {
    if (message.type === 'trade') {
      return message.data.map(trade => ({
        dataType: 'trade',
        symbol: trade.s,
        price: trade.p,
        volume: trade.v,
        timestamp: trade.t * 1000,
        conditions: trade.c
      }));
    }
    
    return null;
  }

  authenticate(exchangeId, ws, authConfig) {
    switch (exchangeId) {
      case 'alpaca':
        ws.send(JSON.stringify({
          action: 'auth',
          key: process.env.ALPACA_API_KEY,
          secret: process.env.ALPACA_SECRET_KEY
        }));
        break;
      case 'polygon':
        ws.send(JSON.stringify({
          action: 'auth',
          params: process.env.POLYGON_API_KEY
        }));
        break;
      case 'finnhub':
        ws.send(JSON.stringify({
          type: 'subscribe',
          symbol: 'BINANCE:BTCUSDT'
        }));
        break;
    }
  }

  sendSubscriptionMessage(ws, exchange, symbol, dataTypes) {
    switch (exchange) {
      case 'alpaca':
        this.subscribeAlpaca(ws, symbol, dataTypes);
        break;
      case 'polygon':
        this.subscribePolygon(ws, symbol, dataTypes);
        break;
      case 'finnhub':
        this.subscribeFinnhub(ws, symbol, dataTypes);
        break;
    }
  }

  subscribeAlpaca(ws, symbol, dataTypes) {
    const subscriptions = {};
    
    if (dataTypes.includes('trade')) {
      subscriptions.trades = [symbol];
    }
    if (dataTypes.includes('quote')) {
      subscriptions.quotes = [symbol];
    }
    if (dataTypes.includes('bar')) {
      subscriptions.bars = [symbol];
    }
    
    ws.send(JSON.stringify({
      action: 'subscribe',
      ...subscriptions
    }));
  }

  subscribePolygon(ws, symbol, dataTypes) {
    const subscriptions = [];
    
    if (dataTypes.includes('trade')) {
      subscriptions.push(`T.${symbol}`);
    }
    if (dataTypes.includes('quote')) {
      subscriptions.push(`Q.${symbol}`);
    }
    if (dataTypes.includes('bar')) {
      subscriptions.push(`AM.${symbol}`);
    }
    
    ws.send(JSON.stringify({
      action: 'subscribe',
      params: subscriptions.join(',')
    }));
  }

  subscribeFinnhub(ws, symbol, dataTypes) {
    ws.send(JSON.stringify({
      type: 'subscribe',
      symbol: symbol
    }));
  }

  async getQuote(exchange, symbol) {
    const client = this.apiClients.get(exchange);
    if (!client) {
      throw new Error(`Exchange ${exchange} not configured`);
    }

    try {
      switch (exchange) {
        case 'iex':
          const iexResponse = await axios.get(
            `${client.baseURL}/stock/${symbol}/quote?token=${client.token}`
          );
          return this.normalizeIEXQuote(iexResponse.data);
          
        case 'alpaca':
          const alpacaResponse = await axios.get(
            `${client.baseURL}/stocks/${symbol}/quotes/latest`,
            { headers: client.headers }
          );
          return this.normalizeAlpacaQuote(alpacaResponse.data.quote);
          
        case 'finnhub':
          const finnhubResponse = await axios.get(
            `${client.baseURL}/quote?symbol=${symbol}&token=${client.token}`
          );
          return this.normalizeFinnhubQuote(finnhubResponse.data, symbol);
          
        default:
          throw new Error(`Quote not supported for ${exchange}`);
      }
    } catch (error) {
      this.logger?.error(`Error fetching quote for ${symbol} from ${exchange}:`, error);
      throw error;
    }
  }

  async getHistoricalData(exchange, symbol, timeframe, from, to) {
    const client = this.apiClients.get(exchange);
    if (!client) {
      throw new Error(`Exchange ${exchange} not configured`);
    }

    try {
      switch (exchange) {
        case 'iex':
          return await this.getIEXHistoricalData(client, symbol, timeframe, from, to);
        case 'alpaca':
          return await this.getAlpacaHistoricalData(client, symbol, timeframe, from, to);
        case 'polygon':
          return await this.getPolygonHistoricalData(client, symbol, timeframe, from, to);
        default:
          throw new Error(`Historical data not supported for ${exchange}`);
      }
    } catch (error) {
      this.logger?.error(`Error fetching historical data:`, error);
      throw error;
    }
  }

  normalizeIEXQuote(data) {
    return {
      symbol: data.symbol,
      price: data.latestPrice,
      change: data.change,
      changePercent: data.changePercent,
      volume: data.latestVolume,
      marketCap: data.marketCap,
      timestamp: data.latestUpdate
    };
  }

  normalizeAlpacaQuote(data) {
    return {
      symbol: data.symbol,
      bid: data.bidPrice,
      ask: data.askPrice,
      bidSize: data.bidSize,
      askSize: data.askSize,
      timestamp: new Date(data.timestamp).getTime()
    };
  }

  normalizeFinnhubQuote(data, symbol) {
    return {
      symbol: symbol,
      price: data.c,
      change: data.d,
      changePercent: data.dp,
      high: data.h,
      low: data.l,
      open: data.o,
      previousClose: data.pc,
      timestamp: Date.now()
    };
  }
}

module.exports = StockCollector;