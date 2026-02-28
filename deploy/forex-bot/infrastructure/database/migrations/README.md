# Database Migrations

This directory contains database migration scripts for schema evolution.

## Migration Strategy

We use a simple sequential migration system:
- Migrations are numbered: `001_initial.sql`, `002_add_indexes.sql`, etc.
- Migrations are applied in order
- A `migrations` table tracks which migrations have been applied

## Creating a Migration

1. Create a new file with the next sequential number:
   ```bash
   touch migrations/003_add_new_feature.sql
   ```

2. Write your migration SQL:
   ```sql
   -- Migration: Add new feature
   -- Date: 2024-12-23

   BEGIN;

   -- Your schema changes here
   ALTER TABLE positions ADD COLUMN new_field VARCHAR(50);

   -- Record migration
   INSERT INTO schema_migrations (version, name)
   VALUES (3, 'add_new_feature');

   COMMIT;
   ```

3. Test the migration:
   ```bash
   ./migrate.sh up
   ```

## Running Migrations

```bash
# Apply all pending migrations
./migrate.sh up

# Rollback last migration
./migrate.sh down

# Show migration status
./migrate.sh status

# Force a specific version
./migrate.sh force 5
```

## Migration Best Practices

1. **Always use transactions**: Wrap migrations in BEGIN/COMMIT
2. **Make migrations reversible**: Write corresponding down migrations
3. **Test on staging first**: Never run untested migrations on production
4. **Backup before migrating**: Always backup database before running migrations
5. **Keep migrations small**: One logical change per migration
6. **Don't modify old migrations**: Once applied, migrations are immutable

## Migration Tracking

The system uses a `schema_migrations` table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Example Migrations

### 001 - Initial Schema
Creates all core tables (positions, trades, orders, etc.)

### 002 - Add Indexes
Adds performance indexes on frequently queried columns

### 003 - Add Constraints
Adds foreign key constraints for referential integrity
