#!/bin/bash
###############################################################################
# SSL/TLS Setup Script
# =====================
# Automated SSL certificate generation and configuration
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SSL_DIR="$ROOT_DIR/infrastructure/ssl"

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
# Prerequisites
###############################################################################

check_prerequisites() {
    log "Checking prerequisites..."

    # Check for required commands
    local required_commands=("openssl")
    local missing=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required commands: ${missing[*]}"
        exit 1
    fi

    log_success "Prerequisites met"
}

###############################################################################
# Setup SSL Directory
###############################################################################

setup_ssl_directory() {
    log "Setting up SSL directory..."

    mkdir -p "$SSL_DIR"
    mkdir -p "$SSL_DIR/archive"
    mkdir -p "$SSL_DIR/live"
    chmod 700 "$SSL_DIR"
    chmod 700 "$SSL_DIR"/*

    log_success "SSL directory created"
}

###############################################################################
# Generate Self-Signed Certificate
###############################################################################

generate_self_signed() {
    local domain="${1:-nexustradeai.local}"
    local days="${2:-365}"

    log "Generating self-signed certificate for $domain..."

    # Generate private key
    openssl genrsa -out "$SSL_DIR/privkey.pem" 2048
    chmod 600 "$SSL_DIR/privkey.pem"

    # Generate certificate signing request
    openssl req -new \
        -key "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/cert.csr" \
        -subj "/C=US/ST=State/L=City/O=NexusTradeAI/CN=$domain"

    # Generate self-signed certificate
    openssl x509 -req \
        -days "$days" \
        -in "$SSL_DIR/cert.csr" \
        -signkey "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/cert.pem" \
        -extfile <(printf "subjectAltName=DNS:$domain,DNS:*.$domain")

    # Create fullchain (for compatibility)
    cat "$SSL_DIR/cert.pem" > "$SSL_DIR/fullchain.pem"

    chmod 644 "$SSL_DIR/cert.pem"
    chmod 644 "$SSL_DIR/fullchain.pem"

    log_success "Self-signed certificate generated"

    # Display certificate info
    log "Certificate details:"
    openssl x509 -in "$SSL_DIR/cert.pem" -text -noout | grep -A 2 "Subject:"
    openssl x509 -in "$SSL_DIR/cert.pem" -text -noout | grep -A 2 "Validity"

    log_warning "Self-signed certificates are NOT trusted by browsers"
    log_warning "Use only for development/testing"
}

###############################################################################
# Generate CSR for Commercial Certificate
###############################################################################

generate_csr() {
    local domain="${1}"
    local organization="${2:-NexusTradeAI Inc}"
    local country="${3:-US}"
    local state="${4:-California}"
    local city="${5:-San Francisco}"

    if [ -z "$domain" ]; then
        log_error "Domain required for CSR generation"
        echo "Usage: $0 csr <domain> [organization] [country] [state] [city]"
        exit 1
    fi

    log "Generating CSR for $domain..."

    # Generate private key (4096-bit for commercial)
    openssl genrsa -out "$SSL_DIR/privkey.pem" 4096
    chmod 600 "$SSL_DIR/privkey.pem"

    # Generate CSR with SAN extension
    openssl req -new \
        -key "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/$domain.csr" \
        -subj "/C=$country/ST=$state/L=$city/O=$organization/CN=$domain" \
        -reqexts SAN \
        -config <(cat /etc/ssl/openssl.cnf <(printf "\n[SAN]\nsubjectAltName=DNS:$domain,DNS:www.$domain"))

    chmod 644 "$SSL_DIR/$domain.csr"

    log_success "CSR generated: $SSL_DIR/$domain.csr"

    echo ""
    echo "=========================================="
    echo "CSR Content (submit to Certificate Authority):"
    echo "=========================================="
    cat "$SSL_DIR/$domain.csr"
    echo ""
    echo "=========================================="
    echo ""
    echo "Next Steps:"
    echo "1. Copy the CSR content above"
    echo "2. Submit to Certificate Authority (DigiCert, GlobalSign, etc.)"
    echo "3. Receive certificate files:"
    echo "   - domain.crt (your certificate)"
    echo "   - intermediate.crt (CA intermediate certificate)"
    echo "   - root.crt (CA root certificate)"
    echo "4. Run: $0 install-commercial $domain"
}

###############################################################################
# Install Commercial Certificate
###############################################################################

install_commercial() {
    local domain="${1}"

    if [ -z "$domain" ]; then
        log_error "Domain required"
        echo "Usage: $0 install-commercial <domain>"
        exit 1
    fi

    log "Installing commercial certificate for $domain..."

    # Check for required files
    if [ ! -f "$domain.crt" ]; then
        log_error "Certificate file not found: $domain.crt"
        exit 1
    fi

    if [ ! -f "intermediate.crt" ]; then
        log_warning "Intermediate certificate not found (recommended)"
    fi

    # Create fullchain
    cat "$domain.crt" > "$SSL_DIR/fullchain.pem"
    if [ -f "intermediate.crt" ]; then
        cat "intermediate.crt" >> "$SSL_DIR/fullchain.pem"
    fi
    if [ -f "root.crt" ]; then
        cat "root.crt" >> "$SSL_DIR/fullchain.pem"
    fi

    chmod 644 "$SSL_DIR/fullchain.pem"

    # Copy certificate
    cp "$domain.crt" "$SSL_DIR/cert.pem"
    chmod 644 "$SSL_DIR/cert.pem"

    log_success "Commercial certificate installed"

    # Verify certificate chain
    verify_certificate
}

###############################################################################
# Let's Encrypt (Certbot)
###############################################################################

setup_letsencrypt() {
    local domain="${1}"
    local email="${2}"
    local webroot="${3:-/var/www/html}"

    if [ -z "$domain" ] || [ -z "$email" ]; then
        log_error "Domain and email required"
        echo "Usage: $0 letsencrypt <domain> <email> [webroot]"
        exit 1
    fi

    log "Setting up Let's Encrypt for $domain..."

    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        log "Installing Certbot..."
        if [ -f /etc/debian_version ]; then
            sudo apt-get update
            sudo apt-get install -y certbot
        elif [ -f /etc/redhat-release ]; then
            sudo yum install -y certbot
        elif [ "$(uname)" == "Darwin" ]; then
            brew install certbot
        else
            log_error "Unsupported OS for automatic Certbot installation"
            exit 1
        fi
    fi

    # Obtain certificate (webroot method)
    log "Obtaining certificate from Let's Encrypt..."
    sudo certbot certonly --webroot \
        -w "$webroot" \
        -d "$domain" \
        -d "www.$domain" \
        --email "$email" \
        --agree-tos \
        --non-interactive \
        --staple-ocsp

    # Copy certificates to our SSL directory
    if [ -d "/etc/letsencrypt/live/$domain" ]; then
        sudo cp "/etc/letsencrypt/live/$domain/fullchain.pem" "$SSL_DIR/"
        sudo cp "/etc/letsencrypt/live/$domain/privkey.pem" "$SSL_DIR/"
        sudo chown $(whoami):$(whoami) "$SSL_DIR"/*.pem
        chmod 600 "$SSL_DIR/privkey.pem"
        chmod 644 "$SSL_DIR/fullchain.pem"

        log_success "Let's Encrypt certificate installed"

        # Set up auto-renewal
        setup_auto_renewal "$domain"
    else
        log_error "Certificate generation failed"
        exit 1
    fi
}

###############################################################################
# Auto-Renewal Setup
###############################################################################

setup_auto_renewal() {
    local domain="${1}"

    log "Setting up auto-renewal..."

    # Create renewal hook script
    cat > "$SSL_DIR/renewal-hook.sh" << 'EOF'
#!/bin/bash
# Let's Encrypt renewal hook
# Runs after successful renewal

DOMAIN="$RENEWED_DOMAINS"
SSL_DIR="/opt/nexustradeai/infrastructure/ssl"

# Copy new certificates
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/"

# Reload web server
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
fi

# Restart trading bot (if using HTTPS)
if docker ps | grep -q nexustrade-bot-prod; then
    docker restart nexustrade-bot-prod
fi

echo "$(date): Certificates renewed and services reloaded" >> "$SSL_DIR/renewal.log"
EOF

    chmod +x "$SSL_DIR/renewal-hook.sh"

    # Add to certbot renewal config
    if [ -f "/etc/letsencrypt/renewal/$domain.conf" ]; then
        sudo bash -c "cat >> /etc/letsencrypt/renewal/$domain.conf" << EOF

[renewalparams]
renew_hook = $SSL_DIR/renewal-hook.sh
EOF
    fi

    # Set up cron job for renewal check (daily)
    (crontab -l 2>/dev/null | grep -v "certbot renew"; echo "0 3 * * * certbot renew --quiet") | crontab -

    log_success "Auto-renewal configured"
    log "Certificates will be checked daily at 3 AM"
}

###############################################################################
# Verify Certificate
###############################################################################

verify_certificate() {
    log "Verifying certificate..."

    if [ ! -f "$SSL_DIR/cert.pem" ] && [ ! -f "$SSL_DIR/fullchain.pem" ]; then
        log_error "No certificate found"
        return 1
    fi

    local cert_file="$SSL_DIR/cert.pem"
    if [ ! -f "$cert_file" ] && [ -f "$SSL_DIR/fullchain.pem" ]; then
        cert_file="$SSL_DIR/fullchain.pem"
    fi

    # Check certificate expiration
    local expiry=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
    log "Certificate expires: $expiry"

    # Check days until expiration
    local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s)
    local current_epoch=$(date +%s)
    local days_left=$(( ($expiry_epoch - $current_epoch) / 86400 ))

    if [ $days_left -lt 0 ]; then
        log_error "Certificate EXPIRED $((days_left * -1)) days ago!"
        return 1
    elif [ $days_left -lt 30 ]; then
        log_warning "Certificate expires in $days_left days - RENEW SOON"
    else
        log_success "Certificate valid ($days_left days remaining)"
    fi

    # Display certificate details
    echo ""
    echo "Certificate Details:"
    openssl x509 -in "$cert_file" -text -noout | grep -A 1 "Subject:"
    openssl x509 -in "$cert_file" -text -noout | grep -A 1 "Issuer:"
    openssl x509 -in "$cert_file" -text -noout | grep -A 1 "Validity"
    openssl x509 -in "$cert_file" -text -noout | grep -A 1 "Subject Alternative Name"

    # Verify private key matches certificate
    if [ -f "$SSL_DIR/privkey.pem" ]; then
        local cert_modulus=$(openssl x509 -in "$cert_file" -noout -modulus | openssl md5)
        local key_modulus=$(openssl rsa -in "$SSL_DIR/privkey.pem" -noout -modulus 2>/dev/null | openssl md5)

        if [ "$cert_modulus" == "$key_modulus" ]; then
            log_success "Private key matches certificate"
        else
            log_error "Private key DOES NOT match certificate!"
            return 1
        fi
    fi

    return 0
}

###############################################################################
# Test HTTPS Connection
###############################################################################

test_https() {
    local domain="${1:-localhost}"
    local port="${2:-443}"

    log "Testing HTTPS connection to $domain:$port..."

    # Test with openssl
    echo | openssl s_client -connect "$domain:$port" -servername "$domain" 2>/dev/null | head -20

    # Test with curl
    if curl --version &>/dev/null; then
        log "Testing with curl..."
        curl -I "https://$domain" --max-time 5 || log_warning "HTTPS connection failed"
    fi
}

###############################################################################
# Backup Certificates
###############################################################################

backup_certificates() {
    log "Backing up certificates..."

    local backup_dir="$SSL_DIR/archive"
    local backup_file="$backup_dir/ssl-backup-$(date +%Y%m%d-%H%M%S).tar.gz"

    mkdir -p "$backup_dir"

    tar -czf "$backup_file" \
        -C "$SSL_DIR" \
        cert.pem \
        fullchain.pem \
        privkey.pem \
        2>/dev/null || true

    chmod 600 "$backup_file"

    log_success "Backup created: $backup_file"

    # Keep last 12 backups
    ls -t "$backup_dir"/ssl-backup-*.tar.gz | tail -n +13 | xargs rm -f 2>/dev/null || true
}

###############################################################################
# Display Usage
###############################################################################

display_usage() {
    cat << EOF
SSL/TLS Setup Script for NexusTradeAI
======================================

Usage: $0 <command> [options]

Commands:
  self-signed [domain] [days]
      Generate self-signed certificate
      Default: nexustradeai.local, 365 days
      Example: $0 self-signed myapp.local 180

  csr <domain> [organization] [country] [state] [city]
      Generate Certificate Signing Request for commercial CA
      Example: $0 csr nexustradeai.com "NexusTradeAI Inc" US CA "San Francisco"

  install-commercial <domain>
      Install commercial certificate
      Requires: domain.crt, intermediate.crt, root.crt in current directory
      Example: $0 install-commercial nexustradeai.com

  letsencrypt <domain> <email> [webroot]
      Obtain Let's Encrypt certificate
      Example: $0 letsencrypt nexustradeai.com admin@example.com

  verify
      Verify installed certificate

  test [domain] [port]
      Test HTTPS connection
      Example: $0 test nexustradeai.com 443

  backup
      Backup current certificates

  help
      Display this help message

Examples:
  # Development (self-signed)
  $0 self-signed

  # Production (Let's Encrypt)
  $0 letsencrypt nexustradeai.com admin@nexustradeai.com

  # Production (Commercial Certificate)
  $0 csr nexustradeai.com
  # Submit CSR to CA, receive certificates
  $0 install-commercial nexustradeai.com

  # Verify and test
  $0 verify
  $0 test nexustradeai.com 443

Files:
  $SSL_DIR/privkey.pem     - Private key (600 permissions)
  $SSL_DIR/cert.pem        - Certificate
  $SSL_DIR/fullchain.pem   - Full certificate chain
  $SSL_DIR/archive/        - Backups

Security Notes:
  - Private keys are set to 600 permissions (owner read/write only)
  - Certificates are set to 644 permissions (world-readable)
  - Always backup before renewal/replacement
  - Rotate certificates every 90 days (Let's Encrypt auto-renews)
  - Use 2048-bit minimum (4096-bit recommended for production)

EOF
}

###############################################################################
# Main
###############################################################################

main() {
    local command="${1:-help}"

    case "$command" in
        self-signed)
            check_prerequisites
            setup_ssl_directory
            generate_self_signed "${2:-nexustradeai.local}" "${3:-365}"
            backup_certificates
            ;;

        csr)
            check_prerequisites
            setup_ssl_directory
            generate_csr "$2" "${3:-NexusTradeAI Inc}" "${4:-US}" "${5:-California}" "${6:-San Francisco}"
            ;;

        install-commercial)
            check_prerequisites
            setup_ssl_directory
            install_commercial "$2"
            backup_certificates
            ;;

        letsencrypt)
            check_prerequisites
            setup_ssl_directory
            setup_letsencrypt "$2" "$3" "${4:-/var/www/html}"
            backup_certificates
            ;;

        verify)
            verify_certificate
            ;;

        test)
            test_https "${2:-localhost}" "${3:-443}"
            ;;

        backup)
            backup_certificates
            ;;

        help|*)
            display_usage
            ;;
    esac
}

main "$@"
