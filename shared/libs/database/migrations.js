/**
 * Database Migrations for NexusTradeAI
 * Database schema migration utilities
 */

const fs = require('fs').promises;
const path = require('path');

class Migrations {
  constructor(dbPool, migrationsPath = './migrations') {
    this.dbPool = dbPool;
    this.migrationsPath = migrationsPath;
    this.migrationsTable = 'schema_migrations';
  }

  /**
   * Initialize migrations table
   */
  async initializeMigrationsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64) NOT NULL
      )
    `;

    await this.dbPool.query(query);
  }

  /**
   * Get executed migrations
   */
  async getExecutedMigrations() {
    const query = `SELECT version, name, executed_at, checksum FROM ${this.migrationsTable} ORDER BY version`;
    const result = await this.dbPool.query(query);
    return result.rows;
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const allMigrations = await this.getAllMigrations();
    const executedMigrations = await this.getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.map(m => m.version));

    return allMigrations.filter(migration => !executedVersions.has(migration.version));
  }

  /**
   * Get all migration files
   */
  async getAllMigrations() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();

      const migrations = [];
      for (const file of migrationFiles) {
        const version = this.extractVersionFromFilename(file);
        const name = this.extractNameFromFilename(file);
        const filePath = path.join(this.migrationsPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        const checksum = this.calculateChecksum(content);

        migrations.push({
          version,
          name,
          file,
          content,
          checksum
        });
      }

      return migrations;
    } catch (error) {
      throw new Error(`Failed to read migrations: ${error.message}`);
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations() {
    await this.initializeMigrationsTable();
    const pendingMigrations = await this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Running ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }

    console.log('All migrations completed successfully');
  }

  /**
   * Run a single migration
   */
  async runMigration(migration) {
    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');

      console.log(`Running migration: ${migration.version} - ${migration.name}`);

      // Execute migration SQL
      await client.query(migration.content);

      // Record migration as executed
      const insertQuery = `
        INSERT INTO ${this.migrationsTable} (version, name, checksum)
        VALUES ($1, $2, $3)
      `;
      await client.query(insertQuery, [migration.version, migration.name, migration.checksum]);

      await client.query('COMMIT');
      console.log(`Migration completed: ${migration.version}`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration failed ${migration.version}: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Rollback last migration
   */
  async rollbackLastMigration() {
    const executedMigrations = await this.getExecutedMigrations();

    if (executedMigrations.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    const lastMigration = executedMigrations[executedMigrations.length - 1];
    await this.rollbackMigration(lastMigration.version);
  }

  /**
   * Rollback specific migration
   */
  async rollbackMigration(version) {
    const allMigrations = await this.getAllMigrations();
    const migration = allMigrations.find(m => m.version === version);

    if (!migration) {
      throw new Error(`Migration not found: ${version}`);
    }

    // Look for rollback file
    const rollbackFile = migration.file.replace('.sql', '.rollback.sql');
    const rollbackPath = path.join(this.migrationsPath, rollbackFile);

    try {
      const rollbackContent = await fs.readFile(rollbackPath, 'utf8');

      const client = await this.dbPool.connect();

      try {
        await client.query('BEGIN');

        console.log(`Rolling back migration: ${version}`);

        // Execute rollback SQL
        await client.query(rollbackContent);

        // Remove migration record
        const deleteQuery = `DELETE FROM ${this.migrationsTable} WHERE version = $1`;
        await client.query(deleteQuery, [version]);

        await client.query('COMMIT');
        console.log(`Rollback completed: ${version}`);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Rollback file not found: ${rollbackFile}`);
      }
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Extract version from filename
   */
  extractVersionFromFilename(filename) {
    const match = filename.match(/^(\d+)/);
    return match ? match[1] : filename;
  }

  /**
   * Extract name from filename
   */
  extractNameFromFilename(filename) {
    return filename.replace(/^\d+[-_]?/, '').replace(/\.sql$/, '');
  }

  /**
   * Calculate checksum for migration content
   */
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

module.exports = Migrations;