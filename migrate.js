/**
 * migrate.js — Create all tables and ENUM types in the food_delivery database.
 *
 * Run with:  node migrate.js
 *
 * Reads DATABASE_URL from .env. Make sure PostgreSQL is running first.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const run = async () => {
  const client = await pool.connect();
  console.log('🔗 Connected to PostgreSQL');

  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // ── ENUMS ──────────────────────────────────────────────────────────────
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE driver_status AS ENUM ('available', 'busy');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE order_status AS ENUM (
          'placed', 'confirmed', 'preparing', 'picked', 'delivered', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ── USERS ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       VARCHAR(100)        NOT NULL,
        email      VARCHAR(150) UNIQUE NOT NULL,
        phone      VARCHAR(15)         NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // ── RESTAURANTS ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS restaurants (
        restaurant_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(150)   NOT NULL,
        location_lat        DECIMAL(10, 7) NOT NULL,
        location_lng        DECIMAL(10, 7) NOT NULL,
        availability_status BOOLEAN DEFAULT TRUE,
        created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // ── DRIVERS ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        driver_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name         VARCHAR(100)   NOT NULL,
        phone        VARCHAR(15)    NOT NULL,
        location_lat DECIMAL(10, 7) NOT NULL,
        location_lng DECIMAL(10, 7) NOT NULL,
        status       driver_status  DEFAULT 'available',
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // ── ORDERS ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
        driver_id     UUID REFERENCES drivers(driver_id) ON DELETE SET NULL,
        status        order_status DEFAULT 'placed',
        total_amount  DECIMAL(10, 2) NOT NULL,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // ── ORDER_ITEMS ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        item_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id  UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
        item_name VARCHAR(150)   NOT NULL,
        quantity  INTEGER        NOT NULL CHECK (quantity > 0),
        price     DECIMAL(10, 2) NOT NULL CHECK (price >= 0)
      );
    `);

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        order_id        UUID REFERENCES orders(order_id) ON DELETE SET NULL,
        message         TEXT NOT NULL,
        event_type      VARCHAR(50) NOT NULL,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        is_read         BOOLEAN DEFAULT FALSE
      );
    `);

    // ── INDEXES ───────────────────────────────────────────────────────────
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON orders(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id)`,
      `CREATE INDEX IF NOT EXISTS idx_orders_driver_id     ON orders(driver_id)`,
      `CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status)`,
      `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
      `CREATE INDEX IF NOT EXISTS idx_drivers_status       ON drivers(status)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
    ];

    for (const idx of indexes) await client.query(idx);

    console.log('\n✅ Migration completed successfully!\n');
    console.log('Tables created: users, restaurants, drivers, orders, order_items, notifications');
    console.log('ENUMs created: driver_status, order_status\n');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

run();
