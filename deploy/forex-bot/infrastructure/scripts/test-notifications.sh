#!/bin/bash
###############################################################################
# Notification Testing Script
# ============================
# Tests email, Slack, and PagerDuty notification channels
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

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

###############################################################################
# Load Environment
###############################################################################

load_environment() {
    local env_file="$ROOT_DIR/.env.production"

    if [ ! -f "$env_file" ]; then
        log_error ".env.production not found"
        exit 1
    fi

    # Load environment variables
    export $(grep -v '^#' "$env_file" | xargs)

    log_success "Environment loaded"
}

###############################################################################
# Test Email Notification
###############################################################################

test_email() {
    log "Testing email notification..."

    # Check required variables
    if [ -z "${SMTP_HOST:-}" ] || [ -z "${SMTP_PORT:-}" ] || [ -z "${SMTP_USER:-}" ] || [ -z "${SMTP_PASSWORD:-}" ]; then
        log_error "SMTP configuration missing in .env.production"
        echo "Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD"
        return 1
    fi

    log "SMTP Configuration:"
    echo "  Host: $SMTP_HOST:$SMTP_PORT"
    echo "  User: $SMTP_USER"
    echo "  From: ${SMTP_FROM:-$SMTP_USER}"
    echo "  To: ${ALERT_EMAIL_TO:-$SMTP_USER}"

    # Test SMTP connection
    log "Testing SMTP connection..."
    if command -v nc &> /dev/null; then
        if timeout 5 bash -c "echo > /dev/tcp/$SMTP_HOST/$SMTP_PORT" 2>/dev/null; then
            log_success "SMTP server reachable"
        else
            log_error "Cannot connect to SMTP server"
            return 1
        fi
    fi

    # Send test email via Alertmanager
    log "Sending test email via Alertmanager..."

    local alertmanager_url="${ALERTMANAGER_URL:-http://localhost:9093}"

    curl -X POST "$alertmanager_url/api/v1/alerts" \
        -H "Content-Type: application/json" \
        -d '[{
            "labels": {
                "alertname": "EmailTest",
                "severity": "info",
                "component": "testing"
            },
            "annotations": {
                "summary": "Email Notification Test",
                "description": "This is a test email from NexusTradeAI monitoring system. If you receive this, email notifications are working correctly."
            },
            "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
            "endsAt": "'$(date -u -d '+5 minutes' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v +5M +%Y-%m-%dT%H:%M:%S.000Z)'"
        }]' 2>/dev/null

    if [ $? -eq 0 ]; then
        log_success "Test email sent to Alertmanager"
        echo ""
        echo "=========================================="
        echo "CHECK YOUR EMAIL"
        echo "=========================================="
        echo "An email should arrive at: ${ALERT_EMAIL_TO:-$SMTP_USER}"
        echo "Subject: [NexusTradeAI] EmailTest"
        echo ""
        echo "If you don't receive it within 2 minutes:"
        echo "  1. Check spam folder"
        echo "  2. Verify SMTP credentials"
        echo "  3. Check Alertmanager logs:"
        echo "     docker logs nexustrade-alertmanager-prod | grep -i email"
        echo "=========================================="
    else
        log_error "Failed to send test email"
        return 1
    fi
}

###############################################################################
# Test Slack Notification
###############################################################################

