/**
 * NexusTradeAI - Broker API Endpoints
 * 
 * Handles broker connection testing and configuration
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { MultiBrokerManager } = require('../broker-connector/BrokerConnector');

const router = express.Router();
const brokerManager = new MultiBrokerManager();

/**
 * Test broker connection
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { brokerType, credentials } = req.body;
    
    console.log(`🧪 Testing ${brokerType} connection...`);
    
    // Validate input
    if (!brokerType || !credentials) {
      return res.status(400).json({
        success: false,
        error: 'Missing broker type or credentials'
      });
    }
    
    // Create temporary broker instance for testing
    const testBroker = brokerManager.addBroker(`test_${Date.now()}`, brokerType, credentials);
    
    // Test connection
    const connected = await testBroker.connect();
    
    if (connected) {
      // Get account info if possible
      let accountInfo = null;
      try {
        accountInfo = await testBroker.getBalance();
      } catch (error) {
        console.log('Could not get account info:', error.message);
      }
      
      res.json({
        success: true,
        broker: brokerType,
        status: 'connected',
        accountInfo: accountInfo,
        message: `Successfully connected to ${brokerType}`
      });
      
    } else {
      res.json({
        success: false,
        broker: brokerType,
        status: 'failed',
        error: 'Connection failed - check credentials'
      });
    }
    
  } catch (error) {
    console.error('Broker connection test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Save broker configuration
 */
router.post('/save-config', async (req, res) => {
  try {
    const { brokerType, credentials, name } = req.body;
    
    console.log(`💾 Saving ${brokerType} configuration...`);
    
    // Validate input
    if (!brokerType || !credentials) {
      return res.status(400).json({
        success: false,
        error: 'Missing broker type or credentials'
      });
    }
    
    // Create config directory if it doesn't exist
    const configDir = path.join(__dirname, '../../config');
    await fs.mkdir(configDir, { recursive: true });
    
    // Save configuration
    const configFile = path.join(configDir, `${brokerType}-config.json`);
    const config = {
      brokerType,
      name: name || brokerType,
      credentials,
      createdAt: new Date().toISOString(),
      enabled: true
    };
    
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));
    
    // Also update .env file with credentials
    await updateEnvFile(brokerType, credentials);
    
    res.json({
      success: true,
      message: `${brokerType} configuration saved successfully`,
      configFile: configFile
    });
    
  } catch (error) {
    console.error('Save config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get broker status
 */
router.get('/status', async (req, res) => {
  try {
    const configDir = path.join(__dirname, '../../config');
    const brokerStatuses = [];
    
    try {
      const files = await fs.readdir(configDir);
      const configFiles = files.filter(f => f.endsWith('-config.json'));
      
      for (const file of configFiles) {
        const configPath = path.join(configDir, file);
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        
        // Test current connection status
        let status = 'disconnected';
        let accountInfo = null;
        
        try {
          const broker = brokerManager.getBroker(config.brokerType);
          if (broker && broker.isConnected) {
            status = 'connected';
            accountInfo = await broker.getBalance();
          }
        } catch (error) {
          console.log(`Status check failed for ${config.brokerType}:`, error.message);
        }
        
        brokerStatuses.push({
          name: config.name,
          type: config.brokerType,
          status: status,
          accountInfo: accountInfo,
          enabled: config.enabled,
          lastUpdated: config.createdAt
        });
      }
    } catch (error) {
      // Config directory doesn't exist or is empty
      console.log('No broker configurations found');
    }
    
    res.json({
      success: true,
      brokers: brokerStatuses,
      totalBrokers: brokerStatuses.length,
      connectedBrokers: brokerStatuses.filter(b => b.status === 'connected').length
    });
    
  } catch (error) {
    console.error('Get broker status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Remove broker configuration
 */
router.delete('/remove/:brokerType', async (req, res) => {
  try {
    const { brokerType } = req.params;
    
    console.log(`🗑️ Removing ${brokerType} configuration...`);
    
    const configDir = path.join(__dirname, '../../config');
    const configFile = path.join(configDir, `${brokerType}-config.json`);
    
    // Remove config file
    try {
      await fs.unlink(configFile);
    } catch (error) {
      // File might not exist
      console.log('Config file not found:', error.message);
    }
    
    // Remove from broker manager
    if (brokerManager.brokers.has(brokerType)) {
      brokerManager.brokers.delete(brokerType);
    }
    
    res.json({
      success: true,
      message: `${brokerType} configuration removed successfully`
    });
    
  } catch (error) {
    console.error('Remove broker error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update .env file with broker credentials
 */
async function updateEnvFile(brokerType, credentials) {
  try {
    const envPath = path.join(__dirname, '../../.env');
    let envContent = '';
    
    // Read existing .env file
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      // .env file doesn't exist, create new one
      console.log('Creating new .env file');
    }
    
    // Update credentials based on broker type
    const envUpdates = getEnvUpdates(brokerType, credentials);
    
    // Update or add each environment variable
    for (const [key, value] of Object.entries(envUpdates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const newLine = `${key}=${value}`;
      
      if (regex.test(envContent)) {
        // Update existing line
        envContent = envContent.replace(regex, newLine);
      } else {
        // Add new line
        envContent += `\n${newLine}`;
      }
    }
    
    // Write updated .env file
    await fs.writeFile(envPath, envContent.trim() + '\n');
    console.log(`✅ Updated .env file with ${brokerType} credentials`);
    
  } catch (error) {
    console.error('Error updating .env file:', error);
    throw error;
  }
}

/**
 * Get environment variable updates for broker type
 */
function getEnvUpdates(brokerType, credentials) {
  switch (brokerType) {
    case 'alpaca':
      return {
        'ALPACA_API_KEY': credentials.apiKey,
        'ALPACA_SECRET_KEY': credentials.secretKey,
        'ALPACA_PAPER': credentials.paper ? 'true' : 'false'
      };
      
    case 'binance':
      return {
        'BINANCE_API_KEY': credentials.apiKey,
        'BINANCE_SECRET_KEY': credentials.secretKey,
        'BINANCE_TESTNET': credentials.testnet ? 'true' : 'false'
      };
      
    case 'interactivebrokers':
      return {
        'IB_HOST': credentials.host || '127.0.0.1',
        'IB_PORT': credentials.port || '7497',
        'IB_CLIENT_ID': credentials.clientId || '1'
      };
      
    case 'tdameritrade':
      return {
        'TDA_API_KEY': credentials.apiKey,
        'TDA_REFRESH_TOKEN': credentials.refreshToken
      };
      
    default:
      return {};
  }
}

module.exports = router;
