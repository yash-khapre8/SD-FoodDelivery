const redis = require('redis');
require('dotenv').config();
const logger = require('../utils/logger');

// Track if we have already logged a connection failure to avoid log spam
let hasLoggedFailure = false;

const client = redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      // Exponentially increase backoff, max 30 seconds
      const delay = Math.min(retries * 1000, 30000);
      return delay;
    },
    connectTimeout: 5000,
  }
});

client.on('connect', () => {
  logger.info('REDIS_CONNECTED');
  hasLoggedFailure = false; // Reset on success
});

client.on('error', (err) => {
  if (!hasLoggedFailure) {
    logger.warn('REDIS_CONNECTION_OFFLINE', { 
      message: 'Redis server is not reachable. System will operate in fallback (DB-only) mode.',
      error: err.message 
    });
    hasLoggedFailure = true;
  }
  // We don't log every retry to keep the console clean
});

// Connect immediately
client.connect().catch((err) => {
  if (!hasLoggedFailure) {
    logger.error('REDIS_STARTUP_STATUS', { 
      status: 'OFFLINE', 
      detail: 'Application started without Redis. This is expected if you haven\'t installed Redis locally.' 
    });
    hasLoggedFailure = true;
  }
});

module.exports = client;