test_slack() {
    log "Testing Slack notification..."

    if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
        log_error "SLACK_WEBHOOK_URL not configured in .env.production"
        echo ""
        echo "To configure Slack:"
        echo "  1. Go to https://api.slack.com/messaging/webhooks"
        echo "  2. Create incoming webhook"
        echo "  3. Add SLACK_WEBHOOK_URL to .env.production"
        return 1
    fi

    # Validate webhook URL format
    if [[ ! "$SLACK_WEBHOOK_URL" =~ ^https://hooks.slack.com/services/ ]]; then
        log_error "Invalid Slack webhook URL format"
        return 1
    fi

    log "Slack webhook configured"
    echo "  URL: ${SLACK_WEBHOOK_URL:0:40}..."
    echo "  Channel: ${SLACK_CHANNEL:-#trading-alerts}"

    # Test direct webhook
    log "Sending test message to Slack..."

    local payload=$(cat <<EOF
{
    "channel": "${SLACK_CHANNEL:-#trading-alerts}",
    "username": "NexusTradeAI Monitoring",
    "icon_emoji": ":robot_face:",
    "text": "✅ Slack Notification Test",
    "attachments": [{
        "color": "good",
        "title": "Notification System Test",
        "text": "This is a test message from NexusTradeAI monitoring system. If you receive this, Slack notifications are working correctly.",
        "footer": "NexusTradeAI",
        "ts": $(date +%s)
    }]
}
EOF
)

    local response=$(curl -X POST "$SLACK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w "\n%{http_code}" \
        -s)

    local http_code=$(echo "$response" | tail -1)

    if [ "$http_code" == "200" ]; then
        log_success "Test message sent to Slack"
        echo ""
        echo "=========================================="
        echo "CHECK YOUR SLACK CHANNEL"
        echo "=========================================="
        echo "A message should appear in: ${SLACK_CHANNEL:-#trading-alerts}"
        echo ""
        echo "If you don't see it:"
        echo "  1. Verify channel exists"
        echo "  2. Check webhook URL is correct"
        echo "  3. Ensure bot has permission to post"
        echo "=========================================="
    else
        log_error "Failed to send Slack message (HTTP $http_code)"
        echo "$response" | head -1
        return 1
    fi

    # Test via Alertmanager
    log "Sending test alert via Alertmanager..."

    local alertmanager_url="${ALERTMANAGER_URL:-http://localhost:9093}"

    curl -X POST "$alertmanager_url/api/v1/alerts" \
        -H "Content-Type: application/json" \
        -d '[{
            "labels": {
                "alertname": "SlackTest",
                "severity": "warning",
                "component": "testing"
            },
            "annotations": {
                "summary": "Slack Alert Test",
                "description": "This is a test alert from Alertmanager. Slack integration is working."
            },
            "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
            "endsAt": "'$(date -u -d '+5 minutes' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v +5M +%Y-%m-%dT%H:%M:%S.000Z)'"
        }]' 2>/dev/null

    if [ $? -eq 0 ]; then
        log_success "Test alert sent to Alertmanager"
    else
        log_warning "Failed to send alert via Alertmanager"
    fi
}

###############################################################################
# Test PagerDuty Notification
###############################################################################

test_pagerduty() {
    log "Testing PagerDuty notification..."

    if [ -z "${PAGERDUTY_INTEGRATION_KEY:-}" ]; then
        log_warning "PAGERDUTY_INTEGRATION_KEY not configured (optional)"
        echo ""
        echo "To configure PagerDuty:"
        echo "  1. Go to https://www.pagerduty.com"
        echo "  2. Create service integration (Events API v2)"
        echo "  3. Add PAGERDUTY_INTEGRATION_KEY to .env.production"
        return 0
    fi

    log "PagerDuty integration key configured"

    # Send test event
    log "Sending test event to PagerDuty..."

    local payload=$(cat <<EOF
{
    "routing_key": "$PAGERDUTY_INTEGRATION_KEY",
    "event_action": "trigger",
    "payload": {
        "summary": "PagerDuty Notification Test",
        "severity": "info",
        "source": "NexusTradeAI Monitoring",
        "custom_details": {
            "message": "This is a test incident from NexusTradeAI. If you receive this, PagerDuty integration is working."
        }
    }
}
EOF
)

    local response=$(curl -X POST "https://events.pagerduty.com/v2/enqueue" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w "\n%{http_code}" \
        -s)

    local http_code=$(echo "$response" | tail -1)
    local body=$(echo "$response" | head -1)

    if [ "$http_code" == "202" ]; then
        log_success "Test event sent to PagerDuty"
        echo ""
        echo "=========================================="
        echo "CHECK YOUR PAGERDUTY"
        echo "=========================================="
        echo "An incident should be created"
        echo ""
        echo "Event Response:"
        echo "$body" | jq . 2>/dev/null || echo "$body"
        echo ""
        echo "If you don't see it:"
        echo "  1. Verify integration key is correct"
        echo "  2. Check PagerDuty service settings"
        echo "  3. Ensure service is active"
        echo "=========================================="
    else
        log_error "Failed to send PagerDuty event (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

###############################################################################
# Test All Channels
###############################################################################

test_all() {
    log "Testing all notification channels..."
    echo ""

    local failed=0

    echo "=========================================="
    echo "EMAIL NOTIFICATIONS"
    echo "=========================================="
    test_email || ((failed++))

    echo ""
    echo "=========================================="
    echo "SLACK NOTIFICATIONS"
    echo "=========================================="
    test_slack || ((failed++))

    echo ""
    echo "=========================================="
    echo "PAGERDUTY NOTIFICATIONS"
    echo "=========================================="
    test_pagerduty || ((failed++))

    echo ""
    echo "=========================================="
    echo "SUMMARY"
    echo "=========================================="

    if [ $failed -eq 0 ]; then
        log_success "All configured notification channels tested successfully"
        return 0
    else
        log_warning "$failed notification channel(s) failed or not configured"
        return 1
    fi
}

###############################################################################
# Simulate Production Alert
###############################################################################

simulate_production_alert() {
    local alert_type="${1:-HighMemoryUsage}"

    log "Simulating production alert: $alert_type"

    local alertmanager_url="${ALERTMANAGER_URL:-http://localhost:9093}"

    case "$alert_type" in
        HighMemoryUsage)
            local payload='[{
                "labels": {
                    "alertname": "HighMemoryUsage",
                    "severity": "warning",
                    "component": "memory",
                    "instance": "trading-bot"
                },
                "annotations": {
                    "summary": "High memory usage detected",
                    "description": "Memory usage is at 85%. This is a test alert.",
                    "runbook": "infrastructure/monitoring/runbooks/HIGH_MEMORY_USAGE.md"
                },
                "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
            }]'
            ;;

        CriticalMemoryUsage)
            local payload='[{
                "labels": {
                    "alertname": "CriticalMemoryUsage",
                    "severity": "critical",
                    "component": "memory",
                    "instance": "trading-bot"
                },
                "annotations": {
                    "summary": "CRITICAL: Memory exhaustion imminent",
                    "description": "Memory usage is at 95%. Bot may crash. This is a test alert.",
                    "runbook": "infrastructure/monitoring/runbooks/CRITICAL_MEMORY_USAGE.md"
                },
                "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
            }]'
            ;;

        NegativePnL)
            local payload='[{
                "labels": {
                    "alertname": "NegativePnL",
                    "severity": "critical",
                    "component": "trading",
                    "instance": "trading-bot"
                },
                "annotations": {
                    "summary": "Significant trading losses detected",
                    "description": "Total P&L is -$1500. This is a test alert.",
                    "runbook": "infrastructure/monitoring/runbooks/NEGATIVE_PNL.md"
                },
                "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
            }]'
            ;;

        *)
            log_error "Unknown alert type: $alert_type"
            echo "Available types: HighMemoryUsage, CriticalMemoryUsage, NegativePnL"
            return 1
            ;;
    esac

    curl -X POST "$alertmanager_url/api/v1/alerts" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -s > /dev/null

    if [ $? -eq 0 ]; then
        log_success "Simulated alert sent: $alert_type"
        echo ""
        echo "Check your notification channels:"
        echo "  - Email: ${ALERT_EMAIL_TO:-not configured}"
        echo "  - Slack: ${SLACK_CHANNEL:-not configured}"
        echo "  - PagerDuty: $([ -n "${PAGERDUTY_INTEGRATION_KEY:-}" ] && echo 'configured' || echo 'not configured')"
    else
        log_error "Failed to send alert"
        return 1
    fi
}

