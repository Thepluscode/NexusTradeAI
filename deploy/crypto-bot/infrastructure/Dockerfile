# NexusTradeAI Production Docker Image
# ====================================
# Multi-stage build for optimized production container

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY clients/bot-dashboard/package*.json ./clients/bot-dashboard/

# Install dependencies (including devDependencies for building)
RUN npm ci && \
    cd clients/bot-dashboard && \
    npm ci

# Copy source code
COPY . .

# Remove development files
RUN rm -rf \
    clients/web-app/.next \
    clients/mobile-app \
    ai-ml \
    *.md \
    .git

# Production stage
FROM node:22-alpine

# Install production tools
RUN apk add --no-cache \
    curl \
    tini \
    dumb-init

# Create app user (don't run as root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app ./

# Install production dependencies only
RUN npm ci --only=production && \
    cd clients/bot-dashboard && \
    npm ci --only=production

# Create necessary directories
RUN mkdir -p logs data && \
    chown -R nodejs:nodejs logs data

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3002 9091

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "--expose-gc", "--max-old-space-size=400", "clients/bot-dashboard/unified-trading-bot.js"]
