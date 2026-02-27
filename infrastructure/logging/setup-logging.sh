#!/bin/bash
###############################################################################
# Logging Setup Script
# ====================
# Configures log rotation and aggregation for NexusTradeAI
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

###############################################################################
# Directory Setup
###############################################################################

setup_log_directories() {
    log "Setting up log directories..."

    mkdir -p "$ROOT_DIR/logs"
    mkdir -p "$ROOT_DIR/logs/archive"
    mkdir -p "$ROOT_DIR/clients/bot-dashboard/logs"

    # Set proper permissions
    chmod 755 "$ROOT_DIR/logs"
    chmod 755 "$ROOT_DIR/clients/bot-dashboard/logs"

    log_success "Log directories created"
}

###############################################################################
# Logrotate Setup
###############################################################################

setup_logrotate() {
    log "Setting up logrotate..."

    # Check if logrotate is installed
    if ! command -v logrotate &>/dev/null; then
        log_error "logrotate not installed"
        log "Install with: brew install logrotate (macOS) or apt-get install logrotate (Linux)"
        return 1
    fi

    # Copy configuration
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS
        local config_dir="$HOME/Library/LaunchAgents"
        mkdir -p "$config_dir"

        # Create launchd plist for automatic rotation
        cat > "$config_dir/com.nexustradeai.logrotate.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nexustradeai.logrotate</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/logrotate</string>
        <string>-s</string>
        <string>$ROOT_DIR/logs/logrotate.status</string>
        <string>$SCRIPT_DIR/logrotate.conf</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</dict>
</plist>
EOF

        # Load the launchd job
        launchctl unload "$config_dir/com.nexustradeai.logrotate.plist" 2>/dev/null || true
        launchctl load "$config_dir/com.nexustradeai.logrotate.plist"

        log_success "Logrotate configured (runs daily at 2 AM)"

    else
        # Linux
        sudo cp "$SCRIPT_DIR/logrotate.conf" /etc/logrotate.d/nexustradeai
        sudo chmod 644 /etc/logrotate.d/nexustradeai

        log_success "Logrotate configured (runs via cron)"
    fi
}

###############################################################################
# Structured Logging Setup
###############################################################################

create_logging_library() {
    log "Creating structured logging library..."

    cat > "$ROOT_DIR/infrastructure/logging/logger.js" <<'EOF'
/**
 * Structured Logging Library
 * ===========================
 * Provides consistent, structured logging across the application
 */

const winston = require('winston');
const path = require('path');

// Log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
};

// Create logger instance
const logger = winston.createLogger({
    levels,
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: {
        service: 'nexustradeai',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        // Error log
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),

        // Combined log
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/combined.log'),
            maxsize: 10485760,
            maxFiles: 10
        }),

        // Console output (pretty format)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                    let msg = `${timestamp} [${service}] ${level}: ${message}`;
                    if (Object.keys(meta).length > 0) {
                        msg += ` ${JSON.stringify(meta)}`;
                    }
                    return msg;
                })
            )
        })
    ]
});

// Add custom methods for common use cases
logger.trade = (action, data) => {
    logger.info('Trade event', { action, ...data });
};

logger.performance = (metric, value) => {
    logger.info('Performance metric', { metric, value });
};

logger.api = (endpoint, duration, status) => {
    logger.info('API call', { endpoint, duration, status });
};

module.exports = logger;
EOF

    log_success "Logging library created"
}

###############################################################################
# Log Aggregation Setup
###############################################################################

