#!/usr/bin/env node

/**
 * NexusTradeAI - Broker Setup Wizard
 * 
 * Interactive wizard to help users connect brokers to the trading platform
 */

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { MultiBrokerManager } = require('../broker-connector/BrokerConnector');

class BrokerSetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.brokerManager = new MultiBrokerManager();
    this.supportedBrokers = [
      {
        id: 'alpaca',
        name: 'Alpaca Markets',
        description: 'Commission-free US stocks and crypto trading',
        requirements: ['API Key', 'Secret Key'],
        website: 'https://alpaca.markets',
        paperTrading: true
      },
      {
        id: 'binance',
        name: 'Binance',
        description: 'World\'s largest cryptocurrency exchange',
        requirements: ['API Key', 'Secret Key'],
        website: 'https://binance.com',
        paperTrading: false
      },
      {
        id: 'interactivebrokers',
        name: 'Interactive Brokers',
        description: 'Professional trading platform with global markets',
        requirements: ['TWS/Gateway', 'Client ID'],
        website: 'https://interactivebrokers.com',
        paperTrading: true
      },
      {
        id: 'tdameritrade',
        name: 'TD Ameritrade',
        description: 'Full-service broker with advanced tools',
        requirements: ['API Key', 'Refresh Token'],
        website: 'https://developer.tdameritrade.com',
        paperTrading: true
      }
    ];
  }

  async start() {
    console.log('\n🔗 NexusTradeAI Broker Setup Wizard');
    console.log('=====================================\n');
    
    console.log('This wizard will help you connect brokers to your trading platform.\n');
    
    try {
      await this.showMainMenu();
    } catch (error) {
      console.error('❌ Setup error:', error.message);
    } finally {
      this.rl.close();
    }
  }

  async showMainMenu() {
    console.log('📋 Available Options:');
    console.log('1. View supported brokers');
    console.log('2. Connect a new broker');
    console.log('3. Test existing connections');
    console.log('4. View connection status');
    console.log('5. Generate environment file');
    console.log('6. Exit\n');

    const choice = await this.question('Select an option (1-6): ');

    switch (choice) {
      case '1':
        await this.showSupportedBrokers();
        break;
      case '2':
        await this.connectBroker();
        break;
      case '3':
        await this.testConnections();
        break;
      case '4':
        await this.showConnectionStatus();
        break;
      case '5':
        await this.generateEnvFile();
        break;
      case '6':
        console.log('👋 Goodbye!');
        return;
      default:
        console.log('❌ Invalid option. Please try again.\n');
        await this.showMainMenu();
    }
  }

  async showSupportedBrokers() {
    console.log('\n🏦 Supported Brokers:');
    console.log('====================\n');

    this.supportedBrokers.forEach((broker, index) => {
      console.log(`${index + 1}. ${broker.name}`);
      console.log(`   📝 ${broker.description}`);
      console.log(`   🔑 Requirements: ${broker.requirements.join(', ')}`);
      console.log(`   🌐 Website: ${broker.website}`);
      console.log(`   📊 Paper Trading: ${broker.paperTrading ? 'Yes' : 'No'}`);
      console.log('');
    });

    await this.question('Press Enter to continue...');
    await this.showMainMenu();
  }

  async connectBroker() {
    console.log('\n🔗 Connect a Broker');
    console.log('==================\n');

    console.log('Select a broker to connect:');
    this.supportedBrokers.forEach((broker, index) => {
      console.log(`${index + 1}. ${broker.name}`);
    });

    const choice = await this.question('\nEnter broker number: ');
    const brokerIndex = parseInt(choice) - 1;

    if (brokerIndex < 0 || brokerIndex >= this.supportedBrokers.length) {
      console.log('❌ Invalid broker selection.\n');
      await this.connectBroker();
      return;
    }

    const selectedBroker = this.supportedBrokers[brokerIndex];
    await this.setupBroker(selectedBroker);
  }

  async setupBroker(broker) {
    console.log(`\n🔧 Setting up ${broker.name}`);
    console.log('='.repeat(20 + broker.name.length));
    console.log(`\n📝 ${broker.description}`);
    console.log(`🌐 Website: ${broker.website}\n`);

    const config = {};

    switch (broker.id) {
      case 'alpaca':
        await this.setupAlpaca(config);
        break;
      case 'binance':
        await this.setupBinance(config);
        break;
      case 'interactivebrokers':
        await this.setupInteractiveBrokers(config);
        break;
      case 'tdameritrade':
        await this.setupTDAmeritrade(config);
        break;
    }

    // Test connection
    console.log('\n🧪 Testing connection...');
    try {
      this.brokerManager.addBroker(broker.id, broker.id, config);
      const broker_instance = this.brokerManager.getBroker(broker.id);
      const connected = await broker_instance.connect();

      if (connected) {
        console.log(`✅ Successfully connected to ${broker.name}!`);
        await this.saveConfig(broker.id, config);
      } else {
        console.log(`❌ Failed to connect to ${broker.name}`);
      }
    } catch (error) {
      console.log(`❌ Connection error: ${error.message}`);
    }

    await this.question('\nPress Enter to continue...');
    await this.showMainMenu();
  }

  async setupAlpaca(config) {
    console.log('🔑 Alpaca API Credentials');
    console.log('To get your API credentials:');
    console.log('1. Go to https://app.alpaca.markets');
    console.log('2. Sign up or log in');
    console.log('3. Go to "API Keys" in your dashboard');
    console.log('4. Generate new API key\n');

    config.apiKey = await this.question('Enter your Alpaca API Key: ');
    config.secretKey = await this.question('Enter your Alpaca Secret Key: ');
    
    const paperTrading = await this.question('Use paper trading? (y/n): ');
    config.paper = paperTrading.toLowerCase() === 'y';

    console.log(`\n📊 Mode: ${config.paper ? 'Paper Trading' : 'Live Trading'}`);
  }

  async setupBinance(config) {
    console.log('🔑 Binance API Credentials');
    console.log('To get your API credentials:');
    console.log('1. Go to https://binance.com');
    console.log('2. Sign up or log in');
    console.log('3. Go to "API Management" in your account');
    console.log('4. Create new API key\n');

    config.apiKey = await this.question('Enter your Binance API Key: ');
    config.secretKey = await this.question('Enter your Binance Secret Key: ');
    
    const testnet = await this.question('Use testnet? (y/n): ');
    config.testnet = testnet.toLowerCase() === 'y';
  }

  async setupInteractiveBrokers(config) {
    console.log('🔑 Interactive Brokers Setup');
    console.log('Requirements:');
    console.log('1. TWS (Trader Workstation) or IB Gateway installed');
    console.log('2. API connections enabled in TWS/Gateway');
    console.log('3. Socket port configured\n');

    config.host = await this.question('Enter IB host (default: 127.0.0.1): ') || '127.0.0.1';
    config.port = parseInt(await this.question('Enter IB port (7497 for TWS, 4001 for Gateway): ')) || 7497;
    config.clientId = parseInt(await this.question('Enter client ID (default: 1): ')) || 1;

    console.log('\n📋 Make sure TWS/Gateway is running and API is enabled!');
  }

  async setupTDAmeritrade(config) {
    console.log('🔑 TD Ameritrade API Setup');
    console.log('This requires a developer account:');
    console.log('1. Go to https://developer.tdameritrade.com');
    console.log('2. Create developer account');
    console.log('3. Create new app to get API key\n');

    config.apiKey = await this.question('Enter your TD Ameritrade API Key: ');
    config.refreshToken = await this.question('Enter your refresh token: ');
  }

  async saveConfig(brokerId, config) {
    const configDir = path.join(__dirname, '../../config');
    const configFile = path.join(configDir, `${brokerId}-config.json`);

    try {
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configFile, JSON.stringify(config, null, 2));
      console.log(`💾 Configuration saved to ${configFile}`);
    } catch (error) {
      console.log(`❌ Failed to save configuration: ${error.message}`);
    }
  }

  async generateEnvFile() {
    console.log('\n📄 Generate Environment File');
    console.log('============================\n');

    const envContent = `# NexusTradeAI Broker Configuration
# Copy these variables to your .env file

# Alpaca Markets
ALPACA_API_KEY=your_alpaca_api_key_here
ALPACA_SECRET_KEY=your_alpaca_secret_key_here
ALPACA_PAPER=true

# Binance
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_SECRET_KEY=your_binance_secret_key_here
BINANCE_TESTNET=true

# Interactive Brokers
IB_HOST=127.0.0.1
IB_PORT=7497
IB_CLIENT_ID=1

# TD Ameritrade
TDA_API_KEY=your_tda_api_key_here
TDA_REFRESH_TOKEN=your_tda_refresh_token_here

# Trading Configuration
ENABLE_LIVE_TRADING=false
DEFAULT_BROKER=alpaca
`;

    const envFile = path.join(__dirname, '../../.env.example');
    try {
      await fs.writeFile(envFile, envContent);
      console.log(`📄 Environment template saved to ${envFile}`);
      console.log('\n📋 Next steps:');
      console.log('1. Copy .env.example to .env');
      console.log('2. Fill in your actual API credentials');
      console.log('3. Set ENABLE_LIVE_TRADING=true when ready');
    } catch (error) {
      console.log(`❌ Failed to save environment file: ${error.message}`);
    }

    await this.question('\nPress Enter to continue...');
    await this.showMainMenu();
  }

  async testConnections() {
    console.log('\n🧪 Testing Broker Connections');
    console.log('=============================\n');

    // Load existing configurations
    const configDir = path.join(__dirname, '../../config');
    
    try {
      const files = await fs.readdir(configDir);
      const configFiles = files.filter(f => f.endsWith('-config.json'));

      if (configFiles.length === 0) {
        console.log('❌ No broker configurations found. Please connect a broker first.\n');
        await this.showMainMenu();
        return;
      }

      for (const file of configFiles) {
        const brokerId = file.replace('-config.json', '');
        const configPath = path.join(configDir, file);
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        console.log(`🔍 Testing ${brokerId}...`);
        
        try {
          this.brokerManager.addBroker(brokerId, brokerId, config);
          const broker = this.brokerManager.getBroker(brokerId);
          const connected = await broker.connect();
          
          console.log(`${connected ? '✅' : '❌'} ${brokerId}: ${connected ? 'Connected' : 'Failed'}`);
        } catch (error) {
          console.log(`❌ ${brokerId}: ${error.message}`);
        }
      }

    } catch (error) {
      console.log(`❌ Error testing connections: ${error.message}`);
    }

    await this.question('\nPress Enter to continue...');
    await this.showMainMenu();
  }

  async showConnectionStatus() {
    console.log('\n📊 Connection Status');
    console.log('===================\n');

    // This would show real-time status from the dashboard
    console.log('🔗 Active Connections:');
    console.log('   • Mock Broker: ✅ Connected');
    console.log('   • Alpaca: ❌ Not configured');
    console.log('   • Binance: ❌ Not configured');
    console.log('   • Interactive Brokers: ❌ Not configured\n');

    console.log('💰 Account Summary:');
    console.log('   • Total Equity: $0.00');
    console.log('   • Available Cash: $0.00');
    console.log('   • Buying Power: $0.00\n');

    await this.question('Press Enter to continue...');
    await this.showMainMenu();
  }

  question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }
}

// Run the wizard if called directly
if (require.main === module) {
  const wizard = new BrokerSetupWizard();
  wizard.start().catch(console.error);
}

module.exports = BrokerSetupWizard;
