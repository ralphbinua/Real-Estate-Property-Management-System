const express = require('express');
const router = express.Router();
const { getProperties, createProperty } = require('../controllers/propertyController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Route: GET /api/properties
// Access: Anyone who is logged in can view properties
router.get('/', protect, getProperties);

// Route: POST /api/properties
// Access: Only Admins and Property Managers can create listings
router.post('/', protect, authorize('Admin', 'Property Manager'), createProperty);

module.exports = router;