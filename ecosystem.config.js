module.exports = {
  apps: [
    // ===== AUTO STOCK BOT (PRIMARY - MA Crossover Strategy) =====
    {
      name: 'auto-stock-bot',
      script: './services/trading/auto-stock-bot.js',
      cwd: '/Users/theophilusogieva/Desktop/NexusTradeAI',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        STOCK_BOT_PORT: 3002,
        AUTO_START: 'false'  // Set to 'true' for auto-start on launch
      },
      error_file: './services/trading/logs/auto-stock-bot/error.log',
      out_file: './services/trading/logs/auto-stock-bot/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    },
    // ===== AUTO FOREX BOT (BIDIRECTIONAL - LONG + SHORT) =====
    {
      name: 'auto-forex-bot',
      script: './services/trading/auto-forex-bot.js',
      cwd: '/Users/theophilusogieva/Desktop/NexusTradeAI',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        FOREX_BOT_PORT: 3005,
        FOREX_AUTO_START: 'false'
      },
      error_file: './services/trading/logs/auto-forex-bot/error.log',
      out_file: './services/trading/logs/auto-forex-bot/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    },
    // ===== AUTO CRYPTO BOT (BIDIRECTIONAL 24/7) =====
    {
      name: 'auto-crypto-bot',
      script: './services/trading/auto-crypto-bot.js',
      cwd: '/Users/theophilusogieva/Desktop/NexusTradeAI',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        CRYPTO_BOT_PORT: 3006,
        CRYPTO_AUTO_START: 'false'
      },
      error_file: './services/trading/logs/auto-crypto-bot/error.log',
      out_file: './services/trading/logs/auto-crypto-bot/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    },
    // ===== UNIFIED DASHBOARD =====
    {
      name: 'unified-dashboard',
      script: './services/trading/unified-dashboard.js',
      cwd: '/Users/theophilusogieva/Desktop/NexusTradeAI',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        DASHBOARD_PORT: 3010
      },
      error_file: './services/trading/logs/dashboard/error.log',
      out_file: './services/trading/logs/dashboard/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    },
    // ===== DASHBOARD =====
    {
      name: 'bot-dashboard',
      script: 'npm',
      args: 'run dev',
      cwd: '/Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      error_file: './logs/dashboard-error.log',
      out_file: './logs/dashboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
