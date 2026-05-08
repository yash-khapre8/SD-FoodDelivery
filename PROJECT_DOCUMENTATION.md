# Project Documentation: Food Delivery Dispatch & Coordination System

**Date:** May 8, 2026  
**Subject:** System Design 
 

---

## 1. Executive Summary
The **Food Delivery Dispatch System** is a high-performance backend solution designed to handle real-time order processing, driver coordination, and customer notifications. Built with a modern tech stack (Node.js, PostgreSQL, Redis, and Socket.IO), the system ensures high availability, data integrity through a strict state machine, and optimized performance via multi-layered caching.

## 2. System Architecture
The application follows a modular architecture to ensure scalability and ease of maintenance:

*   **RESTful API Layer**: Handles client requests for order placement, status checks, and management.
*   **Real-time Layer (Socket.IO)**: Provides bi-directional communication between the server, users, restaurants, and drivers.
*   **State Machine Logic**: Centralized in the `Order` model to enforce valid business transitions.
*   **Dispatch Service**: A specialized module that orchestrates geographical proximity searches and atomic driver assignments.
*   **Persistence Layer**: 
    *   **PostgreSQL**: For relational, ACiD-compliant data storage.
    *   **Redis**: For high-speed caching and event-driven pub/sub messaging.

## 3. Database Design
The system uses a highly normalized relational schema:

*   **Users**: Customer profiles and identity.
*   **Restaurants**: Locations (lat/lng) and availability status.
*   **Drivers**: Real-time location tracking and availability status (`available`, `busy`).
*   **Orders**: The central entity linking users, restaurants, and drivers.
*   **Order_Items**: Detailed breakdown of food items per order.
*   **Notifications**: Persistent history of all alerts sent to users.

## 4. Key Technical Implementations

### 4.1 Proximity-Based Dispatch (Haversine Formula)
To achieve efficient delivery, the system calculates the distance between the restaurant and all available drivers using the Haversine formula directly in raw SQL. This offloads the heavy mathematical computation to the database, ensuring sub-millisecond response times for finding the nearest driver.

### 4.2 Atomic Driver Assignment
To prevent **race conditions** (where two orders are assigned to the same driver simultaneously), the system utilizes PostgreSQL **Row-Level Locking** (`SELECT FOR UPDATE`). This ensures that the driver's status is checked and updated atomically within a single transaction.

### 4.3 Order State Machine
The system enforces a strict workflow to prevent data corruption:
`Placed` → `Confirmed` → `Preparing` → `Picked` → `Delivered`
*   Any non-terminal state can transition to `Cancelled`.
*   Invalid transitions (e.g., `Delivered` → `Preparing`) are blocked at the model level and return a `400 Bad Request` error.

### 4.4 Multi-Layered Caching
*   **Status Cache**: High-frequency order status checks are served from Redis with a 30-second TTL to reduce DB load.
*   **Entity Cache**: Full order objects are cached for 60 seconds to optimize "Track Order" views.
*   **Fallback Logic**: The system is designed with "Degraded Mode" support; if Redis is offline, the system automatically routes all traffic to the primary DB.

## 5. API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/orders` | Places a new order and triggers async dispatch. |
| `GET` | `/api/orders/:id/status` | Cached status check for real-time tracking. |
| `POST` | `/api/restaurants/.../accept` | Restaurant accepts order and locks in the nearest driver. |
| `POST` | `/api/drivers/:id/location` | Updates driver GPS and broadcasts to map. |
| `GET` | `/api/notifications/:user_id` | Retrieves last 20 persistent notifications. |

## 6. Real-time Event System
Communication is segregated into rooms for privacy and performance:
*   `user:<id>`: Personal notifications and status updates.
*   `order:<id>`: Shared room for the customer and assigned driver for live tracking.
*   `restaurant:<id>`: Incoming order alerts for the kitchen staff.

## 7. Conclusion
The system successfully meets all requirements of a modern food delivery platform. By combining spatial SQL queries, atomic transactions, and a robust real-time notification engine, it provides a stable and scalable foundation for a production-grade dispatch service.

---
**End of Document**
