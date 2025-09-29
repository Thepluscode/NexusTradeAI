# Use Node.js LTS
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose the app port
EXPOSE 3001

# Start the application
CMD [ "node", "src/index.js" ]
