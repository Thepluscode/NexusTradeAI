require('dotenv').config();
const axios = require('axios');

const alpacaConfig = {
    baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    apiKey: process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY
};

async function checkOrders() {
    try {
        // Get recent orders
        const ordersUrl = `${alpacaConfig.baseURL}/v2/orders`;
        const response = await axios.get(ordersUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                status: 'all',
                limit: 20,
                direction: 'desc'
            }
        });

        console.log('\n📋 Recent Orders (Last 20):');
        console.log('━'.repeat(80));

        for (const order of response.data) {
            const time = new Date(order.created_at).toLocaleString();
            const filled = order.filled_at ? new Date(order.filled_at).toLocaleString() : 'Not filled';
            const fillPrice = order.filled_avg_price || 'N/A';
            const side = order.side ? order.side.toUpperCase() : 'UNKNOWN';

            console.log(`\n${order.symbol} - ${side} ${order.qty} shares`);
            console.log(`  Status: ${order.status}`);
            console.log(`  Type: ${order.type}`);
            console.log(`  Created: ${time}`);
            if (order.filled_at) {
                console.log(`  Filled: ${filled} @ $${fillPrice}`);
            }
        }
        console.log('\n' + '━'.repeat(80));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkOrders();
