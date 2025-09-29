FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY src/ ./src/

# Create logs directory
RUN mkdir -p logs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S trading-engine -u 1001 -G nodejs

# Change ownership of application files
RUN chown -R trading-engine:nodejs /app

# Switch to non-root user
USER trading-engine

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e " \
        const http = require('http'); \
        const options = { \
            hostname: 'localhost', \
            port: 3003, \
            path: '/health', \
            timeout: 5000 \
        }; \
        const req = http.request(options, (res) => { \
            process.exit(res.statusCode === 200 ? 0 : 1); \
        }); \
        req.on('error', () => process.exit(1)); \
        req.on('timeout', () => { req.destroy(); process.exit(1); }); \
        req.end();" \
    || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3003

# Start the application
CMD ["npm", "start"]