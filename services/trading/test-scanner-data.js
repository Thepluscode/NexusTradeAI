const axios = require('axios');
require('dotenv').config();

/**
 * Test what data we're getting from Alpaca for a specific stock
 */
async function testStockData(symbol) {
    const alpacaConfig = {
        apiKey: process.env.ALPACA_API_KEY,
        secretKey: process.env.ALPACA_SECRET_KEY,
        dataURL: 'https://data.alpaca.markets'
    };

    console.log(`\n🔍 Testing data for ${symbol}`);
    console.log(`Current time: ${new Date().toISOString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // Get latest bar
        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars/latest`;
        const barResponse = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: { feed: 'iex' }
        });

        const currentBar = barResponse.data.bar;
        console.log(`\n📊 Latest Bar:`);
        console.log(`   Timestamp: ${currentBar.t}`);
        console.log(`   Open: $${currentBar.o}`);
        console.log(`   High: $${currentBar.h}`);
        console.log(`   Low: $${currentBar.l}`);
        console.log(`   Close: $${currentBar.c}`);
        console.log(`   Volume: ${currentBar.v.toLocaleString()}`);

        const percentChange = ((currentBar.c - currentBar.o) / currentBar.o) * 100;
        console.log(`   Percent Change: ${percentChange.toFixed(2)}%`);

        // Get previous day's bar
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const prevDate = yesterday.toISOString().split('T')[0];

        console.log(`\n📊 Previous Day Bar (${prevDate}):`);
        const prevBarUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
        const prevBarResponse = await axios.get(prevBarUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: prevDate,
                end: prevDate,
                feed: 'iex',
                limit: 1
            }
        });

        if (prevBarResponse.data?.bars?.[0]) {
            const prevBar = prevBarResponse.data.bars[0];
            console.log(`   Timestamp: ${prevBar.t}`);
            console.log(`   Volume: ${prevBar.v.toLocaleString()}`);

            const volumeRatio = currentBar.v / prevBar.v;
            console.log(`\n📈 Volume Ratio: ${volumeRatio.toFixed(2)}x`);
        } else {
            console.log('   ⚠️ No previous day data found');
        }

        // Get intraday bars for better analysis
        const today = new Date().toISOString().split('T')[0];
        console.log(`\n📊 Intraday Bars (${today}):`);
        const intradayUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
        const intradayResponse = await axios.get(intradayUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: today,
                timeframe: '1Min',
                feed: 'iex',
                limit: 5
            }
        });

        if (intradayResponse.data?.bars?.length > 0) {
            console.log(`   Found ${intradayResponse.data.bars.length} bars`);
            const firstBar = intradayResponse.data.bars[0];
            const lastBar = intradayResponse.data.bars[intradayResponse.data.bars.length - 1];
            console.log(`   First bar: ${firstBar.t} - Open $${firstBar.o}`);
            console.log(`   Last bar: ${lastBar.t} - Close $${lastBar.c}`);

            const intradayChange = ((lastBar.c - firstBar.o) / firstBar.o) * 100;
            console.log(`   Intraday Change: ${intradayChange.toFixed(2)}%`);
        } else {
            console.log('   ⚠️ No intraday bars found');
        }

    } catch (error) {
        console.error(`❌ Error:`, error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Test SMX and a few other symbols
const symbols = ['SMX', 'AAPL', 'NVDA', 'TSLA'];

(async () => {
    for (const symbol of symbols) {
        await testStockData(symbol);
        console.log('\n');
    }
})();
