/**
 * Data Migration Script
 * ====================
 * Migrate JSON files to PostgreSQL database
 * Run this ONCE to transition from file storage to database
 */

const fs = require('fs').promises;
const path = require('path');
const db = require('./db');

class DataMigration {
  constructor() {
    this.dataPath = path.join(__dirname, '../../services/trading/data');
    this.migrationLog = [];
  }

  /**
   * Main migration workflow
   */
  async run() {
    console.log('🚀 Starting data migration from JSON to PostgreSQL...\n');

    try {
      // Connect to database
      await db.connect();
      console.log('✅ Database connected\n');

      // Backup existing data
      await this.backupData();

      // Run migrations in order
      await this.migrateAccounts();
      await this.migratePositions();
      await this.migrateTrades();
      await this.migratePerformance();

      // Verify migration
      await this.verifyMigration();

      console.log('\n✅ Migration completed successfully!\n');
      console.log('Migration Summary:');
      this.migrationLog.forEach(log => console.log(`  - ${log}`));

      console.log('\n⚠️  IMPORTANT: Review the migration and update your code to use database instead of JSON files');
      console.log('⚠️  JSON files backed up to: services/trading/data/backup/\n');

    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      console.error('\nRolling back changes...');

      try {
        await this.rollback();
        console.log('✅ Rollback completed');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError);
        console.error('⚠️  Database may be in inconsistent state');
      }

      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * Backup current JSON data
   */
  async backupData() {
    console.log('📦 Backing up JSON files...');

    const backupPath = path.join(this.dataPath, 'backup', new Date().toISOString().split('T')[0]);

    try {
      await fs.mkdir(backupPath, { recursive: true });

      const files = await fs.readdir(this.dataPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const sourcePath = path.join(this.dataPath, file);
        const destPath = path.join(backupPath, file);

        await fs.copyFile(sourcePath, destPath);
        console.log(`  ✅ Backed up: ${file}`);
      }

      this.migrationLog.push(`Backed up ${jsonFiles.length} JSON files to ${backupPath}`);
      console.log('');
    } catch (error) {
      console.error('❌ Backup failed:', error);
      throw error;
    }
  }

  /**
   * Migrate accounts.json
   */
  async migrateAccounts() {
    console.log('👤 Migrating accounts...');

    try {
      const filePath = path.join(this.dataPath, 'accounts.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const accounts = JSON.parse(fileContent);

      let count = 0;

      for (const [accountId, accountData] of Object.entries(accounts)) {
        const query = `
          INSERT INTO accounts (
            account_id, account_type, broker,
            balance, equity, buying_power, cash, portfolio_value
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (account_id) DO UPDATE SET
            balance = EXCLUDED.balance,
            equity = EXCLUDED.equity,
            buying_power = EXCLUDED.buying_power,
            cash = EXCLUDED.cash,
            portfolio_value = EXCLUDED.portfolio_value,
            last_updated = NOW()
        `;

        await db.query(query, [
          accountId,
          accountData.type || 'paper',
          accountData.broker || 'alpaca',
          accountData.balance || 0,
          accountData.equity || 0,
          accountData.buying_power || 0,
          accountData.cash || 0,
          accountData.portfolio_value || 0
        ]);

        count++;
      }

      console.log(`  ✅ Migrated ${count} accounts\n`);
      this.migrationLog.push(`Migrated ${count} accounts`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('  ℹ️  No accounts.json file found\n');
      } else {
        throw error;
      }
    }
  }

  /**
   * Migrate positions.json
   */
  async migratePositions() {
    console.log('📊 Migrating positions...');

    try {
      const filePath = path.join(this.dataPath, 'positions.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const positions = JSON.parse(fileContent);

      let count = 0;

      for (const position of Object.values(positions)) {
        // Skip if position doesn't have required fields
        if (!position.symbol || !position.quantity) {
          console.log(`  ⚠️  Skipping invalid position:`, position);
          continue;
        }

        const query = `
          INSERT INTO positions (
            position_id, account_id, symbol, side, quantity,
            entry_price, current_price, average_entry_price,
            stop_loss, take_profit, trailing_stop,
            strategy, confidence, status,
            opened_at, entry_conditions
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14, $15
          )
          ON CONFLICT DO NOTHING
        `;

        await db.query(query, [
          position.account_id || 'alpaca-paper',
          position.symbol,
          position.side || 'long',
          position.quantity,
          position.entryPrice || position.entry_price || 0,
          position.currentPrice || position.current_price || position.entryPrice || 0,
          position.averageEntryPrice || position.average_entry_price || position.entryPrice || 0,
          position.stopLoss || position.stop_loss,
          position.takeProfit || position.take_profit,
          position.trailingStop || position.trailing_stop,
          position.strategy || 'momentum',
          position.confidence || 0.85,
          position.status || 'open',
          position.openTime || position.opened_at || new Date(),
          JSON.stringify(position.entry_conditions || position.entryConditions || {})
        ]);

        count++;
      }

      console.log(`  ✅ Migrated ${count} positions\n`);
      this.migrationLog.push(`Migrated ${count} positions`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('  ℹ️  No positions.json file found\n');
      } else {
        throw error;
      }
    }
  }

  /**
   * Migrate trades.json
   */
  async migrateTrades() {
    console.log('💰 Migrating trades...');

    try {
      const filePath = path.join(this.dataPath, 'trades.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      let trades = JSON.parse(fileContent);

      // Handle both array and object formats
      if (!Array.isArray(trades)) {
        trades = Object.values(trades);
      }

      let count = 0;

      for (const trade of trades) {
        if (!trade.symbol) continue;

        const query = `
          INSERT INTO trades (
            account_id, symbol, side, quantity, price,
            commission, fees, pnl, strategy, executed_at,
            execution_metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;

        await db.query(query, [
          trade.account_id || 'alpaca-paper',
          trade.symbol,
          trade.side || 'buy',
          trade.quantity || 0,
          trade.price || 0,
          trade.commission || 0,
          trade.fees || 0,
          trade.pnl || trade.profit || 0,
          trade.strategy || 'momentum',
          trade.timestamp || trade.executed_at || new Date(),
          JSON.stringify(trade.metadata || {})
        ]);

        count++;
      }

      console.log(`  ✅ Migrated ${count} trades\n`);
      this.migrationLog.push(`Migrated ${count} trades`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('  ℹ️  No trades.json file found\n');
      } else {
        throw error;
      }
    }
  }

  /**
   * Migrate performance.json
   */
  async migratePerformance() {
    console.log('📈 Migrating performance metrics...');

    try {
      const filePath = path.join(this.dataPath, 'performance.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const performance = JSON.parse(fileContent);

      // Create today's performance entry
      const query = `
        INSERT INTO performance_metrics (
          account_id, metric_date,
          total_trades, winning_trades, losing_trades,
          win_rate, profit_factor,
          realized_pnl, unrealized_pnl, total_pnl
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (account_id, metric_date) DO UPDATE SET
          total_trades = EXCLUDED.total_trades,
          winning_trades = EXCLUDED.winning_trades,
          losing_trades = EXCLUDED.losing_trades,
          win_rate = EXCLUDED.win_rate,
          profit_factor = EXCLUDED.profit_factor,
          total_pnl = EXCLUDED.total_pnl,
          calculated_at = NOW()
      `;

      await db.query(query, [
        'alpaca-paper',
        new Date().toISOString().split('T')[0],
        performance.totalTrades || 0,
        performance.winningTrades || 0,
        performance.losingTrades || 0,
        performance.winRate || 0,
        performance.profitFactor || 0,
        0, // realized_pnl
        0, // unrealized_pnl
        performance.totalProfit || 0
      ]);

      console.log(`  ✅ Migrated performance metrics\n`);
      this.migrationLog.push('Migrated performance metrics');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('  ℹ️  No performance.json file found\n');
      } else {
        throw error;
      }
    }
  }

  /**
   * Verify migration
   */
  async verifyMigration() {
    console.log('🔍 Verifying migration...');

    const checks = [
      { table: 'accounts', query: 'SELECT COUNT(*) FROM accounts' },
      { table: 'positions', query: 'SELECT COUNT(*) FROM positions' },
      { table: 'trades', query: 'SELECT COUNT(*) FROM trades' },
      { table: 'performance_metrics', query: 'SELECT COUNT(*) FROM performance_metrics' }
    ];

    for (const check of checks) {
      const result = await db.query(check.query);
      const count = parseInt(result.rows[0].count);
      console.log(`  ✅ ${check.table}: ${count} rows`);
    }

    console.log('');
  }

  /**
   * Rollback migration
   */
  async rollback() {
    console.log('⚠️  Rolling back migration...');

    const tables = ['trades', 'positions', 'performance_metrics', 'accounts'];

    for (const table of tables) {
      try {
        await db.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`  ✅ Cleared ${table}`);
      } catch (error) {
        console.error(`  ❌ Failed to clear ${table}:`, error.message);
      }
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new DataMigration();
  migration.run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = DataMigration;
