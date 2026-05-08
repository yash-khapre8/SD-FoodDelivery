const pool = require('../config/db');
const redisClient = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const NotificationService = require('../services/notification.service');

// ─── State Machine ────────────────────────────────────────────────────────────
/**
 * Valid status transitions for the order state machine.
 *
 *  placed → confirmed → preparing → picked → delivered
 *  ANY non-delivered state → cancelled
 */
const VALID_TRANSITIONS = {
  placed:    ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['picked',    'cancelled'],
  picked:    ['delivered', 'cancelled'],
  delivered: [],          // terminal state – no further transitions
  cancelled: [],          // terminal state
};

/**
 * Validate whether a status transition is allowed.
 * Throws a descriptive error on invalid transitions.
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 */
const validateTransition = (currentStatus, newStatus) => {
  const allowed = VALID_TRANSITIONS[currentStatus];

  if (!allowed) {
    throw new Error(`Unknown current status: "${currentStatus}"`);
  }

  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition from "${currentStatus}" to "${newStatus}". ` +
      `Allowed next states: [${allowed.join(', ') || 'none'}]`
    );
  }
};

/**
 * Status Event Mapping
 */
const STATUS_TO_EVENT = {
  placed: 'ORDER_PLACED',
  confirmed: 'ORDER_CONFIRMED',
  preparing: 'ORDER_CONFIRMED',
  picked: 'ORDER_PICKED',
  delivered: 'ORDER_DELIVERED',
  cancelled: 'ORDER_CANCELLED',
};

// ─── Redis Cache Helpers ──────────────────────────────────────────────────────
const CACHE_TTL = 60; // seconds

const cacheKey = (orderId) => `order:${orderId}`;

const setOrderCache = async (orderId, data) => {
  try {
    await redisClient.setEx(cacheKey(orderId), CACHE_TTL, JSON.stringify(data));
  } catch (err) {
    console.warn(`⚠️  Redis cache set failed for order ${orderId}:`, err.message);
  }
};

const getOrderCache = async (orderId) => {
  try {
    const cached = await redisClient.get(cacheKey(orderId));
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.warn(`⚠️  Redis cache get failed for order ${orderId}:`, err.message);
    return null;
  }
};

const invalidateOrderCache = async (orderId) => {
  try {
    await redisClient.del(cacheKey(orderId));
    await redisClient.del(`order_status:${orderId}`);
    console.log(`🗑️  Cache invalidated for order:${orderId}`);
  } catch (err) {
    console.warn(`⚠️  Redis cache invalidation failed for order ${orderId}:`, err.message);
  }
};

// ─── Model Functions ──────────────────────────────────────────────────────────

/**
 * createOrder — Inserts a new order + all items in a transaction.
 *
 * @param {string}   user_id
 * @param {string}   restaurant_id
 * @param {Array}    items          - [{ item_name, quantity, price }]
 * @returns {object} Full order object with items array
 */
const createOrder = async (user_id, restaurant_id, items) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Calculate total_amount from items
    const totalAmount = items.reduce(
      (sum, item) => sum + parseFloat(item.price) * parseInt(item.quantity, 10),
      0
    );

    const orderId = uuidv4();

    const orderResult = await client.query(
      `INSERT INTO orders (order_id, user_id, restaurant_id, status, total_amount)
       VALUES ($1, $2, $3, 'placed', $4)
       RETURNING *`,
      [orderId, user_id, restaurant_id, totalAmount.toFixed(2)]
    );

    const order = orderResult.rows[0];

    // Insert all items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (item_id, order_id, item_name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), orderId, item.item_name, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');

    // Attach items to the returned object
    const fullOrder = { ...order, items };
    await setOrderCache(orderId, fullOrder);

    return fullOrder;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * getOrderById — Fetch order + items. Checks Redis cache first.
 *
 * @param {string} order_id
 * @returns {object|null}
 */
const getOrderById = async (order_id) => {
  // 1. Try cache
  const cached = await getOrderCache(order_id);
  if (cached) {
    console.log(`⚡ Cache HIT for order:${order_id}`);
    return cached;
  }

  console.log(`🔍 Cache MISS for order:${order_id} — querying DB`);

  // 2. Query DB
  const orderResult = await pool.query(
    `SELECT o.*,
            u.name AS user_name,
            r.name AS restaurant_name,
            d.name AS driver_name
     FROM orders o
     LEFT JOIN users       u ON o.user_id       = u.user_id
     LEFT JOIN restaurants r ON o.restaurant_id = r.restaurant_id
     LEFT JOIN drivers     d ON o.driver_id     = d.driver_id
     WHERE o.order_id = $1`,
    [order_id]
  );

  if (!orderResult.rows.length) return null;

  const itemsResult = await pool.query(
    `SELECT * FROM order_items WHERE order_id = $1`,
    [order_id]
  );

  const fullOrder = { ...orderResult.rows[0], items: itemsResult.rows };

  // 3. Populate cache
  await setOrderCache(order_id, fullOrder);

  return fullOrder;
};

/**
 * updateOrderStatus — Validates state machine transition, then updates DB.
 * Invalidates the Redis cache for this order after a successful update.
 *
 * @param {string} order_id
 * @param {string} new_status
 * @returns {object} Updated order row
 * @throws  {Error}  On invalid transition or order not found
 */
const updateOrderStatus = async (order_id, new_status) => {
  // Fetch current status
  const current = await pool.query(
    `SELECT status FROM orders WHERE order_id = $1`,
    [order_id]
  );

  if (!current.rows.length) {
    throw new Error(`Order "${order_id}" not found`);
  }

  const currentStatus = current.rows[0].status;

  // Validate transition via state machine
  validateTransition(currentStatus, new_status);

  // Persist update
  const result = await pool.query(
    `UPDATE orders
     SET status = $1, updated_at = NOW()
     WHERE order_id = $2
     RETURNING *`,
    [new_status, order_id]
  );

  // Invalidate stale cache
  await invalidateOrderCache(order_id);

  // ── 3. Notification ──────────────────────────────────────────────────
  const updatedOrder = result.rows[0];
  const event = STATUS_TO_EVENT[new_status];
  if (event) {
    // Fire-and-forget notification
    NotificationService.notifyUser(updatedOrder.user_id, event, order_id).catch(console.error);
  }

  // ── 4. Status Cache (30s TTL) ──────────────────────────────────────────
  await redisClient.setEx(`order_status:${order_id}`, 30, new_status).catch(console.error);

  return updatedOrder;
};

/**
 * getActiveOrdersByUser — Returns all non-delivered, non-cancelled orders.
 *
 * @param {string} user_id
 * @returns {Array}
 */
const getActiveOrdersByUser = async (user_id) => {
  const result = await pool.query(
    `SELECT o.*,
            r.name AS restaurant_name,
            d.name AS driver_name
     FROM orders o
     LEFT JOIN restaurants r ON o.restaurant_id = r.restaurant_id
     LEFT JOIN drivers     d ON o.driver_id     = d.driver_id
     WHERE o.user_id = $1
       AND o.status NOT IN ('delivered', 'cancelled')
     ORDER BY o.created_at DESC`,
    [user_id]
  );
  return result.rows;
};

/**
 * assignDriver — Assign a driver to an order (used by dispatch service).
 */
const assignDriver = async (order_id, driver_id) => {
  const result = await pool.query(
    `UPDATE orders
     SET driver_id = $1, updated_at = NOW()
     WHERE order_id = $2
     RETURNING *`,
    [driver_id, order_id]
  );
  await invalidateOrderCache(order_id);

  const updatedOrder = result.rows[0];

  // Notify User about Driver Assignment
  NotificationService.notifyUser(updatedOrder.user_id, 'DRIVER_ASSIGNED', order_id).catch(console.error);

  // Status Cache Update
  await redisClient.setEx(`order_status:${order_id}`, 30, updatedOrder.status).catch(console.error);

  return updatedOrder;
};

module.exports = {
  createOrder,
  getOrderById,
  updateOrderStatus,
  getActiveOrdersByUser,
  assignDriver,
  validateTransition,   // exported so tests / other services can use it
  invalidateOrderCache, // exported for dispatch service
};
