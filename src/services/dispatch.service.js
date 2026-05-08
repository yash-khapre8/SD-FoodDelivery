const pool = require('../config/db');
const NotificationService = require('./notification.service');
const logger = require('../utils/logger');

const findNearestDriver = async (restaurant_lat, restaurant_lng) => {
  const result = await pool.query(
    `SELECT *,
       (6371 * acos(
         cos(radians($1)) * cos(radians(location_lat)) *
         cos(radians(location_lng) - radians($2)) +
         sin(radians($1)) * sin(radians(location_lat))
       )) AS distance
     FROM drivers
     WHERE status = 'available'
     ORDER BY distance ASC
     LIMIT 1`,
    [restaurant_lat, restaurant_lng]
  );

  if (!result.rows.length) {
    throw new Error('No drivers available');
  }

  return result.rows[0];
};

const assignDriver = async (order_id, driver_id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT status FROM drivers WHERE driver_id = $1 FOR UPDATE`,
      [driver_id]
    );

    if (!lockResult.rows.length) throw new Error('Driver not found');
    if (lockResult.rows[0].status !== 'available') {
      throw new Error(`Driver is no longer available`);
    }

    await client.query(`UPDATE drivers SET status = 'busy' WHERE driver_id = $1`, [driver_id]);
    await client.query(
      `UPDATE orders SET driver_id = $1, status = 'confirmed', updated_at = NOW() WHERE order_id = $2`,
      [driver_id, order_id]
    );

    await client.query('COMMIT');
    logger.info('DRIVER_ASSIGNED', { order_id, driver_id });
    return { order_id, driver_id, status: 'confirmed' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const releaseDriver = async (driver_id) => {
  if (!driver_id) return null;
  const result = await pool.query(
    `UPDATE drivers SET status = 'available' WHERE driver_id = $1 RETURNING *`,
    [driver_id]
  );
  if (result.rows.length) {
    logger.info('DRIVER_RELEASED', { driver_id });
  }
  return result.rows[0] || null;
};

const dispatchOrder = async (order_id, restaurant_id, user_id) => {
  try {
    const restResult = await pool.query(
      `SELECT location_lat, location_lng FROM restaurants WHERE restaurant_id = $1`,
      [restaurant_id]
    );

    if (!restResult.rows.length) throw new Error('Restaurant not found');
    const { location_lat, location_lng } = restResult.rows[0];

    // Find & Assign
    const nearestDriver = await findNearestDriver(location_lat, location_lng);
    await assignDriver(order_id, nearestDriver.driver_id);

    // Notify
    NotificationService.notifyUser(user_id, 'DRIVER_ASSIGNED', order_id).catch(() => {});
    NotificationService.emitToOrderRoom(order_id, 'driver_assigned', {
      order_id,
      driver_id: nearestDriver.driver_id,
      driver_name: nearestDriver.name,
    });
  } catch (err) {
    logger.warn('DISPATCH_DEFERRED', { order_id, error: err.message });
    NotificationService.notifyUser(user_id, 'NO_DRIVER_AVAILABLE', order_id).catch(() => {});
  }
};

module.exports = { findNearestDriver, assignDriver, releaseDriver, dispatchOrder };
