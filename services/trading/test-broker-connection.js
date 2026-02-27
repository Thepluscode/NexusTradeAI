#!/usr/bin/env node
/**
 * Broker Connection Test Script
 * Tests connection to MetaTrader, IBKR, or Kraken
 *
 * Usage:
 *   node test-broker-connection.js metatrader
 *   node test-broker-connection.js ibkr
 *   node test-broker-connection.js kraken
 *   node test-broker-connection.js all
 */

require('dotenv').config();
const BrokerFactory = require('./brokers/broker-factory');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(title) {
    log('\n' + '='.repeat(60), 'cyan');
    log(`  ${title}`, 'bright');
    log('='.repeat(60) + '\n', 'cyan');
}

function printSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function printError(message) {
    log(`❌ ${message}`, 'red');
}

function printInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

function printWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

async function testMetaTrader() {
    printHeader('Testing MetaTrader Connection');

    try {
        // Check environment variables
        const useMetaApi = process.env.MT_USE_METAAPI !== 'false';

        if (useMetaApi) {
            if (!process.env.METAAPI_TOKEN || !process.env.MT_ACCOUNT_ID) {
                printError('Missing MetaApi credentials');
                printInfo('Required: METAAPI_TOKEN and MT_ACCOUNT_ID');
                printInfo('Get them from: https://metaapi.cloud');
                return false;
            }
            printInfo(`Using MetaApi Cloud`);
            printInfo(`Account ID: ${process.env.MT_ACCOUNT_ID}`);
        } else {
            printInfo(`Using ZeroMQ`);
            printInfo(`Host: ${process.env.MT_ZMQ_HOST || 'localhost'}`);
            printInfo(`Ports: ${process.env.MT_ZMQ_REQ_PORT || 5555}, ${process.env.MT_ZMQ_PUSH_PORT || 5556}`);
        }

        const factory = new BrokerFactory();

        printInfo('Connecting...');
        const broker = await factory.connect('metatrader', {
            useMetaApi,
            metaApiToken: process.env.METAAPI_TOKEN,
            accountId: process.env.MT_ACCOUNT_ID,
            platform: process.env.MT_PLATFORM || 'MT5'
        });

        printSuccess('Connected to MetaTrader!');

        // Get account info
        printInfo('Fetching account info...');
        const accountInfo = await broker.getAccountInfo();
        printSuccess(`Account Balance: $${accountInfo.balance.toFixed(2)}`);
        printInfo(`Equity: $${accountInfo.equity.toFixed(2)}`);
        printInfo(`Leverage: 1:${accountInfo.leverage || 'N/A'}`);

        // Test market data
        printInfo('Testing market data for EURUSD...');
        const price = await broker.getCurrentPrice('EURUSD');
        printSuccess(`EURUSD Price: ${price.toFixed(5)}`);

        // Disconnect
        await broker.disconnect();
        printSuccess('MetaTrader test completed successfully!');

        return true;

    } catch (error) {
        printError(`MetaTrader test failed: ${error.message}`);
        console.error(error);
        return false;
    }
}

async function testIBKR() {
    printHeader('Testing Interactive Brokers Connection');

    try {
        // Check environment variables
        if (!process.env.IBKR_HOST || !process.env.IBKR_PORT) {
            printWarning('Using default IBKR settings (localhost:7497)');
        }

        printInfo(`Host: ${process.env.IBKR_HOST || '127.0.0.1'}`);
        printInfo(`Port: ${process.env.IBKR_PORT || '7497'} (${process.env.IBKR_IS_PAPER !== 'false' ? 'Paper' : 'Live'})`);
        printInfo(`Client ID: ${process.env.IBKR_CLIENT_ID || '0'}`);

        printWarning('Make sure TWS or IB Gateway is running!');
        printInfo('Connecting...');

        const factory = new BrokerFactory();

        const broker = await factory.connect('ibkr', {
            host: process.env.IBKR_HOST,
            port: process.env.IBKR_PORT,
            clientId: process.env.IBKR_CLIENT_ID,
            accountId: process.env.IBKR_ACCOUNT_ID,
            isPaper: process.env.IBKR_IS_PAPER !== 'false'
        });

        printSuccess('Connected to Interactive Brokers!');

        // Get account info
        printInfo('Fetching account info...');
        const accountInfo = await broker.getAccountInfo();
        printSuccess(`Account Value: $${accountInfo.totalValue?.toFixed(2) || 'N/A'}`);
        printInfo(`Cash: $${accountInfo.cashBalance?.toFixed(2) || 'N/A'}`);

        // Test market data
        printInfo('Testing market data for AAPL...');
        const price = await broker.getCurrentPrice('AAPL');
        printSuccess(`AAPL Price: $${price.toFixed(2)}`);

        // Disconnect
        await broker.disconnect();
        printSuccess('IBKR test completed successfully!');

        return true;

    } catch (error) {
        printError(`IBKR test failed: ${error.message}`);

        if (error.message.includes('connect')) {
            printWarning('Connection failed. Please check:');
            printInfo('1. TWS or IB Gateway is running');
            printInfo('2. API is enabled in TWS (Configure → API → Settings)');
            printInfo('3. Port number is correct (7497 for paper, 7496 for live)');
        }

        return false;
    }
}

