FROM node:20-alpine
WORKDIR /app

COPY clients/bot-dashboard/package.json ./
RUN npm install express cors axios dotenv prom-client

COPY infrastructure/ ./infrastructure/
COPY clients/bot-dashboard/unified-forex-bot.js ./

EXPOSE 3005
CMD ["node", "unified-forex-bot.js"]
