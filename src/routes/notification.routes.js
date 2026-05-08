const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * GET /api/notifications/:user_id
 * Returns last 20 notifications for user, newest first.
 */
router.get('/:user_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.params.user_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /notifications/:user_id error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * PATCH /api/notifications/:notification_id/read
 * Marks notification as read.
 */
router.patch('/:notification_id/read', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE 
       WHERE notification_id = $1 
       RETURNING *`,
      [req.params.notification_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ message: 'Notification marked as read', notification: result.rows[0] });
  } catch (err) {
    console.error('PATCH /notifications/:id/read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

module.exports = router;
