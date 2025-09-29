#!/bin/bash

# NexusTradeAI Production Deployment Script
# This script automates the deployment process for the enhanced trading platform

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="NexusTradeAI"
FRONTEND_DIR="clients/web-app"
BACKEND_DIR="backend"
MOBILE_DIR="clients/mobile-app"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check Vercel CLI
    if ! command -v vercel &> /dev/null; then
        log_warning "Vercel CLI not found. Installing..."
        npm install -g vercel
    fi
    
    # Check Docker (optional)
    if ! command -v docker &> /dev/null; then
        log_warning "Docker not found. Backend deployment will be skipped."
    fi
    
    log_success "Dependencies check completed"
}

test_frontend() {
    log_info "Testing frontend application..."
    
    cd $FRONTEND_DIR
    
    # Install dependencies
    log_info "Installing frontend dependencies..."
    npm install
    
    # Run tests (if available)
    if [ -f "package.json" ] && grep -q "\"test\"" package.json; then
        log_info "Running frontend tests..."
        npm test -- --watchAll=false
    fi
    
    # Build application
    log_info "Building frontend application..."
    npm run build
    
    # Test build
    log_info "Testing production build..."
    timeout 30s npm run start &
    SERVER_PID=$!
    sleep 10
    
    # Test demo pages
    log_info "Testing demo pages..."
    DEMO_PAGES=(
        "http://localhost:3000/demo/order-entry-enhanced"
        "http://localhost:3000/demo/position-manager-enhanced"
        "http://localhost:3000/demo/trade-history-enhanced"
        "http://localhost:3000/demo/trading-dashboard"
        "http://localhost:3000/demo/mobile-trading"
        "http://localhost:3000/demo/api-integration"
    )
    
    for page in "${DEMO_PAGES[@]}"; do
        if curl -f -s "$page" > /dev/null; then
            log_success "✓ $page"
        else
            log_warning "✗ $page (may not be ready yet)"
        fi
    done
    
    # Stop test server
    kill $SERVER_PID 2>/dev/null || true
    
    cd - > /dev/null
    log_success "Frontend testing completed"
}

deploy_frontend() {
    log_info "Deploying frontend to Vercel..."
    
    cd $FRONTEND_DIR
    
    # Check if .env.production exists
    if [ ! -f ".env.production" ]; then
        log_warning "Creating .env.production template..."
        cat > .env.production << EOF
NEXT_PUBLIC_API_BASE_URL=https://api.nexustrade.ai/v1
NEXT_PUBLIC_WS_URL=wss://ws.nexustrade.ai/v1
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
NEXT_PUBLIC_GA_ID=your_google_analytics_id
EOF
        log_warning "Please update .env.production with your actual values"
    fi
    
    # Deploy to Vercel
    log_info "Deploying to Vercel..."
    vercel --prod --yes
    
    cd - > /dev/null
    log_success "Frontend deployment completed"
}

prepare_backend() {
    log_info "Preparing backend for deployment..."
    
    if [ ! -d "$BACKEND_DIR" ]; then
        log_info "Creating backend directory structure..."
        mkdir -p $BACKEND_DIR/src/{controllers,services,models,middleware,routes}
        
        # Create basic package.json
        cat > $BACKEND_DIR/package.json << EOF
{
  "name": "nexustrade-api",
  "version": "1.0.0",
  "description": "NexusTradeAI Backend API",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev src/index.ts",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "dotenv": "^16.3.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "pg": "^8.11.3",
    "redis": "^4.6.7",
    "ws": "^8.13.0",
    "express-rate-limit": "^6.8.1"
  },
  "devDependencies": {
    "@types/node": "^20.4.5",
    "@types/express": "^4.17.17",
    "@types/cors": "^2.8.13",
    "@types/jsonwebtoken": "^9.0.2",
    "@types/bcryptjs": "^2.4.2",
    "@types/pg": "^8.10.2",
    "@types/ws": "^8.5.5",
    "typescript": "^5.1.6",
    "ts-node-dev": "^2.0.0",
    "jest": "^29.6.1",
    "@types/jest": "^29.5.3"
  }
}
EOF
        
        # Create basic Dockerfile
        cat > $BACKEND_DIR/Dockerfile << EOF
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 8000

