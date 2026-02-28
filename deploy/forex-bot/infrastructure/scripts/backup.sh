#!/bin/bash
###############################################################################
# Database Backup and Restore Script
# ===================================
# Automated backup with retention policy and S3 upload capability
#
# Usage:
#   ./backup.sh backup              # Create backup
#   ./backup.sh restore <file>      # Restore from backup
#   ./backup.sh list                # List available backups
#   ./backup.sh cleanup             # Remove old backups
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
RETENTION_DAYS=30
RETENTION_COUNT=10
COMPRESS=true
UPLOAD_TO_S3=false
S3_BUCKET="nexustradeai-backups"

# Load environment
if [[ -f "$ROOT_DIR/.env" ]]; then
    source "$ROOT_DIR/.env"
else
    echo -e "${RED}Error: .env file not found${NC}"
    exit 1
fi

###############################################################################
# Utility Functions
###############################################################################

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓${NC} $*"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗${NC} $*"
}

###############################################################################
# Backup Functions
###############################################################################

create_backup() {
    log "Creating database backup..."

    mkdir -p "$BACKUP_DIR"

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_file="$BACKUP_DIR/nexustradeai-$timestamp.sql"

    # Create backup
    log "Dumping database: $DB_NAME"
    if PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=plain \
        --no-owner \
        --no-privileges \
        > "$backup_file"; then

        log_success "Database dumped to: $backup_file"

        # Get backup size
        local size=$(du -h "$backup_file" | cut -f1)
        log "Backup size: $size"

        # Compress if enabled
        if [[ "$COMPRESS" == "true" ]]; then
            log "Compressing backup..."
            gzip "$backup_file"
            backup_file="${backup_file}.gz"
            local compressed_size=$(du -h "$backup_file" | cut -f1)
            log_success "Compressed to: $compressed_size"
        fi

        # Upload to S3 if enabled
        if [[ "$UPLOAD_TO_S3" == "true" ]]; then
            upload_to_s3 "$backup_file"
        fi

        log_success "Backup completed: $backup_file"

    else
        log_error "Backup failed"
        exit 1
    fi
}

create_full_backup() {
    log "Creating full system backup..."

    mkdir -p "$BACKUP_DIR/full"

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="full-backup-$timestamp"
    local backup_path="$BACKUP_DIR/full/$backup_name"

    mkdir -p "$backup_path"

    # Backup database
    log "Backing up database..."
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        > "$backup_path/database.sql"

    # Backup configuration
    log "Backing up configuration..."
    cp "$ROOT_DIR/.env" "$backup_path/.env"
    cp -r "$ROOT_DIR/services/trading/data" "$backup_path/trading-data"

    # Backup logs
    log "Backing up logs..."
    if [[ -d "$ROOT_DIR/logs" ]]; then
        cp -r "$ROOT_DIR/logs" "$backup_path/logs"
    fi

    # Create tarball
    log "Creating archive..."
    cd "$BACKUP_DIR/full"
    tar -czf "${backup_name}.tar.gz" "$backup_name"
    rm -rf "$backup_name"

    local size=$(du -h "${backup_name}.tar.gz" | cut -f1)
    log_success "Full backup created: ${backup_name}.tar.gz ($size)"

    # Upload to S3 if enabled
    if [[ "$UPLOAD_TO_S3" == "true" ]]; then
        upload_to_s3 "$BACKUP_DIR/full/${backup_name}.tar.gz"
    fi
}

###############################################################################
# Restore Functions
###############################################################################

restore_backup() {
    local backup_file="$1"

    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi

    log "Restoring from: $backup_file"

    # Confirm restoration
    read -p "This will overwrite the current database. Continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Restore cancelled"
        exit 0
    fi

    # Create safety backup first
    log "Creating safety backup before restore..."
    local safety_backup="$BACKUP_DIR/pre-restore-$(date +%Y%m%d-%H%M%S).sql"
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        > "$safety_backup"
    gzip "$safety_backup"
    log_success "Safety backup created: ${safety_backup}.gz"

    # Decompress if needed
    local restore_file="$backup_file"
    if [[ "$backup_file" == *.gz ]]; then
        log "Decompressing backup..."
        restore_file="${backup_file%.gz}"
        gunzip -c "$backup_file" > "$restore_file"
    fi

    # Drop and recreate database
    log "Dropping existing database..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME"

    log "Creating fresh database..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME"

    # Restore backup
    log "Restoring database..."
    if PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        < "$restore_file"; then

        log_success "Database restored successfully"

        # Clean up decompressed file
        if [[ "$backup_file" == *.gz ]]; then
            rm "$restore_file"
        fi

    else
        log_error "Restore failed"
        log "You can restore from safety backup: ${safety_backup}.gz"
        exit 1
    fi
}

