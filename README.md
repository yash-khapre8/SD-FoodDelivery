# 🌯 Food Delivery System Design (Zomato/Swiggy)

A high-performance, real-time backend for a food delivery platform built with **Node.js, Express, PostgreSQL, Redis, and Socket.IO**. This project implements a complete order lifecycle from placement to automated dispatch and delivery.

## 🚀 Key Features

- **Strict State Machine**: Ensures data integrity with a locked workflow (`Placed` → `Confirmed` → `Preparing` → `Picked` → `Delivered`).
- **Haversine Dispatch Engine**: Automatically locates the nearest available driver using raw SQL spatial math.
- **Race Condition Protection**: Uses PostgreSQL `SELECT FOR UPDATE` transactions to prevent double-assignment of drivers.
- **Real-time Synchronization**: Socket.IO rooms for role-based events (`user`, `restaurant`, `driver`) and order-specific tracking (`order:<id>`).
- **High-Frequency Caching**: Multi-layered Redis strategy (30s TTL for status checks, 60s for full objects).
- **Notification System**: Persistent DB history + real-time Socket emissions + simulated Push Notification logging.
- **Redis Resilience**: Intelligent fallback logic that keeps the server 100% operational even if Redis is offline.

---

## 🛠️ Technical Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: PostgreSQL (Relational persistence)
- **Caching**: Redis (Performance and Pub/Sub)
- **Real-time**: Socket.IO (WebSockets)
- **Security**: JWT Authentication & Input Validation Middleware
- **Logging**: Structured JSON Logging (Production-grade)

---

## 🏗️ Project Structure

```text
├── src
│   ├── config         # DB and Redis connections
│   ├── middleware     # Auth, Validation, Global Error Handling
│   ├── models         # DB Schemas and Core Logic (State Machine)
│   ├── routes         # API Endpoint definitions
│   ├── services       # Dispatch Engine & Notification Logic
│   └── utils          # Structured Logging helper
├── test               # E2E Lifecycle Simulation scripts
├── server.js          # Entry point & Socket.IO initialization
└── README.md          # Project Documentation
```

---

## 🚨 Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Create a `.env` file:
```env
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/food_delivery
REDIS_URL=redis://localhost:6379
```

### 3. Database Initialization
```bash
# Run migrations (create tables/enums) and seed sample data
npm run db:setup
```

### 4. Run the Server
```bash
npm run dev
```

---

## 🚦 End-to-End Simulation
Test the full lifecycle (Order → Accept → Dispatch → Deliver):
```bash
node test/lifecycle.test.js
```

---

## 📍 API Documentation

### 📦 Orders
- `POST /api/orders`: Place order (Validates items, calculates total).
- `GET /api/orders/:id/status`: **Fast Status Check** (Redis cached).
- `POST /api/orders/:id/status`: Update status (Enforces state machine).
- `POST /api/orders/:id/cancel`: Cancel order & release assigned driver.

### 🍽️ Restaurants
- `GET /api/restaurants`: List currently available restaurants.
- `GET /api/restaurants/:id/orders`: Active "Kitchen Dashboard" for restaurants.
- `POST /api/restaurants/:id/orders/:order_id/accept`: Accept order & trigger **Dispatch Engine**.
- `POST /api/restaurants/:id/orders/:order_id/ready`: Mark food ready for pickup.

### 🚴 Drivers
- `GET /api/drivers/available`: Get real-time list of nearby drivers (Cached).
- `POST /api/drivers/:id/location`: Update GPS coordinates (Broadcasts to map).

---

## 🔄 Lifecycle State Machine
```text
  [ placed ] ──────────┐
      │                │
      ▼                │
  [ confirmed ] ───────┤
      │                │
      ▼                │
  [ preparing ] ───────┼───▶ [ cancelled ]
      │                │
      ▼                │
  [ picked ] ──────────┘
      │
      ▼
  [ delivered ] (Terminal - Driver Released)
```

---

## 📊 Logging & Monitoring
The system uses structured JSON logs for easy parsing by monitoring tools:
```json
{
  "level": "INFO",
  "timestamp": "2026-05-08T13:27:06Z",
  "event": "DRIVER_ASSIGNED",
  "data": { "order_id": "...", "driver_id": "..." }
}
```
# SD-FoodDelivery
