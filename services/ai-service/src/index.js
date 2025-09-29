require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;

// Create logger
const logger = createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    printf(({ level, message, timestamp, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
      }`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/ai-service-error.log', level: 'error' }),
    new transports.File({ filename: 'logs/ai-service-combined.log' })
  ]
});

// Initialize express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API Routes
const aiRoutes = require('./routes/ai.routes');
app.use('/api/ai', aiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { error: err });
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`AI Service running on port ${PORT}`);
  console.log(`AI Service running on port ${PORT}`);
});

module.exports = app;