async function testKraken() {
    printHeader('Testing Kraken Connection');

    try {
        // Check environment variables
        if (!process.env.KRAKEN_API_KEY || !process.env.KRAKEN_API_SECRET) {
            printError('Missing Kraken credentials');
            printInfo('Required: KRAKEN_API_KEY and KRAKEN_API_SECRET');
            printInfo('Get them from: https://www.kraken.com → Settings → API');
            return false;
        }

        printInfo(`API Key: ${process.env.KRAKEN_API_KEY.substring(0, 8)}...`);
        printInfo('Connecting...');

        const factory = new BrokerFactory();

        const broker = await factory.connect('kraken', {
            apiKey: process.env.KRAKEN_API_KEY,
            apiSecret: process.env.KRAKEN_API_SECRET,
            otp: process.env.KRAKEN_OTP
        });

        printSuccess('Connected to Kraken!');

        // Get account info
        printInfo('Fetching account info...');
        const accountInfo = await broker.getAccountInfo();
        printSuccess(`Account has ${Object.keys(accountInfo.balances).length} assets`);

        // Show non-zero balances
        for (const [asset, amount] of Object.entries(accountInfo.balances)) {
            if (amount > 0) {
                printInfo(`${asset}: ${amount}`);
            }
        }

        // Test market data
        printInfo('Testing market data for BTC/USD...');
        const price = await broker.getCurrentPrice('BTCUSD');
        printSuccess(`BTC/USD Price: $${price.toFixed(2)}`);

        // Disconnect
        await broker.disconnect();
        printSuccess('Kraken test completed successfully!');

        return true;

    } catch (error) {
        printError(`Kraken test failed: ${error.message}`);

        if (error.message.includes('Invalid key')) {
            printWarning('API key invalid. Please check:');
            printInfo('1. API key and secret are correct');
            printInfo('2. API permissions include Query Funds and Orders');
            printInfo('3. No extra whitespace in .env file');
        } else if (error.message.includes('nonce')) {
            printWarning('Nonce error - time sync issue');
            printInfo('Run: sudo ntpdate -s time.nist.gov');
        }

        return false;
    }
}

async function testAll() {
    printHeader('Testing All Broker Connections');

    const results = {
        metatrader: await testMetaTrader(),
        ibkr: await testIBKR(),
        kraken: await testKraken()
    };

    // Summary
    printHeader('Test Summary');

    let passed = 0;
    let failed = 0;

    for (const [broker, success] of Object.entries(results)) {
        if (success) {
            printSuccess(`${broker.toUpperCase()}: Passed`);
            passed++;
        } else {
            printError(`${broker.toUpperCase()}: Failed`);
            failed++;
        }
    }

    log('\n' + '-'.repeat(60), 'cyan');
    log(`Total: ${passed} passed, ${failed} failed`, passed === 3 ? 'green' : 'yellow');
    log('-'.repeat(60) + '\n', 'cyan');

    return passed === 3;
}

async function main() {
    const brokerType = process.argv[2]?.toLowerCase();

    if (!brokerType) {
        printError('Please specify a broker type');
        printInfo('Usage: node test-broker-connection.js [metatrader|ibkr|kraken|all]');
        printInfo('Example: node test-broker-connection.js kraken');
        process.exit(1);
    }

    let success = false;

    try {
        switch (brokerType) {
            case 'metatrader':
            case 'mt4':
            case 'mt5':
                success = await testMetaTrader();
                break;

            case 'ibkr':
            case 'interactivebrokers':
                success = await testIBKR();
                break;

            case 'kraken':
                success = await testKraken();
                break;

            case 'all':
                success = await testAll();
                break;

            default:
                printError(`Unknown broker type: ${brokerType}`);
                printInfo('Supported: metatrader, ibkr, kraken, all');
                process.exit(1);
        }

        if (success) {
            log('\n🎉 All tests passed! You\'re ready to trade!', 'green');
            process.exit(0);
        } else {
            log('\n❌ Some tests failed. Please check the errors above.', 'red');
            process.exit(1);
        }

    } catch (error) {
        printError(`Unexpected error: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { testMetaTrader, testIBKR, testKraken, testAll };
