/**
 * Yahoo Finance Data Service
 * ==========================
 * Provides FREE real-time and historical data for Forex and Crypto
 * using Yahoo Finance API (no subscription required)
 * 
 * Usage:
 *   const yahooData = require('./yahoo-finance-data');
 *   const quote = await yahooData.getQuote('EURUSD=X');
 *   const history = await yahooData.getHistory('BTC-USD', 30);
 */

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

// Symbol mappings - Yahoo Finance uses different format
const FOREX_SYMBOLS = {
    'EURUSD': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X',
    'USDJPY': 'USDJPY=X',
    'USDCHF': 'USDCHF=X',
    'AUDUSD': 'AUDUSD=X',
    'USDCAD': 'USDCAD=X',
    'NZDUSD': 'NZDUSD=X',
    'EURGBP': 'EURGBP=X',
    'EURJPY': 'EURJPY=X',
    'GBPJPY': 'GBPJPY=X'
};

const CRYPTO_SYMBOLS = {
    'BTCUSD': 'BTC-USD',
    'ETHUSD': 'ETH-USD',
    'SOLUSD': 'SOL-USD',
    'AVAXUSD': 'AVAX-USD',
    'LINKUSD': 'LINK-USD',
    'DOTUSD': 'DOT-USD',
    'MATICUSD': 'MATIC-USD',
    'ADAUSD': 'ADA-USD',
    'DOGEUSD': 'DOGE-USD',
    'SHIBUSD': 'SHIB-USD'
};

/**
 * Convert internal symbol to Yahoo Finance symbol
 */
function toYahooSymbol(symbol) {
    if (FOREX_SYMBOLS[symbol]) return FOREX_SYMBOLS[symbol];
    if (CRYPTO_SYMBOLS[symbol]) return CRYPTO_SYMBOLS[symbol];
    // Already Yahoo format
    if (symbol.includes('=X') || symbol.includes('-USD')) return symbol;
    return symbol;
}

/**
 * Get real-time quote for a forex or crypto symbol
 */
async function getQuote(symbol) {
    try {
        const yahooSymbol = toYahooSymbol(symbol);
        const quote = await yahooFinance.quote(yahooSymbol);

        if (!quote) {
            throw new Error('No quote data returned');
        }

        return {
            symbol: symbol,
            yahooSymbol: yahooSymbol,
            price: quote.regularMarketPrice,
            bid: quote.bid || quote.regularMarketPrice * 0.9999,
            ask: quote.ask || quote.regularMarketPrice * 1.0001,
            change: quote.regularMarketChange,
            changePercent: quote.regularMarketChangePercent,
            high: quote.regularMarketDayHigh,
            low: quote.regularMarketDayLow,
            open: quote.regularMarketOpen,
            previousClose: quote.regularMarketPreviousClose,
            timestamp: new Date()
        };
    } catch (error) {
        console.error(`Yahoo Finance quote error for ${symbol}: ${error.message}`);
        return null;
    }
}

/**
 * Get historical price data
 * @param {string} symbol - Trading symbol
 * @param {number} days - Number of days of history (default 30)
 * @param {string} interval - '1d', '1wk', '1m', etc. (default '1d')
 */
async function getHistory(symbol, days = 30, interval = '1d') {
    try {
        const yahooSymbol = toYahooSymbol(symbol);

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const history = await yahooFinance.chart(yahooSymbol, {
            period1: startDate,
            period2: endDate,
            interval: interval
        });

        if (!history || !history.quotes || history.quotes.length === 0) {
            console.log(`No history data for ${symbol}`);
            return [];
        }

        // Convert to our standard format
        return history.quotes.map(bar => ({
            timestamp: new Date(bar.date),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume || 0
        })).filter(bar => bar.close !== null && bar.close !== undefined);

    } catch (error) {
        console.error(`Yahoo Finance history error for ${symbol}: ${error.message}`);
        return [];
    }
}

/**
 * Get quotes for multiple symbols at once
 */
async function getMultipleQuotes(symbols) {
    const results = {};

    // Process in batches to avoid rate limiting
    for (const symbol of symbols) {
        try {
            const quote = await getQuote(symbol);
            if (quote) {
                results[symbol] = quote;
            }
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
        } catch (error) {
            console.error(`Failed to get quote for ${symbol}: ${error.message}`);
        }
    }

    return results;
}

/**
 * Get history for multiple symbols
 */
async function getMultipleHistory(symbols, days = 30) {
    const results = {};

    for (const symbol of symbols) {
        try {
            const history = await getHistory(symbol, days);
            if (history && history.length > 0) {
                results[symbol] = history;
            }
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`Failed to get history for ${symbol}: ${error.message}`);
        }
    }

    return results;
}

/**
 * Check if Yahoo Finance is available
 */
async function testConnection() {
    try {
        const quote = await getQuote('EURUSD');
        return quote !== null;
    } catch (error) {
        return false;
    }
}

module.exports = {
    getQuote,
    getHistory,
    getMultipleQuotes,
    getMultipleHistory,
    testConnection,
    toYahooSymbol,
    FOREX_SYMBOLS,
    CRYPTO_SYMBOLS
};
