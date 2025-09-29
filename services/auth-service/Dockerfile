FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create uploads directory
RUN mkdir -p uploads/avatars uploads/kyc

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S auth-service -u 1001

# Change ownership of uploads directory
RUN chown -R auth-service:nodejs uploads/

# Switch to non-root user
USER auth-service

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:3001/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Start the application
CMD ["npm", "start"]