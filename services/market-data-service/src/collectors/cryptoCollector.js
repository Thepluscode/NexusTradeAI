const BaseCollector = require('./baseCollector');
const ccxt = require('ccxt');

class CryptoCollector extends BaseCollector {
  getConfig() {
    return {
      exchanges: {
        binance: {
          wsUrl: 'wss://stream.binance.com:9443/ws',
          restUrl: 'https://api.binance.com',
          rateLimit: 1200, // requests per minute
          ratePeriod: 60000 // 1 minute
        },
        coinbase: {
          wsUrl: 'wss://ws-feed.pro.coinbase.com',
          restUrl: 'https://api.pro.coinbase.com',
          rateLimit: 10, // requests per second
          ratePeriod: 1000 // 1 second
        },
        kraken: {
          wsUrl: 'wss://ws.kraken.com',
          restUrl: 'https://api.kraken.com',
          rateLimit: 1, // requests per second
          ratePeriod: 1000 // 1 second
        },
        huobi: {
          wsUrl: 'wss://api.huobi.pro/ws',
          restUrl: 'https://api.huobi.pro',
          rateLimit: 100, // requests per 10 seconds
          ratePeriod: 10000 // 10 seconds
        }
      }
    };
  }

  async initialize() {
    // Initialize CCXT exchanges for REST API calls
    this.ccxtExchanges = new Map();
    
    for (const [exchangeId, config] of Object.entries(this.config.exchanges)) {
      try {
        const exchangeClass = ccxt[exchangeId];
        if (exchangeClass) {
          const exchange = new exchangeClass({
            apiKey: process.env[`${exchangeId.toUpperCase()}_API_KEY`],
            secret: process.env[`${exchangeId.toUpperCase()}_SECRET`],
            sandbox: process.env.NODE_ENV !== 'production',
            enableRateLimit: true
          });
          
          this.ccxtExchanges.set(exchangeId, exchange);
        }
      } catch (error) {
        this.logger?.warn(`Failed to initialize CCXT for ${exchangeId}:`, error);
      }
    }
  }

  processMessage(exchangeId, message) {
    switch (exchangeId) {
      case 'binance':
        return this.processBinanceMessage(message);
      case 'coinbase':
        return this.processCoinbaseMessage(message);
      case 'kraken':
        return this.processKrakenMessage(message);
      case 'huobi':
        return this.processHuobiMessage(message);
      default:
        return null;
    }
  }

  processBinanceMessage(message) {
    if (message.e === '24hrTicker') {
      return {
        dataType: 'ticker',
        symbol: message.s,
        price: parseFloat(message.c),
        change: parseFloat(message.P),
        volume: parseFloat(message.v),
        high: parseFloat(message.h),
        low: parseFloat(message.l),
        open: parseFloat(message.o),
        timestamp: message.E
      };
    }
    
    if (message.e === 'trade') {
      return {
        dataType: 'trade',
        symbol: message.s,
        price: parseFloat(message.p),
        quantity: parseFloat(message.q),
        side: message.m ? 'sell' : 'buy',
        timestamp: message.T,
        tradeId: message.t
      };
    }
    
    if (message.e === 'depthUpdate') {
      return {
        dataType: 'orderbook',
        symbol: message.s,
        bids: message.b.map(bid => [parseFloat(bid[0]), parseFloat(bid[1])]),
        asks: message.a.map(ask => [parseFloat(ask[0]), parseFloat(ask[1])]),
        timestamp: message.E
      };
    }
    
    return null;
  }

  processCoinbaseMessage(message) {
    if (message.type === 'ticker') {
      return {
        dataType: 'ticker',
        symbol: message.product_id,
        price: parseFloat(message.price),
        volume: parseFloat(message.volume_24h),
        timestamp: new Date(message.time).getTime()
      };
    }
    
    if (message.type === 'match') {
      return {
        dataType: 'trade',
        symbol: message.product_id,
        price: parseFloat(message.price),
        quantity: parseFloat(message.size),
        side: message.side,
        timestamp: new Date(message.time).getTime(),
        tradeId: message.trade_id
      };
    }
    
    if (message.type === 'l2update') {
      return {
        dataType: 'orderbook',
        symbol: message.product_id,
        changes: message.changes.map(change => ({
          side: change[0],
          price: parseFloat(change[1]),
          size: parseFloat(change[2])
        })),
        timestamp: new Date(message.time).getTime()
      };
    }
    
    return null;
  }

  processKrakenMessage(message) {
    if (Array.isArray(message) && message.length >= 2) {
      const channelData = message[1];
      const channelName = message[2];
      const pair = message[3];
      
      if (channelName === 'ticker') {
        const ticker = channelData;
        return {
          dataType: 'ticker',
          symbol: pair,
          price: parseFloat(ticker.c[0]),
          volume: parseFloat(ticker.v[1]),
          high: parseFloat(ticker.h[1]),
          low: parseFloat(ticker.l[1]),
          timestamp: Date.now()
        };
      }
      
      if (channelName === 'trade') {
        const trades = channelData;
        return trades.map(trade => ({
          dataType: 'trade',
          symbol: pair,
          price: parseFloat(trade[0]),
          quantity: parseFloat(trade[1]),
          side: trade[3] === 'b' ? 'buy' : 'sell',
          timestamp: Math.floor(parseFloat(trade[2]) * 1000)
        }));
      }
    }
    
    return null;
  }

