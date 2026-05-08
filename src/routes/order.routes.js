const express = require('express');
const router = express.Router();
const OrderModel = require('../models/order');
const DispatchService = require('../services/dispatch.service');
const NotificationService = require('../services/notification.service');
const { validateOrderPlacement, validateOrderStatusUpdate } = require('../middleware/validation.middleware');
const redisClient = require('../config/redis');
const pool = require('../config/db');
const logger = require('../utils/logger');

const ORDER_CHANNEL = 'orders:events';

const publishEvent = async (eventName, payload) => {
  try {
    // Redis Fallback: publish only if client is open/connected
    if (redisClient.isOpen) {
      await redisClient.publish(ORDER_CHANNEL, JSON.stringify({ event: eventName, ...payload }));
      logger.info('REDIS_PUBLISH', { event: eventName });
    }
  } catch (err) {
    logger.warn('REDIS_PUBLISH_FAILED', { error: err.message });
  }
};

/**
 * POST /api/orders
 * Placement
 */
router.post('/', validateOrderPlacement, async (req, res, next) => {
  try {
    const { user_id, restaurant_id, items } = req.body;

    const order = await OrderModel.createOrder(user_id, restaurant_id, items);

    await publishEvent('ORDER_PLACED', {
      order_id: order.order_id,
      user_id: order.user_id,
      restaurant_id: order.restaurant_id,
    });

    NotificationService.notifyRestaurant(order.restaurant_id, {
      event: 'NEW_ORDER',
      order_id: order.order_id,
    });

    // Async Dispatch
    DispatchService.dispatchOrder(order.order_id, order.restaurant_id, order.user_id);

    res.status(201).json({
      order_id: order.order_id,
      status: order.status,
      total_amount: order.total_amount,
      created_at: order.created_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/user/:user_id
 */
router.get('/user/:user_id', async (req, res, next) => {
  try {
    const orders = await OrderModel.getActiveOrdersByUser(req.params.user_id);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:order_id
 */
router.get('/:order_id', async (req, res, next) => {
  try {
    const order = await OrderModel.getOrderById(req.params.order_id);
    if (!order) throw new Error('Order not found');
    res.json(order);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:order_id/status
 * Redis fallback logic included
 */
router.get('/:order_id/status', async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const cacheKey = `order_status:${order_id}`;

    if (redisClient.isOpen) {
      const cachedStatus = await redisClient.get(cacheKey);
      if (cachedStatus) {
        logger.info('STATUS_CACHE_HIT', { order_id });
        return res.json({ order_id, status: cachedStatus, source: 'cache' });
      }
    }

    const result = await pool.query('SELECT status FROM orders WHERE order_id = $1', [order_id]);
    if (!result.rows.length) throw new Error('Order not found');

    const { status } = result.rows[0];

    if (redisClient.isOpen) {
      await redisClient.setEx(cacheKey, 30, status).catch(() => {});
    }

    res.json({ order_id, status, source: 'db' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/:order_id/status
 */
router.post('/:order_id/status', validateOrderStatusUpdate, async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const { new_status } = req.body;

    const updated = await OrderModel.updateOrderStatus(order_id, new_status);

    const socketPayload = {
      order_id: updated.order_id,
      status: updated.status,
      updated_at: updated.updated_at,
    };

    NotificationService.emitToOrderRoom(order_id, 'order_status_update', socketPayload);
    
    await publishEvent('ORDER_STATUS_CHANGED', {
      order_id: updated.order_id,
      new_status: updated.status,
    });

    if (updated.status === 'delivered' && updated.driver_id) {
      await DispatchService.releaseDriver(updated.driver_id);
    }

    res.json({ message: 'Order status updated', order: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/:order_id/cancel
 */
router.post('/:order_id/cancel', async (req, res, next) => {
  try {
    const { order_id } = req.params;

    const current = await pool.query(
      `SELECT status, driver_id, user_id FROM orders WHERE order_id = $1`,
      [order_id]
    );

    if (!current.rows.length) throw new Error('Order not found');
    const { status, driver_id, user_id } = current.rows[0];

    if (status === 'delivered') throw new Error('Cannot cancel an order that has already been delivered');
    if (status === 'cancelled') throw new Error('Order is already cancelled');

    const updated = await pool.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE order_id = $1 RETURNING *`,
      [order_id]
    );

    await OrderModel.invalidateOrderCache(order_id);
    if (driver_id) await DispatchService.releaseDriver(driver_id);

    const cancelPayload = { order_id, status: 'cancelled' };
    NotificationService.emitToOrderRoom(order_id, 'order_cancelled', cancelPayload);
    await publishEvent('ORDER_CANCELLED', cancelPayload);

    res.json({ message: 'Order cancelled successfully', order: updated.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
