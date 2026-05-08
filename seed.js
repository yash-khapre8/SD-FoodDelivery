/**
 * seed.js — Populate the food_delivery database with sample data.
 *
 * Run with:  node seed.js
 *
 * Seeds:
 *   - 3 restaurants in Pune
 *   - 5 drivers (all available) with Pune-area coordinates
 *   - 2 users with realistic Indian names
 */

require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const restaurants = [
  {
    id: uuidv4(),
    name: 'Spice Garden – Authentic Maharashtrian Thali',
    lat: 18.5204,
    lng: 73.8567,
    available: true,
  },
  {
    id: uuidv4(),
    name: 'Biryani House – Hyderabadi Dum Biryani',
    lat: 18.5314,
    lng: 73.8446,
    available: true,
  },
  {
    id: uuidv4(),
    name: 'The Chai Stop – South Indian & Beverages',
    lat: 18.5088,
    lng: 73.8714,
    available: false, // Closed for the seed
  },
];

const drivers = [
  {
    id: uuidv4(),
    name: 'Ravi Shankar',
    phone: '+919876543210',
    lat: 18.5208,
    lng: 73.8572,
  },
  {
    id: uuidv4(),
    name: 'Amol Patil',
    phone: '+919823456781',
    lat: 18.5316,
    lng: 73.8450,
  },
  {
    id: uuidv4(),
    name: 'Suresh Yadav',
    phone: '+919765432198',
    lat: 18.5090,
    lng: 73.8720,
  },
  {
    id: uuidv4(),
    name: 'Nikhil Deshmukh',
    phone: '+919654321987',
    lat: 18.5150,
    lng: 73.8600,
  },
  {
    id: uuidv4(),
    name: 'Kiran Jadhav',
    phone: '+919543219876',
    lat: 18.5250,
    lng: 73.8490,
  },
];

const users = [
  {
    id: uuidv4(),
    name: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    phone: '+919012345678',
  },
  {
    id: uuidv4(),
    name: 'Arjun Mehta',
    email: 'arjun.mehta@example.com',
    phone: '+919098765432',
  },
];

const seed = async () => {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting database seed...\n');

    // ── Users ──────────────────────────────────────────────────────────────
    console.log('👤 Inserting users...');
    for (const u of users) {
      await client.query(
        `INSERT INTO users (user_id, name, email, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [u.id, u.name, u.email, u.phone]
      );
      console.log(`   ✅ ${u.name} (${u.email})`);
    }

    // ── Restaurants ────────────────────────────────────────────────────────
    console.log('\n🍽️  Inserting restaurants...');
    for (const r of restaurants) {
      await client.query(
        `INSERT INTO restaurants (restaurant_id, name, location_lat, location_lng, availability_status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [r.id, r.name, r.lat, r.lng, r.available]
      );
      console.log(`   ✅ ${r.name} [${r.available ? 'OPEN' : 'CLOSED'}]`);
    }

    // ── Drivers ────────────────────────────────────────────────────────────
    console.log('\n🚴 Inserting drivers...');
    for (const d of drivers) {
      await client.query(
        `INSERT INTO drivers (driver_id, name, phone, location_lat, location_lng, status)
         VALUES ($1, $2, $3, $4, $5, 'available')
         ON CONFLICT DO NOTHING`,
        [d.id, d.name, d.phone, d.lat, d.lng]
      );
      console.log(`   ✅ ${d.name} – ${d.phone} [AVAILABLE]`);
    }

    console.log('\n🎉 Seed completed successfully!\n');
    console.log('─────────────────────────────────────────────────');
    console.log(`Users:       ${users.length}`);
    console.log(`Restaurants: ${restaurants.length}`);
    console.log(`Drivers:     ${drivers.length}`);
    console.log('─────────────────────────────────────────────────\n');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