###############################################################################
# S3 Functions
###############################################################################

upload_to_s3() {
    local file="$1"
    local filename=$(basename "$file")

    log "Uploading to S3: s3://$S3_BUCKET/$filename"

    if command -v aws &> /dev/null; then
        if aws s3 cp "$file" "s3://$S3_BUCKET/$filename"; then
            log_success "Uploaded to S3"
        else
            log_error "S3 upload failed"
        fi
    else
        log_error "AWS CLI not installed. Skipping S3 upload"
    fi
}

download_from_s3() {
    local filename="$1"
    local destination="$BACKUP_DIR/$filename"

    log "Downloading from S3: s3://$S3_BUCKET/$filename"

    if aws s3 cp "s3://$S3_BUCKET/$filename" "$destination"; then
        log_success "Downloaded: $destination"
        echo "$destination"
    else
        log_error "S3 download failed"
        exit 1
    fi
}

###############################################################################
# Maintenance Functions
###############################################################################

list_backups() {
    log "Available backups:"
    echo ""

    if [[ -d "$BACKUP_DIR" ]]; then
        cd "$BACKUP_DIR"

        # List local backups
        if compgen -G "*.sql*" > /dev/null; then
            echo "Local backups:"
            ls -lh *.sql* 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
        fi

        if [[ -d "full" ]]; then
            echo ""
            echo "Full backups:"
            ls -lh full/*.tar.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
        fi

        # List S3 backups if enabled
        if [[ "$UPLOAD_TO_S3" == "true" ]] && command -v aws &> /dev/null; then
            echo ""
            echo "S3 backups:"
            aws s3 ls "s3://$S3_BUCKET/" | awk '{print "  " $4 " (" $3 ")"}'
        fi
    else
        echo "No backups found"
    fi

    echo ""
}

cleanup_old_backups() {
    log "Cleaning up old backups..."

    cd "$BACKUP_DIR"

    # Remove by age
    log "Removing backups older than $RETENTION_DAYS days..."
    find . -name "*.sql*" -type f -mtime +$RETENTION_DAYS -delete
    find ./full -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

    # Keep only N most recent
    log "Keeping only $RETENTION_COUNT most recent backups..."
    ls -t *.sql* 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | xargs -r rm

    if [[ -d "full" ]]; then
        cd full
        ls -t *.tar.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | xargs -r rm
    fi

    log_success "Cleanup completed"
}

verify_backup() {
    local backup_file="$1"

    log "Verifying backup: $backup_file"

    if [[ ! -f "$backup_file" ]]; then
        log_error "File not found"
        return 1
    fi

    # Check if compressed
    if [[ "$backup_file" == *.gz ]]; then
        if gzip -t "$backup_file" 2>/dev/null; then
            log_success "Compression valid"
        else
            log_error "Corrupted compressed file"
            return 1
        fi

        # Decompress for SQL check
        local temp_file=$(mktemp)
        gunzip -c "$backup_file" > "$temp_file"
        backup_file="$temp_file"
    fi

    # Check SQL syntax
    if grep -q "CREATE TABLE\|INSERT INTO" "$backup_file"; then
        log_success "Backup appears to be valid SQL"

        if [[ -f "$temp_file" ]]; then
            rm "$temp_file"
        fi
        return 0
    else
        log_error "Backup does not appear to be valid SQL"

        if [[ -f "$temp_file" ]]; then
            rm "$temp_file"
        fi
        return 1
    fi
}

###############################################################################
# Main
###############################################################################

case "${1:-}" in
    backup)
        create_backup
        ;;

    full-backup)
        create_full_backup
        ;;

    restore)
        if [[ -z "${2:-}" ]]; then
            log_error "Usage: $0 restore <backup-file>"
            exit 1
        fi
        restore_backup "$2"
        ;;

    list)
        list_backups
        ;;

    cleanup)
        cleanup_old_backups
        ;;

    verify)
        if [[ -z "${2:-}" ]]; then
            log_error "Usage: $0 verify <backup-file>"
            exit 1
        fi
        verify_backup "$2"
        ;;

    *)
        echo "NexusTradeAI Backup Script"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  backup              Create database backup"
        echo "  full-backup         Create full system backup"
        echo "  restore <file>      Restore from backup file"
        echo "  list                List available backups"
        echo "  cleanup             Remove old backups"
        echo "  verify <file>       Verify backup integrity"
        echo ""
        echo "Configuration (edit script or set env vars):"
        echo "  RETENTION_DAYS=$RETENTION_DAYS"
        echo "  RETENTION_COUNT=$RETENTION_COUNT"
        echo "  COMPRESS=$COMPRESS"
        echo "  UPLOAD_TO_S3=$UPLOAD_TO_S3"
        echo ""
        exit 1
        ;;
esac
