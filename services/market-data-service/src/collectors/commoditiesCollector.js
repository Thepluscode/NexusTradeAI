const BaseCollector = require('./baseCollector');
const axios = require('axios');

class CommoditiesCollector extends BaseCollector {
  getConfig() {
    return {
      exchanges: {
        ice: {
          wsUrl: 'wss://www.theice.com/marketdatawebsocket',
          restUrl: 'https://www.theice.com/marketdata',
          rateLimit: 60, // requests per minute
          ratePeriod: 60000 // 1 minute
        },
        cme: {
          wsUrl: 'wss://api.cmegroup.com/websocket',
          restUrl: 'https://api.cmegroup.com/v1',
          rateLimit: 100, // requests per minute
          ratePeriod: 60000 // 1 minute
        },
        lme: {
          wsUrl: 'wss://live-rates.lme.com/websocket',
          restUrl: 'https://live-rates.lme.com/api',
          rateLimit: 50, // requests per minute
          ratePeriod: 60000 // 1 minute
        },
        quandl: {
          restUrl: 'https://www.quandl.com/api/v3',
          rateLimit: 300, // requests per 10 minutes
          ratePeriod: 600000 // 10 minutes
        }
      }
    };
  }

  async initialize() {
    // Initialize API clients
    this.apiClients = new Map();
    
    // Quandl (now part of Nasdaq)
    if (process.env.QUANDL_API_KEY) {
      this.apiClients.set('quandl', {
        baseURL: this.config.exchanges.quandl.restUrl,
        apiKey: process.env.QUANDL_API_KEY
      });
    }
    
    // CME Group
    if (process.env.CME_API_KEY) {
      this.apiClients.set('cme', {
        baseURL: this.config.exchanges.cme.restUrl,
        headers: {
          'X-API-KEY': process.env.CME_API_KEY
        }
      });
    }
    
    // Initialize commodity contracts mapping
    this.commodityContracts = this.getCommodityContracts();
  }

  processMessage(exchangeId, message) {
    switch (exchangeId) {
      case 'ice':
        return this.processICEMessage(message);
      case 'cme':
        return this.processCMEMessage(message);
      case 'lme':
        return this.processLMEMessage(message);
      default:
        return null;
    }
  }

  processICEMessage(message) {
    if (message.messageType === 'MarketData') {
      return {
        dataType: 'tick',
        symbol: message.symbol,
        price: parseFloat(message.lastPrice),
        volume: parseInt(message.volume),
        change: parseFloat(message.change),
        changePercent: parseFloat(message.changePercent),
        high: parseFloat(message.high),
        low: parseFloat(message.low),
        timestamp: new Date(message.timestamp).getTime()
      };
    }
    
    return null;
  }

  processCMEMessage(message) {
    if (message.type === 'quote') {
      return {
        dataType: 'quote',
        symbol: message.product,
        bid: parseFloat(message.bid),
        ask: parseFloat(message.ask),
        last: parseFloat(message.last),
        volume: parseInt(message.volume),
        openInterest: parseInt(message.openInterest),
        timestamp: new Date(message.tradeDate).getTime()
      };
    }
    
    return null;
  }

  processLMEMessage(message) {
    if (message.rates && Array.isArray(message.rates)) {
      return message.rates.map(rate => ({
        dataType: 'quote',
        symbol: rate.metal,
        bid: parseFloat(rate.bid),
        ask: parseFloat(rate.ask),
        settlement: parseFloat(rate.settlement),
        volume: parseInt(rate.volume),
        timestamp: new Date(rate.date).getTime()
      }));
    }
    
    return null;
  }

  sendSubscriptionMessage(ws, exchange, symbol, dataTypes) {
    switch (exchange) {
      case 'ice':
        this.subscribeICE(ws, symbol, dataTypes);
        break;
      case 'cme':
        this.subscribeCME(ws, symbol, dataTypes);
        break;
      case 'lme':
        this.subscribeLME(ws, symbol, dataTypes);
        break;
    }
  }

