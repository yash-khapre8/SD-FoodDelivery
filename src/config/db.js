const { Pool } = require('pg');
require('dotenv').config();
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  logger.info('POSTGRES_CONNECTED');
});

pool.on('error', (err) => {
  logger.error('POSTGRES_UNEXPECTED_ERROR', { error: err.message });
  // Do not exit process, let the app try to recover or handle via error middleware
});

module.exports = pool;
