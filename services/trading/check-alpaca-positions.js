const axios = require('axios');
require('dotenv').config();

async function checkAlpacaPositions() {
    const config = {
        baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
        apiKey: process.env.ALPACA_API_KEY,
        secretKey: process.env.ALPACA_SECRET_KEY
    };

    console.log('\n📊 Checking Real Alpaca Account Positions...\n');

    try {
        // Get positions
        const positionsUrl = `${config.baseURL}/v2/positions`;
        const response = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': config.apiKey,
                'APCA-API-SECRET-KEY': config.secretKey
            }
        });

        if (response.data.length === 0) {
            console.log('❌ No positions found in Alpaca account');
            console.log('   This means the orders may not have been filled yet');
            return;
        }

        console.log(`✅ Found ${response.data.length} active position(s):\n`);

        for (const position of response.data) {
            const currentPrice = parseFloat(position.current_price);
            const avgEntry = parseFloat(position.avg_entry_price);
            const unrealizedPL = parseFloat(position.unrealized_pl);
            const unrealizedPLPercent = parseFloat(position.unrealized_plpc) * 100;

            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📈 ${position.symbol}`);
            console.log(`   Shares: ${position.qty}`);
            console.log(`   Entry: $${avgEntry.toFixed(2)}`);
            console.log(`   Current: $${currentPrice.toFixed(2)}`);
            console.log(`   P/L: ${unrealizedPL >= 0 ? '+' : ''}$${unrealizedPL.toFixed(2)} (${unrealizedPLPercent >= 0 ? '+' : ''}${unrealizedPLPercent.toFixed(2)}%)`);
            console.log(`   Market Value: $${position.market_value}`);
        }

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // Get account info
        const accountUrl = `${config.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': config.apiKey,
                'APCA-API-SECRET-KEY': config.secretKey
            }
        });

        const equity = parseFloat(accountResponse.data.equity);
        const cash = parseFloat(accountResponse.data.cash);
        const buyingPower = parseFloat(accountResponse.data.buying_power);

        console.log(`\n💰 Account Summary:`);
        console.log(`   Equity: $${equity.toFixed(2)}`);
        console.log(`   Cash: $${cash.toFixed(2)}`);
        console.log(`   Buying Power: $${buyingPower.toFixed(2)}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

checkAlpacaPositions();
