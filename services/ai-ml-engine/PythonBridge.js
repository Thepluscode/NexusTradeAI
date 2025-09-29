/**
 * Nexus Trade AI - Python Bridge (JavaScript Side)
 *
 * Simplified bridge for connecting JavaScript trading engine with Python AI/ML components
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

class PythonBridge extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      pythonPath: config.pythonPath || 'python3',
      bridgeScript: config.bridgeScript || path.join(__dirname, 'bridge.py'),
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      ...config
    };

    this.pythonProcess = null;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.retryCount = 0;

    console.log('🤖 Python Bridge initializing...');
  }

  /**
   * Start the Python bridge process
   */
  async connect() {
    try {
      if (this.isConnected) {
        console.log('🤖 Python Bridge already connected');
        return true;
      }

      console.log('🤖 Starting Python AI/ML bridge...');

      // Spawn Python process
      this.pythonProcess = spawn(this.config.pythonPath, ['-u', this.config.bridgeScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      // Set up event handlers
      this._setupEventHandlers();

      // Wait for initialization
      await this._waitForInitialization();

      this.isConnected = true;
      this.retryCount = 0;

      console.log('✅ Python Bridge connected successfully');
      this.emit('connected');

      return true;

    } catch (error) {
      console.error('❌ Failed to connect Python Bridge:', error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from Python bridge
   */
  async disconnect() {
    if (this.pythonProcess) {
      console.log('🤖 Disconnecting Python Bridge...');

      this.pythonProcess.kill('SIGTERM');
      this.pythonProcess = null;
      this.isConnected = false;

      // Reject all pending requests
      for (const [id, { reject }] of this.pendingRequests) {
        reject(new Error('Bridge disconnected'));
      }
      this.pendingRequests.clear();

      console.log('✅ Python Bridge disconnected');
      this.emit('disconnected');
    }
  }

  /**
   * Set up event handlers for Python process
   */
  _setupEventHandlers() {
    // Handle stdout (responses from Python)
    this.pythonProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          this._handleResponse(response);
        } catch (error) {
          console.error('❌ Failed to parse Python response:', line);
        }
      }
    });

    // Handle stderr (Python errors and logs)
    this.pythonProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        console.log('🐍 Python:', message);
      }
    });

    // Handle process exit
    this.pythonProcess.on('exit', (code, signal) => {
      console.log(`🤖 Python process exited with code ${code}, signal ${signal}`);
      this.isConnected = false;
      this.emit('disconnected', { code, signal });
    });

    // Handle process errors
    this.pythonProcess.on('error', (error) => {
      console.error('❌ Python process error:', error);
      this.isConnected = false;
      this.emit('error', error);
    });
  }

  /**
   * Wait for Python bridge to initialize
   */
  async _waitForInitialization() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Python bridge initialization timeout'));
      }, this.config.timeout);

      // Send status request to check if bridge is ready
      this._sendCommand('get_status', {})
        .then((response) => {
          clearTimeout(timeout);
          if (response.result && response.result.initialized) {
            resolve();
          } else {
            reject(new Error('Python bridge failed to initialize'));
          }
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Send command to Python bridge
   */
  async _sendCommand(method, data) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.pythonProcess) {
        reject(new Error('Python bridge not connected'));
        return;
      }

      const requestId = ++this.requestId;
      const command = {
        id: requestId,
        method: method,
        data: data,
        timestamp: new Date().toISOString()
      };

      // Store pending request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${method}`));
      }, this.config.timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Send command to Python
      try {
        this.pythonProcess.stdin.write(JSON.stringify(command) + '\n');
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Handle response from Python bridge
   */
  _handleResponse(response) {
    const requestId = response.id;

    if (this.pendingRequests.has(requestId)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(requestId);
      this.pendingRequests.delete(requestId);
      clearTimeout(timeout);

      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.error || 'Unknown Python error'));
      }
    }
  }

  /**
   * Get status of all AI/ML models
   */
  async getModelStatus() {
    try {
      const response = await this._sendCommand('get_status', {});
      return response.result;
    } catch (error) {
      console.error('❌ Model status request failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate signal using Self-Rewarding DQN (placeholder)
   */
  async generateSRDQNSignal(marketData) {
    try {
      const response = await this._sendCommand('generate_srdqn_signal', {
        market_data: marketData
      });
      return response.result;
    } catch (error) {
      console.error('❌ SRDQN signal generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate signal using Advanced Strategy Ensemble (placeholder)
   */
  async generateEnsembleSignal(marketData) {
    try {
      const response = await this._sendCommand('generate_ensemble_signal', {
        market_data: marketData
      });
      return response.result;
    } catch (error) {
      console.error('❌ Ensemble signal generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Health check for the bridge
   */
  async healthCheck() {
    try {
      const status = await this.getModelStatus();
      return {
        connected: this.isConnected,
        python_initialized: status.initialized,
        components: status.components,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = PythonBridge;