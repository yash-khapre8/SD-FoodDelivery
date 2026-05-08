/**
 * Logger Utility
 * Provides structured JSON logging across the application.
 */

const log = (level, event, data = {}) => {
  console.log(
    JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      event,
      data,
    })
  );
};

module.exports = {
  info: (event, data) => log('INFO', event, data),
  warn: (event, data) => log('WARN', event, data),
  error: (event, data) => log('ERROR', event, data),
};