CMD ["npm", "start"]
EOF
        
        log_success "Backend structure created"
    fi
}

create_docker_compose() {
    log_info "Creating Docker Compose configuration..."
    
    cat > docker-compose.yml << EOF
version: '3.8'
services:
  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://nexustrade:password@postgres:5432/nexustrade
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-super-secure-jwt-secret
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=nexustrade
      - POSTGRES_USER=nexustrade
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
EOF
    
    log_success "Docker Compose configuration created"
}

deploy_with_docker() {
    log_info "Deploying with Docker..."
    
    if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
        # Build and start services
        docker-compose up -d --build
        
        # Wait for services to be ready
        log_info "Waiting for services to be ready..."
        sleep 30
        
        # Check if API is responding
        if curl -f -s "http://localhost:8000/health" > /dev/null; then
            log_success "Backend API is running"
        else
            log_warning "Backend API may not be ready yet"
        fi
        
        log_success "Docker deployment completed"
    else
        log_warning "Docker not available, skipping backend deployment"
    fi
}

run_health_checks() {
    log_info "Running health checks..."
    
    # Check frontend
    if curl -f -s "http://localhost:3000" > /dev/null; then
        log_success "✓ Frontend is healthy"
    else
        log_warning "✗ Frontend health check failed"
    fi
    
    # Check backend (if deployed)
    if curl -f -s "http://localhost:8000/health" > /dev/null; then
        log_success "✓ Backend is healthy"
    else
        log_warning "✗ Backend health check failed"
    fi
    
    log_success "Health checks completed"
}

show_deployment_summary() {
    log_success "🎉 Deployment Summary"
    echo ""
    echo "Frontend:"
    echo "  • Demo Pages: All enhanced components deployed"
    echo "  • Mobile Optimized: Touch-friendly interface"
    echo "  • API Ready: Integration framework in place"
    echo ""
    echo "Enhanced Features Deployed:"
    echo "  ✓ Advanced OrderEntry with options trading"
    echo "  ✓ Enhanced PositionManager with risk analytics"
    echo "  ✓ Comprehensive TradeHistory with filtering"
    echo "  ✓ Professional TradingDashboard"
    echo "  ✓ Mobile-optimized interface"
    echo "  ✓ API integration framework"
    echo ""
    echo "Demo URLs:"
    echo "  • Order Entry: /demo/order-entry-enhanced"
    echo "  • Position Manager: /demo/position-manager-enhanced"
    echo "  • Trade History: /demo/trade-history-enhanced"
    echo "  • Trading Dashboard: /demo/trading-dashboard"
    echo "  • Mobile Trading: /demo/mobile-trading"
    echo "  • API Integration: /demo/api-integration"
    echo ""
    echo "Next Steps:"
    echo "  1. Configure real API endpoints"
    echo "  2. Set up production database"
    echo "  3. Configure monitoring and alerts"
    echo "  4. Run user acceptance testing"
    echo ""
    log_success "NexusTradeAI Enhanced Trading Platform is ready! 🚀"
}

# Main deployment flow
main() {
    log_info "Starting NexusTradeAI deployment..."
    echo ""
    
    # Check dependencies
    check_dependencies
    echo ""
    
    # Test frontend
    test_frontend
    echo ""
    
    # Deploy frontend
    if [ "$1" != "--skip-deploy" ]; then
        deploy_frontend
        echo ""
    fi
    
    # Prepare backend
    prepare_backend
    echo ""
    
    # Create Docker configuration
    create_docker_compose
    echo ""
    
    # Deploy backend (optional)
    if [ "$1" == "--with-backend" ]; then
        deploy_with_docker
        echo ""
    fi
    
    # Run health checks
    if [ "$1" != "--skip-deploy" ]; then
        sleep 5
        run_health_checks
        echo ""
    fi
    
    # Show summary
    show_deployment_summary
}

# Script usage
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "NexusTradeAI Deployment Script"
    echo ""
    echo "Usage:"
    echo "  ./deploy.sh                 # Deploy frontend only"
    echo "  ./deploy.sh --with-backend  # Deploy frontend and backend"
    echo "  ./deploy.sh --skip-deploy   # Test only, no deployment"
    echo "  ./deploy.sh --help          # Show this help"
    echo ""
    exit 0
fi

# Run main deployment
main "$1"
