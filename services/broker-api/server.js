const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Encryption key for storing API credentials securely
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const IV_LENGTH = 16;

// Encrypt function
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

// Decrypt function
function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Store broker configurations
const configPath = path.join(__dirname, 'broker-configs.json');

// Load broker configurations
async function loadBrokerConfigs() {
    try {
        const data = await fs.readFile(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Save broker configurations
async function saveBrokerConfigs(configs) {
    await fs.writeFile(configPath, JSON.stringify(configs, null, 2));
}

// Test Alpaca connection
async function testAlpacaConnection(apiKey, secretKey, paperTrading = true) {
    try {
        const baseUrl = paperTrading ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
        
        const response = await fetch(`${baseUrl}/v2/account`, {
            headers: {
                'APCA-API-KEY-ID': apiKey,
                'APCA-API-SECRET-KEY': secretKey
            }
        });

        if (response.ok) {
            const accountData = await response.json();
            return {
                success: true,
                accountType: paperTrading ? 'Paper Trading' : 'Live Trading',
                account: accountData
            };
        } else {
            const error = await response.text();
            return {
                success: false,
                error: `HTTP ${response.status}: ${error}`
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Get Alpaca account data
async function getAlpacaAccount(apiKey, secretKey, paperTrading = true) {
    try {
        const baseUrl = paperTrading ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
        
        const response = await fetch(`${baseUrl}/v2/account`, {
            headers: {
                'APCA-API-KEY-ID': apiKey,
                'APCA-API-SECRET-KEY': secretKey
            }
        });

        if (response.ok) {
            const accountData = await response.json();
            return {
                success: true,
                account: {
                    equity: accountData.equity,
                    cash: accountData.cash,
                    buying_power: accountData.buying_power,
                    portfolio_value: accountData.portfolio_value,
                    day_trade_count: accountData.daytrade_count || 0
                }
            };
        } else {
            return { success: false, error: 'Failed to fetch account data' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// API Routes

// Test Alpaca connection
app.post('/api/broker/test-alpaca', async (req, res) => {
    try {
        const { apiKey, secretKey, paperTrading } = req.body;
        
        if (!apiKey || !secretKey) {
            return res.json({ success: false, error: 'API Key and Secret Key are required' });
        }

        const result = await testAlpacaConnection(apiKey, secretKey, paperTrading);
        res.json(result);
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Connect Alpaca broker
app.post('/api/broker/connect-alpaca', async (req, res) => {
    try {
        const { apiKey, secretKey, paperTrading } = req.body;
        
        if (!apiKey || !secretKey) {
            return res.json({ success: false, error: 'API Key and Secret Key are required' });
        }

        // Test connection first
        const testResult = await testAlpacaConnection(apiKey, secretKey, paperTrading);
        if (!testResult.success) {
            return res.json({ success: false, error: 'Connection test failed: ' + testResult.error });
        }

        // Save encrypted credentials
        const configs = await loadBrokerConfigs();
        configs.alpaca = {
            apiKey: encrypt(apiKey),
            secretKey: encrypt(secretKey),
            paperTrading: paperTrading,
            connected: true,
            connectedAt: new Date().toISOString()
        };

        await saveBrokerConfigs(configs);

        res.json({ 
            success: true, 
            message: 'Alpaca broker connected successfully',
            accountType: paperTrading ? 'Paper Trading' : 'Live Trading'
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get broker status
app.get('/api/broker/status', async (req, res) => {
    try {
        const configs = await loadBrokerConfigs();
        
        const brokers = [];
        
        if (configs.alpaca && configs.alpaca.connected) {
            brokers.push({
                id: 'alpaca',
                name: 'Alpaca Markets',
                type: configs.alpaca.paperTrading ? 'Paper Trading' : 'Live Trading',
                status: 'connected',
                connectedAt: configs.alpaca.connectedAt
            });
        }

        res.json({
            success: true,
            brokers: brokers,
            totalBrokers: brokers.length
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get Alpaca account data
app.get('/api/broker/alpaca/account', async (req, res) => {
    try {
        const configs = await loadBrokerConfigs();
        
        if (!configs.alpaca || !configs.alpaca.connected) {
            return res.json({ success: false, error: 'Alpaca not connected' });
        }

        const apiKey = decrypt(configs.alpaca.apiKey);
        const secretKey = decrypt(configs.alpaca.secretKey);
        const paperTrading = configs.alpaca.paperTrading;

        const result = await getAlpacaAccount(apiKey, secretKey, paperTrading);
        res.json(result);
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Test existing connection
app.get('/api/broker/test-connection/alpaca', async (req, res) => {
    try {
        const configs = await loadBrokerConfigs();
        
        if (!configs.alpaca || !configs.alpaca.connected) {
            return res.json({ success: false, error: 'Alpaca not connected' });
        }

        const apiKey = decrypt(configs.alpaca.apiKey);
        const secretKey = decrypt(configs.alpaca.secretKey);
        const paperTrading = configs.alpaca.paperTrading;

        const result = await testAlpacaConnection(apiKey, secretKey, paperTrading);
        res.json(result);
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Disconnect broker
app.post('/api/broker/disconnect/:brokerId', async (req, res) => {
    try {
        const { brokerId } = req.params;
        const configs = await loadBrokerConfigs();
        
        if (configs[brokerId]) {
            configs[brokerId].connected = false;
            await saveBrokerConfigs(configs);
            res.json({ success: true, message: `${brokerId} disconnected successfully` });
        } else {
            res.json({ success: false, error: 'Broker not found' });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'broker-api', port: PORT });
});

// Start server
app.listen(PORT, () => {
    console.log(`🏦 Broker API Server running on port ${PORT}`);
    console.log(`📊 Endpoints available:`);
    console.log(`   POST /api/broker/test-alpaca - Test Alpaca connection`);
    console.log(`   POST /api/broker/connect-alpaca - Connect Alpaca broker`);
    console.log(`   GET  /api/broker/status - Get broker status`);
    console.log(`   GET  /api/broker/alpaca/account - Get Alpaca account data`);
    console.log(`   GET  /health - Health check`);
});

module.exports = app;