###############################################################################
# Display Usage
###############################################################################

display_usage() {
    cat << EOF
Notification Testing Script for NexusTradeAI
=============================================

Usage: $0 <command> [options]

Commands:
  email
      Test email notifications (SMTP)

  slack
      Test Slack notifications

  pagerduty
      Test PagerDuty notifications

  all
      Test all configured notification channels

  simulate <alert_type>
      Simulate a production alert
      Alert types: HighMemoryUsage, CriticalMemoryUsage, NegativePnL

  help
      Display this help message

Examples:
  # Test individual channels
  $0 email
  $0 slack
  $0 pagerduty

  # Test all channels
  $0 all

  # Simulate production alerts
  $0 simulate HighMemoryUsage
  $0 simulate CriticalMemoryUsage
  $0 simulate NegativePnL

Prerequisites:
  - .env.production with notification credentials
  - Alertmanager running (docker-compose up)
  - Network access to SMTP/Slack/PagerDuty

Configuration (.env.production):
  Email:
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=alerts@yourdomain.com
    SMTP_PASSWORD=<app_password>
    SMTP_FROM=NexusTradeAI Alerts <alerts@yourdomain.com>
    ALERT_EMAIL_TO=team@yourdomain.com

  Slack:
    SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
    SLACK_CHANNEL=#trading-alerts

  PagerDuty (optional):
    PAGERDUTY_INTEGRATION_KEY=<your_integration_key>

Troubleshooting:
  Email not received:
    - Check spam folder
    - Verify SMTP credentials
    - Check: docker logs nexustrade-alertmanager-prod | grep -i email

  Slack not received:
    - Verify webhook URL
    - Check channel exists
    - Check: docker logs nexustrade-alertmanager-prod | grep -i slack

  PagerDuty not received:
    - Verify integration key
    - Check service is active
    - Check PagerDuty service integration settings

EOF
}

###############################################################################
# Main
###############################################################################

main() {
    local command="${1:-help}"

    # Load environment for all commands except help
    if [ "$command" != "help" ]; then
        load_environment
    fi

    case "$command" in
        email)
            test_email
            ;;

        slack)
            test_slack
            ;;

        pagerduty)
            test_pagerduty
            ;;

        all)
            test_all
            ;;

        simulate)
            simulate_production_alert "${2:-HighMemoryUsage}"
            ;;

        help|*)
            display_usage
            ;;
    esac
}

main "$@"
