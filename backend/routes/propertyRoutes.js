const express = require('express');
const router = express.Router();
const { getProperties, createProperty, updateProperty, deleteProperty } = require('../controllers/propertyController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Route: GET /api/properties
// Access: Anyone who is logged in can view properties
router.get('/', protect, getProperties);

// Route: POST /api/properties
// Access: Only Admins and Property Managers can create listings
router.post('/', protect, authorize('Admin', 'Property Manager'), createProperty);
router.route('/:id')
  .put(protect, authorize('Admin', 'Property Manager'), updateProperty)
  .delete(protect, authorize('Admin'), deleteProperty);

module.exports = router;