  subscribeICE(ws, symbol, dataTypes) {
    const subscribeMessage = {
      action: 'subscribe',
      symbols: [symbol]
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  subscribeCME(ws, symbol, dataTypes) {
    const subscribeMessage = {
      op: 'subscribe',
      channel: 'quotes',
      symbol: symbol
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  subscribeLME(ws, symbol, dataTypes) {
    const subscribeMessage = {
      subscribe: {
        metal: symbol,
        type: 'live'
      }
    };
    
    ws.send(JSON.stringify(subscribeMessage));
  }

  async getCommodityPrice(commodity, exchange = 'quandl') {
    const client = this.apiClients.get(exchange);
    if (!client) {
      throw new Error(`Exchange ${exchange} not configured`);
    }

    try {
      switch (exchange) {
        case 'quandl':
          const dataset = this.getQuandlDataset(commodity);
          const response = await axios.get(
            `${client.baseURL}/datasets/${dataset}.json`,
            {
              params: {
                api_key: client.apiKey,
                limit: 1
              }
            }
          );
          
          const data = response.data.dataset.data[0];
          return {
            symbol: commodity,
            price: parseFloat(data[1]),
            date: data[0],
            timestamp: new Date(data[0]).getTime()
          };
          
        default:
          throw new Error(`Price fetching not implemented for ${exchange}`);
      }
    } catch (error) {
      this.logger?.error(`Error fetching ${commodity} price:`, error);
      throw error;
    }
  }

  async getHistoricalPrices(commodity, startDate, endDate, exchange = 'quandl') {
    const client = this.apiClients.get(exchange);
    if (!client) {
      throw new Error(`Exchange ${exchange} not configured`);
    }

    try {
      switch (exchange) {
        case 'quandl':
          const dataset = this.getQuandlDataset(commodity);
          const response = await axios.get(
            `${client.baseURL}/datasets/${dataset}.json`,
            {
              params: {
                api_key: client.apiKey,
                start_date: startDate,
                end_date: endDate
              }
            }
          );
          
          return response.data.dataset.data.map(row => ({
            date: row[0],
            price: parseFloat(row[1]),
            timestamp: new Date(row[0]).getTime()
          }));
          
        default:
          throw new Error(`Historical data not implemented for ${exchange}`);
      }
    } catch (error) {
      this.logger?.error('Error fetching historical commodity prices:', error);
      throw error;
    }
  }

  getQuandlDataset(commodity) {
    const datasets = {
      'WTI_CRUDE': 'EIA/PET_RWTC_D',
      'BRENT_CRUDE': 'EIA/PET_RBRTE_D',
      'NATURAL_GAS': 'EIA/NG_RNGWHHD_D',
      'GOLD': 'LBMA/GOLD',
      'SILVER': 'LBMA/SILVER',
      'COPPER': 'LME/PR_CU',
      'ALUMINUM': 'LME/PR_AL',
      'CORN': 'CHRIS/CME_C1',
      'WHEAT': 'CHRIS/CME_W1',
      'SOYBEANS': 'CHRIS/CME_S1'
    };
    
    return datasets[commodity] || commodity;
  }

  getCommodityContracts() {
    return {
      energy: {
        'WTI_CRUDE': {
          symbol: 'CL',
          exchange: 'NYMEX',
          unit: 'Barrel',
          currency: 'USD'
        },
        'BRENT_CRUDE': {
          symbol: 'BZ',
          exchange: 'ICE',
          unit: 'Barrel',
          currency: 'USD'
        },
        'NATURAL_GAS': {
          symbol: 'NG',
          exchange: 'NYMEX',
          unit: 'MMBtu',
          currency: 'USD'
        },
        'HEATING_OIL': {
          symbol: 'HO',
          exchange: 'NYMEX',
          unit: 'Gallon',
          currency: 'USD'
        }
      },
      metals: {
        'GOLD': {
          symbol: 'GC',
          exchange: 'COMEX',
          unit: 'Troy Ounce',
          currency: 'USD'
        },
        'SILVER': {
          symbol: 'SI',
          exchange: 'COMEX',
          unit: 'Troy Ounce',
          currency: 'USD'
        },
        'COPPER': {
          symbol: 'HG',
          exchange: 'COMEX',
          unit: 'Pound',
          currency: 'USD'
        },
        'PLATINUM': {
          symbol: 'PL',
          exchange: 'NYMEX',
          unit: 'Troy Ounce',
          currency: 'USD'
        }
      },
      agriculture: {
        'CORN': {
          symbol: 'C',
          exchange: 'CBOT',
          unit: 'Bushel',
          currency: 'USD'
        },
        'WHEAT': {
          symbol: 'W',
          exchange: 'CBOT',
          unit: 'Bushel',
          currency: 'USD'
        },
        'SOYBEANS': {
          symbol: 'S',
          exchange: 'CBOT',
          unit: 'Bushel',
          currency: 'USD'
        },
        'SUGAR': {
          symbol: 'SB',
          exchange: 'ICE',
          unit: 'Pound',
          currency: 'USD'
        }
      }
    };
  }

  getSupportedCommodities() {
    const contracts = this.getCommodityContracts();
    const supported = {};
    
    for (const [category, commodities] of Object.entries(contracts)) {
      supported[category] = Object.keys(commodities);
    }
    
    return supported;
  }

  async getCommodityFutures(commodity, months = 6) {
    try {
      const contract = this.findCommodityContract(commodity);
      if (!contract) {
        throw new Error(`Commodity ${commodity} not found`);
      }
      
      // Generate future contract symbols
      const futures = [];
      const now = new Date();
      
      for (let i = 0; i < months; i++) {
        const futureDate = new Date(now);
        futureDate.setMonth(now.getMonth() + i);
        
        const contractSymbol = this.generateFutureSymbol(contract.symbol, futureDate);
        futures.push({
          symbol: contractSymbol,
          expiry: futureDate,
          underlying: commodity
        });
      }
      
      return futures;
    } catch (error) {
      this.logger?.error('Error getting commodity futures:', error);
      throw error;
    }
  }

  findCommodityContract(commodity) {
    const contracts = this.getCommodityContracts();
    
    for (const category of Object.values(contracts)) {
      if (category[commodity]) {
        return category[commodity];
      }
    }
    
    return null;
  }

  generateFutureSymbol(baseSymbol, expiryDate) {
    const monthCodes = {
      0: 'F', 1: 'G', 2: 'H', 3: 'J', 4: 'K', 5: 'M',
      6: 'N', 7: 'Q', 8: 'U', 9: 'V', 10: 'X', 11: 'Z'
    };
    
    const monthCode = monthCodes[expiryDate.getMonth()];
    const yearCode = expiryDate.getFullYear().toString().slice(-1);
    
    return `${baseSymbol}${monthCode}${yearCode}`;
  }
}

module.exports = CommoditiesCollector;
