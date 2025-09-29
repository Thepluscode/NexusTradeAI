# NexusTradeAI Node.js Base Image
# Optimized for high-performance trading applications

FROM node:18-alpine AS base

# Set metadata
LABEL maintainer="NexusTradeAI DevOps <devops@nexustrade.ai>"
LABEL description="High-performance Node.js base image for NexusTradeAI services"
LABEL version="1.0.0"

# Install system dependencies for trading applications
RUN apk add --no-cache \
    # Build tools
    build-base \
    python3 \
    make \
    g++ \
    # Security and monitoring
    curl \
    wget \
    ca-certificates \
    # Performance monitoring
    htop \
    # Network tools
    netcat-openbsd \
    # Time synchronization (critical for trading)
    chrony \
    # Memory profiling
    valgrind \
    # Process management
    tini \
    # SSL/TLS
    openssl \
    # Compression
    gzip \
    brotli

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Configure npm for performance
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set cache /tmp/.npm && \
    npm config set prefer-offline true && \
    npm config set progress false && \
    npm config set audit false && \
    npm config set fund false

# Install global dependencies for trading applications
RUN npm install -g \
    pm2@latest \
    node-gyp@latest \
    npm@latest

# Configure PM2 for production
RUN pm2 install pm2-logrotate && \
    pm2 set pm2-logrotate:max_size 100M && \
    pm2 set pm2-logrotate:retain 7 && \
    pm2 set pm2-logrotate:compress true

# Set environment variables for performance
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"
ENV UV_THREADPOOL_SIZE=128
ENV MALLOC_ARENA_MAX=2