setup_log_aggregation() {
    log "Setting up log aggregation..."

    cat > "$ROOT_DIR/infrastructure/logging/aggregate-logs.sh" <<'EOFAGG'
#!/bin/bash
# Log Aggregation Script
# Collects logs from all services into central location

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARCHIVE_DIR="$ROOT_DIR/logs/archive"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$ARCHIVE_DIR"

echo "Aggregating logs..."

# Collect Docker logs
cd "$ROOT_DIR/infrastructure"
for service in trading-bot data-server postgres redis prometheus alertmanager; do
    if docker-compose ps | grep -q "$service"; then
        echo "Collecting logs from $service..."
        docker-compose logs --tail=1000 "$service" > "$ARCHIVE_DIR/${service}-${TIMESTAMP}.log" 2>&1
    fi
done

# Collect application logs
if [[ -d "$ROOT_DIR/clients/bot-dashboard/logs" ]]; then
    cp "$ROOT_DIR/clients/bot-dashboard/logs"/*.log "$ARCHIVE_DIR/" 2>/dev/null || true
fi

# Create tarball
cd "$ARCHIVE_DIR"
tar -czf "logs-${TIMESTAMP}.tar.gz" *.log 2>/dev/null || true
rm -f *.log

echo "Logs archived to: $ARCHIVE_DIR/logs-${TIMESTAMP}.tar.gz"

# Clean old archives (keep last 30 days)
find "$ARCHIVE_DIR" -name "logs-*.tar.gz" -mtime +30 -delete

echo "Log aggregation complete"
EOFAGG

    chmod +x "$ROOT_DIR/infrastructure/logging/aggregate-logs.sh"

    log_success "Log aggregation script created"
}

###############################################################################
# Log Analysis Tools
###############################################################################

create_log_analysis_tools() {
    log "Creating log analysis tools..."

    cat > "$ROOT_DIR/infrastructure/logging/analyze-logs.sh" <<'EOFANALYSIS'
#!/bin/bash
# Log Analysis Tool
# Quick analysis of recent logs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

LOG_FILE="${1:-$ROOT_DIR/clients/bot-dashboard/logs/unified-bot-protected.log}"

if [[ ! -f "$LOG_FILE" ]]; then
    echo "Error: Log file not found: $LOG_FILE"
    exit 1
fi

echo "=========================================="
echo "Log Analysis: $(basename $LOG_FILE)"
echo "=========================================="
echo ""

# Error summary
echo "Error Summary:"
echo "--------------"
grep -i "error" "$LOG_FILE" | tail -10
echo ""

# Trading activity
echo "Trading Activity (last 24h):"
echo "----------------------------"
grep -E "TRADE|BUY|SELL" "$LOG_FILE" | tail -20
echo ""

# Performance metrics
echo "Performance Metrics:"
echo "--------------------"
grep -E "P&L|win rate|trades" "$LOG_FILE" | tail -10
echo ""

# Memory warnings
echo "Memory Warnings:"
echo "----------------"
grep -i "memory" "$LOG_FILE" | tail -10
echo ""

# API issues
echo "API Issues:"
echo "-----------"
grep -E "timeout|connection.*refused|api.*error" "$LOG_FILE" | tail -10
echo ""

echo "=========================================="
echo "Analysis complete"
echo "=========================================="
EOFANALYSIS

    chmod +x "$ROOT_DIR/infrastructure/logging/analyze-logs.sh"

    log_success "Log analysis tool created"
}

###############################################################################
# Main
###############################################################################

main() {
    log "=========================================="
    log "NexusTradeAI Logging Setup"
    log "=========================================="

    setup_log_directories
    setup_logrotate
    create_logging_library
    setup_log_aggregation
    create_log_analysis_tools

    log "=========================================="
    log_success "Logging setup complete!"
    log "=========================================="
    echo ""
    log "Available commands:"
    log "  - Rotate logs: logrotate -f $SCRIPT_DIR/logrotate.conf"
    log "  - Aggregate logs: $ROOT_DIR/infrastructure/logging/aggregate-logs.sh"
    log "  - Analyze logs: $ROOT_DIR/infrastructure/logging/analyze-logs.sh"
    echo ""
}

main "$@"
EOFLOGROTATE

chmod +x "$ROOT_DIR/infrastructure/logging/setup-logging.sh"

log_success "Logging system configured"
}

###############################################################################
# Install Dependencies
###############################################################################

install_winston() {
    log "Installing Winston logging library..."

    if [[ ! -f "$ROOT_DIR/package.json" ]]; then
        log_error "package.json not found in root directory"
        return 1
    fi

    cd "$ROOT_DIR"
    npm install winston --save

    log_success "Winston installed"
}

###############################################################################
# Main
###############################################################################

main() {
    log "=========================================="
    log "NexusTradeAI Logging Setup"
    log "=========================================="

    setup_log_directories
    setup_logrotate
    create_logging_library
    setup_log_aggregation
    create_log_analysis_tools
    # install_winston  # Uncomment if Winston not installed

    log "=========================================="
    log_success "Logging setup complete!"
    log "=========================================="
    echo ""
    log "Next steps:"
    log "  1. Test logrotate: logrotate -d $SCRIPT_DIR/logrotate.conf"
    log "  2. Aggregate logs: $ROOT_DIR/infrastructure/logging/aggregate-logs.sh"
    log "  3. Analyze logs: $ROOT_DIR/infrastructure/logging/analyze-logs.sh [logfile]"
    echo ""
}

main "$@"