  processHuobiMessage(message) {
    if (message.ch && message.tick) {
      const channel = message.ch;
      const data = message.tick;
      
      if (channel.includes('detail')) {
        return {
          dataType: 'ticker',
          symbol: this.extractSymbolFromChannel(channel),
          price: data.close,
          volume: data.vol,
          high: data.high,
          low: data.low,
          open: data.open,
          timestamp: message.ts
        };
      }
      
      if (channel.includes('trade.detail')) {
        return data.data.map(trade => ({
          dataType: 'trade',
          symbol: this.extractSymbolFromChannel(channel),
          price: trade.price,
          quantity: trade.amount,
          side: trade.direction,
          timestamp: trade.ts,
          tradeId: trade.id
        }));
      }
    }
    
    return null;
  }

  extractSymbolFromChannel(channel) {
    const match = channel.match(/market\.([^.]+)\./);
    return match ? match[1].toUpperCase() : '';
  }

  sendSubscriptionMessage(ws, exchange, symbol, dataTypes) {
    switch (exchange) {
      case 'binance':
        this.subscribeBinance(ws, symbol, dataTypes);
        break;
      case 'coinbase':
        this.subscribeCoinbase(ws, symbol, dataTypes);
        break;
      case 'kraken':
        this.subscribeKraken(ws, symbol, dataTypes);
        break;
      case 'huobi':
        this.subscribeHuobi(ws, symbol, dataTypes);
        break;
    }
  }

  subscribeBinance(ws, symbol, dataTypes) {
    const streams = [];
    const lowerSymbol = symbol.toLowerCase();
    
    if (dataTypes.includes('ticker')) {
      streams.push(`${lowerSymbol}@ticker`);
    }
    if (dataTypes.includes('trade')) {
      streams.push(`${lowerSymbol}@trade`);
    }
    if (dataTypes.includes('orderbook')) {
      streams.push(`${lowerSymbol}@depth@1000ms`);
    }
    
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now()
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  subscribeCoinbase(ws, symbol, dataTypes) {
    const channels = [];
    
    if (dataTypes.includes('ticker')) {
      channels.push('ticker');
    }
    if (dataTypes.includes('trade')) {
      channels.push('matches');
    }
    if (dataTypes.includes('orderbook')) {
      channels.push('level2');
    }
    
    const subscribeMessage = {
      type: 'subscribe',
      product_ids: [symbol],
      channels: channels
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  subscribeKraken(ws, symbol, dataTypes) {
    const subscriptions = [];
    
    if (dataTypes.includes('ticker')) {
      subscriptions.push({ name: 'ticker' });
    }
    if (dataTypes.includes('trade')) {
      subscriptions.push({ name: 'trade' });
    }
    if (dataTypes.includes('orderbook')) {
      subscriptions.push({ name: 'book', depth: 100 });
    }
    
    const subscribeMessage = {
      event: 'subscribe',
      pair: [symbol],
      subscription: subscriptions
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  subscribeHuobi(ws, symbol, dataTypes) {
    const lowerSymbol = symbol.toLowerCase();
    
    dataTypes.forEach(dataType => {
      let channel = '';
      
      switch (dataType) {
        case 'ticker':
          channel = `market.${lowerSymbol}.detail`;
          break;
        case 'trade':
          channel = `market.${lowerSymbol}.trade.detail`;
          break;
        case 'orderbook':
          channel = `market.${lowerSymbol}.depth.step0`;
          break;
      }
      
      if (channel) {
        const subscribeMessage = {
          sub: channel,
          id: `${symbol}-${dataType}-${Date.now()}`
        };
        
        ws.send(JSON.stringify(subscribeMessage));
      }
    });
  }

  async getHistoricalData(exchange, symbol, timeframe, since, limit) {
    const ccxtExchange = this.ccxtExchanges.get(exchange);
    
    if (!ccxtExchange) {
      throw new Error(`Exchange ${exchange} not available`);
    }
    
    try {
      const ohlcv = await ccxtExchange.fetchOHLCV(symbol, timeframe, since, limit);
      
      return ohlcv.map(candle => ({
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (error) {
      this.logger?.error(`Error fetching historical data:`, error);
      throw error;
    }
  }

  async getOrderBook(exchange, symbol, limit = 100) {
    const ccxtExchange = this.ccxtExchanges.get(exchange);
    
    if (!ccxtExchange) {
      throw new Error(`Exchange ${exchange} not available`);
    }
    
    try {
      return await ccxtExchange.fetchOrderBook(symbol, limit);
    } catch (error) {
      this.logger?.error(`Error fetching order book:`, error);
      throw error;
    }
  }

  async getTicker(exchange, symbol) {
    const ccxtExchange = this.ccxtExchanges.get(exchange);
    
    if (!ccxtExchange) {
      throw new Error(`Exchange ${exchange} not available`);
    }
    
    try {
      return await ccxtExchange.fetchTicker(symbol);
    } catch (error) {
      this.logger?.error(`Error fetching ticker:`, error);
      throw error;
    }
  }
}

module.exports = CryptoCollector;