const pool = require('../config/db');

/**
 * Get all restaurants.
 */
const getAllRestaurants = async () => {
  const result = await pool.query(
    `SELECT * FROM restaurants ORDER BY created_at DESC`
  );
  return result.rows;
};

/**
 * Get a single restaurant by ID.
 */
const getRestaurantById = async (restaurantId) => {
  const result = await pool.query(
    `SELECT * FROM restaurants WHERE restaurant_id = $1`,
    [restaurantId]
  );
  return result.rows[0] || null;
};

/**
 * Get only available (open) restaurants.
 */
const getAvailableRestaurants = async () => {
  const result = await pool.query(
    `SELECT * FROM restaurants WHERE availability_status = true ORDER BY name ASC`
  );
  return result.rows;
};

/**
 * Toggle restaurant availability.
 */
const updateAvailability = async (restaurantId, status) => {
  const result = await pool.query(
    `UPDATE restaurants
     SET availability_status = $1
     WHERE restaurant_id = $2
     RETURNING *`,
    [status, restaurantId]
  );
  return result.rows[0];
};

module.exports = {
  getAllRestaurants,
  getRestaurantById,
  getAvailableRestaurants,
  updateAvailability,
};
