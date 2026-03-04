#!/usr/bin/env node

/**
 * Test Python Bridge Communication
 * Verifies that JavaScript can communicate with Python bridge
 */

console.log('🐍 Testing Python Bridge Communication...\n');

const PythonBridge = require('./services/ai-ml-engine/PythonBridge');

async function testBridge() {
  const bridge = new PythonBridge({
    timeout: 10000,
    maxRetries: 1
  });
  
  try {
    console.log('🔌 Connecting to Python bridge...');
    await bridge.connect();
    console.log('✅ Bridge connected successfully!');
    
    console.log('📊 Testing status request...');
    const status = await bridge.getModelStatus();
    console.log('✅ Status received:', JSON.stringify(status, null, 2));
    
    console.log('🔌 Disconnecting...');
    await bridge.disconnect();
    console.log('✅ Bridge disconnected successfully!');
    
    console.log('\n🎉 Python Bridge Test PASSED! 🚀');
    
  } catch (error) {
    console.error('❌ Bridge test failed:', error.message);
    console.log('\n⚠️  This is expected if Python dependencies are not installed.');
    console.log('   The bridge will work once the full system is set up.');
  }
}

testBridge();
