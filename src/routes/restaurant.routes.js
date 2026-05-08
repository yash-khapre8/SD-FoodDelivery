const express = require('express');
const router = express.Router();
const RestaurantModel = require('../models/restaurant');
const OrderModel = require('../models/order');
const DispatchService = require('../services/dispatch.service');
const NotificationService = require('../services/notification.service');
const pool = require('../config/db');
const logger = require('../utils/logger');

router.get('/', async (req, res, next) => {
  try {
    const restaurants = await RestaurantModel.getAvailableRestaurants();
    res.json(restaurants);
  } catch (err) {
    next(err);
  }
});

router.get('/:restaurant_id/orders', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM orders 
       WHERE restaurant_id = $1 
         AND status IN ('placed', 'confirmed', 'preparing')
       ORDER BY created_at ASC`,
      [req.params.restaurant_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/:restaurant_id/orders/:order_id/accept', async (req, res, next) => {
  try {
    const { order_id, restaurant_id } = req.params;

    const updated = await OrderModel.updateOrderStatus(order_id, 'confirmed');
    
    // Dispatch Engine
    DispatchService.dispatchOrder(order_id, restaurant_id, updated.user_id);

    NotificationService.emitToOrderRoom(order_id, 'order_confirmed', { order_id });

    logger.info('RESTAURANT_ACCEPTED_ORDER', { order_id, restaurant_id });
    res.json({ message: 'Order accepted', order: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/:restaurant_id/orders/:order_id/ready', async (req, res, next) => {
  try {
    const { order_id } = req.params;

    const current = await pool.query('SELECT status FROM orders WHERE order_id = $1', [order_id]);
    if (!current.rows.length) throw new Error('Order not found');
    
    const nextStatus = current.rows[0].status === 'preparing' ? 'picked' : 'preparing';
    const updated = await OrderModel.updateOrderStatus(order_id, nextStatus);

    NotificationService.emitToOrderRoom(order_id, 'order_ready_for_pickup', { order_id, status: updated.status });

    logger.info('RESTAURANT_ORDER_READY', { order_id, status: nextStatus });
    res.json({ message: `Order status moved to ${nextStatus}`, order: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
