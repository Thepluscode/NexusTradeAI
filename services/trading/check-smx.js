const axios = require('axios');
require('dotenv').config();

async function checkSMX() {
    const alpacaConfig = {
        apiKey: process.env.ALPACA_API_KEY,
        secretKey: process.env.ALPACA_SECRET_KEY,
        dataURL: 'https://data.alpaca.markets'
    };

    const symbol = 'SMX';
    const today = new Date().toISOString().split('T')[0];

    console.log(`\n🔍 Checking ${symbol} - ${new Date().toLocaleString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // Get today's intraday bars
        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
        const barResponse = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: today,
                timeframe: '1Min',
                feed: 'iex',
                limit: 10000
            }
        });

        if (!barResponse.data || !barResponse.data.bars || barResponse.data.bars.length === 0) {
            console.log('❌ No intraday data available yet');
            return;
        }

        const bars = barResponse.data.bars;
        const firstBar = bars[0];
        const lastBar = bars[bars.length - 1];

        const todayOpen = firstBar.o;
        const current = lastBar.c;
        const volumeToday = bars.reduce((sum, bar) => sum + bar.v, 0);

        console.log(`\n📊 Today's Data:`);
        console.log(`   Market Open: $${todayOpen.toFixed(2)}`);
        console.log(`   Current Price: $${current.toFixed(2)}`);
        console.log(`   Volume So Far: ${volumeToday.toLocaleString()}`);
        console.log(`   Number of bars: ${bars.length}`);

        const percentChange = ((current - todayOpen) / todayOpen) * 100;
        console.log(`   📈 Intraday Change: ${percentChange.toFixed(2)}%`);

        // Get yesterday's volume
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const prevDate = yesterday.toISOString().split('T')[0];

        const prevBarUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
        const prevBarResponse = await axios.get(prevBarUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: prevDate,
                end: prevDate,
                timeframe: '1Day',
                feed: 'iex',
                limit: 1
            }
        });

        if (prevBarResponse.data?.bars?.[0]) {
            const prevVolume = prevBarResponse.data.bars[0].v;
            const volumeRatio = volumeToday / prevVolume;

            console.log(`\n📊 Yesterday's Data:`);
            console.log(`   Full Day Volume: ${prevVolume.toLocaleString()}`);
            console.log(`   📊 Volume Ratio: ${volumeRatio.toFixed(2)}x`);

            console.log(`\n✅ Scanner Criteria Check:`);
            console.log(`   Percent Change: ${percentChange.toFixed(2)}% ${percentChange >= 5.0 ? '✅' : '❌'} (need 5%+)`);
            console.log(`   Volume Ratio: ${volumeRatio.toFixed(2)}x ${volumeRatio >= 3.0 ? '✅' : '❌'} (need 3x+)`);

            if (percentChange >= 5.0 && volumeRatio >= 3.0) {
                console.log(`\n🚀 ${symbol} WOULD TRIGGER A TRADE!`);
            } else {
                console.log(`\n⏳ ${symbol} does not meet criteria yet`);
            }
        }

    } catch (error) {
        console.error(`❌ Error:`, error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

checkSMX();
