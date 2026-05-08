const pool = require('../config/db');
const logger = require('../utils/logger');

let io = null;

const init = (socketIoInstance) => {
  io = socketIoInstance;
  logger.info('NOTIFICATION_SERVICE_INIT');
};

const NOTIFICATION_MESSAGES = {
  ORDER_PLACED: (id) => `Your order ${id} has been placed successfully!`,
  ORDER_CONFIRMED: (id) => `Restaurant confirmed your order ${id}. Preparing soon!`,
  DRIVER_ASSIGNED: (id) => `Driver is on the way to pick up your order ${id}!`,
  ORDER_PICKED: (id) => `Your order ${id} has been picked up. On the way!`,
  ORDER_DELIVERED: (id) => `Order ${id} delivered! Enjoy your meal.`,
  ORDER_CANCELLED: (id) => `Order ${id} has been cancelled. Refund in 5-7 days.`,
  NO_DRIVER_AVAILABLE: (id) => `We are searching for a driver for order ${id}.`,
};

const notifyUser = async (userId, event, orderId) => {
  if (!io) return;

  const messageGenerator = NOTIFICATION_MESSAGES[event];
  const message = messageGenerator ? messageGenerator(orderId) : `Update on order ${orderId}`;

  try {
    await pool.query(
      `INSERT INTO notifications (user_id, order_id, message, event_type)
       VALUES ($1, $2, $3, $4)`,
      [userId, orderId, message, event]
    );
  } catch (err) {
    logger.error('NOTIFICATION_PERSIST_FAILED', { error: err.message, userId });
  }

  logger.info('PUSH_NOTIFICATION', { userId, message });

  io.to(`user:${userId}`).emit('notification', {
    event,
    orderId,
    message,
    timestamp: new Date().toISOString(),
  });
};

const notifyDriver = (driverId, payload) => {
  if (!io) return;
  io.to(`driver:${driverId}`).emit('notification', payload);
  logger.info('DRIVER_NOTIFIED', { driverId, event: payload.event });
};

const notifyRestaurant = (restaurantId, payload) => {
  if (!io) return;
  io.to(`restaurant:${restaurantId}`).emit('notification', payload);
  logger.info('RESTAURANT_NOTIFIED', { restaurantId, event: payload.event });
};

const broadcastDriverLocation = (driverId, location) => {
  if (!io) return;
  io.emit('driver_location_update', { driverId, location });
};

const emitToOrderRoom = (orderId, eventName, payload) => {
  if (!io) return;
  io.to(`order:${orderId}`).emit(eventName, payload);
  logger.info('ORDER_ROOM_EMIT', { orderId, eventName });
};

module.exports = {
  init,
  notifyUser,
  notifyDriver,
  notifyRestaurant,
  broadcastDriverLocation,
  emitToOrderRoom,
};
