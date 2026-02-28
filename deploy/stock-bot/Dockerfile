FROM node:20-alpine
WORKDIR /app

# Copy only what the stock bot needs
COPY clients/bot-dashboard/package.json ./
RUN npm install --production --ignore-scripts 2>/dev/null; npm install express cors axios dotenv prom-client

COPY infrastructure/ ./infrastructure/
COPY clients/bot-dashboard/unified-trading-bot.js ./

EXPOSE 3002
CMD ["node", "unified-trading-bot.js"]
