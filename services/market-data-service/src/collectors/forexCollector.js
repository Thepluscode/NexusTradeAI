const BaseCollector = require('./baseCollector');
const axios = require('axios');

class ForexCollector extends BaseCollector {
  getConfig() {
    return {
      exchanges: {
        oanda: {
          wsUrl: 'wss://stream-fxpractice.oanda.com/v3/accounts/{accountId}/pricing/stream',
          restUrl: 'https://api-fxpractice.oanda.com/v3',
          rateLimit: 120, // requests per hour
          ratePeriod: 3600000 // 1 hour
        },
        fxcm: {
          wsUrl: 'wss://api-demo.fxcm.com/socketio/',
          restUrl: 'https://api-demo.fxcm.com',
          rateLimit: 300, // requests per hour
          ratePeriod: 3600000 // 1 hour
        },
        dukascopy: {
          wsUrl: 'wss://freeserv.dukascopy.com/2.0',
          restUrl: 'https://freeserv.dukascopy.com/2.0',
          rateLimit: 100, // requests per minute
          ratePeriod: 60000 // 1 minute
        }
      }
    };
  }

  async initialize() {
    // Initialize API clients for each forex provider
    this.apiClients = new Map();
    
    // OANDA
    if (process.env.OANDA_API_KEY) {
      this.apiClients.set('oanda', {
        baseURL: this.config.exchanges.oanda.restUrl,
        headers: {
          'Authorization': `Bearer ${process.env.OANDA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        accountId: process.env.OANDA_ACCOUNT_ID
      });
    }
    
    // FXCM
    if (process.env.FXCM_API_KEY) {
      this.apiClients.set('fxcm', {
        baseURL: this.config.exchanges.fxcm.restUrl,
        headers: {
          'Authorization': `Bearer ${process.env.FXCM_API_KEY}`
        }
      });
    }
    
    // Dukascopy (typically doesn't require auth for basic data)
    this.apiClients.set('dukascopy', {
      baseURL: this.config.exchanges.dukascopy.restUrl
    });
  }

  processMessage(exchangeId, message) {
    switch (exchangeId) {
      case 'oanda':
        return this.processOandaMessage(message);
      case 'fxcm':
        return this.processFXCMMessage(message);
      case 'dukascopy':
        return this.processDukascopyMessage(message);
      default:
        return null;
    }
  }

  processOandaMessage(message) {
    if (message.type === 'PRICE') {
      return {
        dataType: 'quote',
        symbol: message.instrument,
        bid: parseFloat(message.bids[0].price),
        ask: parseFloat(message.asks[0].price),
        bidSize: parseFloat(message.bids[0].liquidity || 0),
        askSize: parseFloat(message.asks[0].liquidity || 0),
        timestamp: new Date(message.time).getTime(),
        tradeable: message.tradeable
      };
    }
    
    if (message.type === 'HEARTBEAT') {
      return null; // Ignore heartbeats
    }
    
    return null;
  }

  processFXCMMessage(message) {
    if (message.Updated) {
      return message.Updated.map(update => ({
        dataType: 'quote',
        symbol: update.Symbol,
        bid: parseFloat(update.Bid),
        ask: parseFloat(update.Ask),
        high: parseFloat(update.High),
        low: parseFloat(update.Low),
        timestamp: Date.now()
      }));
    }
    
    return null;
  }

  processDukascopyMessage(message) {
    if (message.ticks && Array.isArray(message.ticks)) {
      return message.ticks.map(tick => ({
        dataType: 'tick',
        symbol: tick.symbol,
        bid: tick.bid,
        ask: tick.ask,
        timestamp: tick.timestamp
      }));
    }
    
    return null;
  }

  authenticate(exchangeId, ws, authConfig) {
    switch (exchangeId) {
      case 'oanda':
        // OANDA authentication is handled via headers
        break;
      case 'fxcm':
        ws.send(JSON.stringify({
          msgType: 'login',
          username: process.env.FXCM_USERNAME,
          password: process.env.FXCM_PASSWORD
        }));
        break;
      case 'dukascopy':
        // Dukascopy may not require authentication for basic data
        break;
    }
  }

  sendSubscriptionMessage(ws, exchange, symbol, dataTypes) {
    switch (exchange) {
      case 'oanda':
        this.subscribeOanda(ws, symbol, dataTypes);
        break;
      case 'fxcm':
        this.subscribeFXCM(ws, symbol, dataTypes);
        break;
      case 'dukascopy':
        this.subscribeDukascopy(ws, symbol, dataTypes);
        break;
    }
  }

  subscribeOanda(ws, symbol, dataTypes) {
    // OANDA uses REST streaming, subscription is handled via URL parameters
    const subscribeMessage = {
      instruments: symbol
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  subscribeFXCM(ws, symbol, dataTypes) {
    const subscribeMessage = {
      msgType: 'subscribe',
      symbolList: [symbol]
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  subscribeDukascopy(ws, symbol, dataTypes) {
    const subscribeMessage = {
      op: 'subscribe',
      args: [`${symbol}`]
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  async getExchangeRates(baseCurrency = 'USD', targetCurrencies = ['EUR', 'GBP', 'JPY']) {
    try {
      const rates = {};
      
      for (const target of targetCurrencies) {
        const symbol = `${baseCurrency}_${target}`;
        const rate = await this.getRate('oanda', symbol);
        if (rate) {
          rates[target] = rate;
        }
      }
      
      return rates;
    } catch (error) {
      this.logger?.error('Error fetching exchange rates:', error);
      throw error;
    }
  }

  async getRate(exchange, symbol) {
    const client = this.apiClients.get(exchange);
    if (!client) {
      throw new Error(`Exchange ${exchange} not configured`);
    }

    try {
      switch (exchange) {
        case 'oanda':
          const response = await axios.get(
            `${client.baseURL}/accounts/${client.accountId}/pricing?instruments=${symbol}`,
            { headers: client.headers }
          );
          
          const price = response.data.prices[0];
          return {
            symbol: price.instrument,
            bid: parseFloat(price.bids[0].price),
            ask: parseFloat(price.asks[0].price),
            timestamp: new Date(price.time).getTime()
          };
          
        default:
          throw new Error(`Rate fetching not implemented for ${exchange}`);
      }
    } catch (error) {
      this.logger?.error(`Error fetching rate for ${symbol} from ${exchange}:`, error);
      throw error;
    }
  }

  async getHistoricalRates(exchange, symbol, granularity = 'M1', count = 100) {
    const client = this.apiClients.get(exchange);
    if (!client) {
      throw new Error(`Exchange ${exchange} not configured`);
    }

    try {
      switch (exchange) {
        case 'oanda':
          const response = await axios.get(
            `${client.baseURL}/accounts/${client.accountId}/instruments/${symbol}/candles`,
            {
              headers: client.headers,
              params: {
                granularity,
                count
              }
            }
          );
          
          return response.data.candles.map(candle => ({
            timestamp: new Date(candle.time).getTime(),
            open: parseFloat(candle.mid.o),
            high: parseFloat(candle.mid.h),
            low: parseFloat(candle.mid.l),
            close: parseFloat(candle.mid.c),
            volume: candle.volume
          }));
          
        default:
          throw new Error(`Historical data not implemented for ${exchange}`);
      }
    } catch (error) {
      this.logger?.error('Error fetching historical rates:', error);
      throw error;
    }
  }

  getCurrencyPairs() {
    return {
      major: [
        'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF',
        'AUD_USD', 'USD_CAD', 'NZD_USD'
      ],
      minor: [
        'EUR_GBP', 'EUR_JPY', 'GBP_JPY', 'CHF_JPY',
        'EUR_CHF', 'AUD_JPY', 'GBP_CHF'
      ],
      exotic: [
        'USD_TRY', 'USD_ZAR', 'USD_MXN', 'USD_SEK',
        'USD_NOK', 'USD_DKK', 'USD_PLN'
      ]
    };
  }
}

module.exports = ForexCollector;