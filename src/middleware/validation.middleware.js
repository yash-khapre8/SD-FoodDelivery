/**
 * Validation Middleware
 * Plain JS input validation for API endpoints.
 */

const validateOrderPlacement = (req, res, next) => {
  const { user_id, restaurant_id, items } = req.body;

  if (!user_id || !restaurant_id) {
    return res.status(400).json({ error: 'user_id and restaurant_id are required' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  for (const item of items) {
    if (!item.item_name || item.quantity == null || item.price == null) {
      return res.status(400).json({
        error: 'Each item must have item_name, quantity, and price',
      });
    }
    if (item.quantity <= 0) {
      return res.status(400).json({ error: `Invalid quantity for ${item.item_name}. Must be > 0.` });
    }
    if (item.price <= 0) {
      return res.status(400).json({ error: `Invalid price for ${item.item_name}. Must be > 0.` });
    }
  }

  next();
};

const validateOrderStatusUpdate = (req, res, next) => {
  const { new_status } = req.body;
  const validStatuses = ['placed', 'confirmed', 'preparing', 'picked', 'delivered', 'cancelled'];

  if (!new_status) {
    return res.status(400).json({ error: 'new_status is required' });
  }

  if (!validStatuses.includes(new_status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  next();
};

module.exports = {
  validateOrderPlacement,
  validateOrderStatusUpdate,
};
