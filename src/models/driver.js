const pool = require('../config/db');

/**
 * Get all available drivers.
 */
const getAvailableDrivers = async () => {
  const result = await pool.query(
    `SELECT * FROM drivers WHERE status = 'available' ORDER BY created_at ASC`
  );
  return result.rows;
};

/**
 * Get a single driver by ID.
 */
const getDriverById = async (driverId) => {
  const result = await pool.query(
    `SELECT * FROM drivers WHERE driver_id = $1`,
    [driverId]
  );
  return result.rows[0] || null;
};

/**
 * Update the real-time location of a driver.
 */
const updateDriverLocation = async (driverId, lat, lng) => {
  const result = await pool.query(
    `UPDATE drivers
     SET location_lat = $1, location_lng = $2
     WHERE driver_id = $3
     RETURNING *`,
    [lat, lng, driverId]
  );
  return result.rows[0];
};

/**
 * Update driver status ('available' | 'busy').
 */
const updateDriverStatus = async (driverId, status) => {
  const result = await pool.query(
    `UPDATE drivers
     SET status = $1
     WHERE driver_id = $2
     RETURNING *`,
    [status, driverId]
  );
  return result.rows[0];
};

/**
 * Get all drivers (admin view).
 */
const getAllDrivers = async () => {
  const result = await pool.query(`SELECT * FROM drivers ORDER BY created_at DESC`);
  return result.rows;
};

module.exports = {
  getAvailableDrivers,
  getDriverById,
  updateDriverLocation,
  updateDriverStatus,
  getAllDrivers,
};
