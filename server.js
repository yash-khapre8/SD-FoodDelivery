require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const logger = require('./src/utils/logger');

const NotificationService = require('./src/services/notification.service');

// ─── Route Imports ───────────────────────────────────────────────────────────
const orderRoutes = require('./src/routes/order.routes');
const driverRoutes = require('./src/routes/driver.routes');
const restaurantRoutes = require('./src/routes/restaurant.routes');
const notificationRoutes = require('./src/routes/notification.routes');

// ─── App & HTTP Server ────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Socket.IO Setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true
  },
});

NotificationService.init(io);

// ─── Socket.IO Event Handling ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info('SOCKET_CONNECTED', { socket_id: socket.id });

  socket.on('join_room', ({ role, id }) => {
    const room = `${role}:${id}`;
    socket.join(room);
    logger.info('SOCKET_JOIN_ROOM', { socket_id: socket.id, room });
    socket.emit('room_joined', { room });
  });

  socket.on('join_order', (order_id) => {
    if (!order_id || typeof order_id !== 'string') {
      return socket.emit('error', { message: 'join_order requires a valid order_id' });
    }
    const room = `order:${order_id}`;
    socket.join(room);
    logger.info('SOCKET_JOIN_ORDER', { socket_id: socket.id, room });
    socket.emit('order_room_joined', { order_id, room });
  });

  socket.on('disconnect', () => {
    logger.info('SOCKET_DISCONNECTED', { socket_id: socket.id });
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── API Routes ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/orders', orderRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/notifications', notificationRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  const message = err.message || 'Internal Server Error';
  let statusCode = 500;

  if (message.includes('Invalid status transition')) statusCode = 400;
  else if (message.includes('No drivers available')) statusCode = 503;
  else if (message.includes('not found')) statusCode = 404;
  else if (err.code === '23505' || err.code === '23503') statusCode = 409; // Postgres uniqueness/FK violation

  logger.error('API_ERROR', { 
    message, 
    code: err.code, 
    path: req.path, 
    method: req.method 
  });

  res.status(statusCode).json({
    error: message,
    code: statusCode
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info('SERVER_STARTED', { 
    port: PORT, 
    env: process.env.NODE_ENV || 'development' 
  });
});

module.exports = { app, io };
