const express = require('express');
const router = express.Router();
const DriverModel = require('../models/driver');
const NotificationService = require('../services/notification.service');
const redisClient = require('../config/redis');

// ─── Redis cache key & TTL ────────────────────────────────────────────────────
const AVAILABLE_DRIVERS_KEY = 'drivers:available';
const AVAILABLE_DRIVERS_TTL = 10; // seconds

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drivers
// Get all drivers (admin view, no caching).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const drivers = await DriverModel.getAllDrivers();
    return res.json(drivers);
  } catch (err) {
    console.error('GET /api/drivers error:', err);
    return res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drivers/available
// Returns all available drivers with their current location.
// Redis-cached under key "drivers:available" with TTL 10 seconds.
// Must be declared before /:driver_id to avoid param clash.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/available', async (req, res) => {
  try {
    // 1. Check Redis cache
    const cached = await redisClient.get(AVAILABLE_DRIVERS_KEY);
    if (cached) {
      console.log('⚡ Cache HIT: drivers:available');
      return res.json(JSON.parse(cached));
    }

    console.log('🔍 Cache MISS: drivers:available — querying DB');

    // 2. Query DB
    const drivers = await DriverModel.getAvailableDrivers();

    // 3. Populate cache (fire-and-forget, don't block response on Redis errors)
    redisClient
      .setEx(AVAILABLE_DRIVERS_KEY, AVAILABLE_DRIVERS_TTL, JSON.stringify(drivers))
      .catch((err) => console.warn('⚠️  Redis cache set failed (drivers:available):', err.message));

    return res.json(drivers);
  } catch (err) {
    console.error('GET /api/drivers/available error:', err);
    return res.status(500).json({ error: 'Failed to fetch available drivers' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drivers/:driver_id
// Get a single driver by ID.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:driver_id', async (req, res) => {
  try {
    const driver = await DriverModel.getDriverById(req.params.driver_id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    return res.json(driver);
  } catch (err) {
    console.error('GET /api/drivers/:driver_id error:', err);
    return res.status(500).json({ error: 'Failed to fetch driver' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drivers/:driver_id/location
// Update a driver's GPS coordinates.
//   - Persists lat/lng to the DB.
//   - Invalidates the "drivers:available" Redis cache (location data stale).
//   - Emits Socket.IO event "driver_location_update" for real-time map tracking.
// Body: { lat, lng }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:driver_id/location', async (req, res) => {
  try {
    const { driver_id } = req.params;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'lat and lng must be valid numbers' });
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: 'lat must be −90..90 and lng must be −180..180' });
    }

    // Persist to DB
    const driver = await DriverModel.updateDriverLocation(driver_id, latNum, lngNum);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    // Invalidate cached available-drivers list (location data now stale)
    await redisClient.del(AVAILABLE_DRIVERS_KEY);
    console.log('🗑️  Cache invalidated: drivers:available (location update)');

    // Emit real-time location update to all connected clients (map tracking)
    NotificationService.broadcastDriverLocation(driver_id, { lat: latNum, lng: lngNum });

    return res.json({
      message: 'Location updated',
      driver_id,
      location: { lat: latNum, lng: lngNum },
    });
  } catch (err) {
    console.error('POST /api/drivers/:driver_id/location error:', err);
    return res.status(500).json({ error: 'Failed to update driver location' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/drivers/:driver_id/status
// Manually update driver availability status.
// Body: { status: 'available' | 'busy' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:driver_id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['available', 'busy'].includes(status)) {
      return res.status(400).json({ error: "status must be 'available' or 'busy'" });
    }

    const driver = await DriverModel.updateDriverStatus(req.params.driver_id, status);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    // Invalidate available-drivers cache on any status change
    await redisClient.del(AVAILABLE_DRIVERS_KEY);

    return res.json({ message: 'Driver status updated', driver });
  } catch (err) {
    console.error('PATCH /api/drivers/:driver_id/status error:', err);
    return res.status(500).json({ error: 'Failed to update driver status' });
  }
});

module.exports = router;
